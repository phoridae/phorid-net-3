import React, { useEffect, useState } from "react";
import { Alert, Button, Card, Checkbox, Empty, Form, Input, Modal, Popconfirm, Select, Space, Spin, Table, Tag, Typography } from "antd";
import { useOutletContext } from "react-router-dom";
import { addWorkspaceSpecies, createTaxonomySpecies, fetchWorkspaceSpecies, importWorkspaceSpecies, lookupTaxonomyTaxa, removeWorkspaceSpecies, searchTaxonomySpecies } from "../../utils/api/taxonomy";

const { Title, Paragraph, Text } = Typography;
export function speciesName(species) {
  const name = `${species.genus}${species.specific_epithet ? ` ${species.specific_epithet}` : ` sp.${species.working_name ? ` ${species.working_name}` : ""}`}`;
  return species.specific_epithet && species.working_name ? `${name} (${species.working_name})` : name;
}
const externalSpecies = (q, options) => lookupTaxonomyTaxa(q, "SPECIES", options);
const externalGenera = (q, options) => lookupTaxonomyTaxa(q, "GENUS", options);

// Names are suggestions, not identity. Keep linked external hits in the curated list,
// even when the curated search did not return them (for example, after a name change).
export function groupSpeciesSearchResults(local, external, members = []) {
  const curated = new Map(local.map((species) => [String(species.id), { ...species }]));
  const known = [...local, ...members];
  const externalOnly = [];
  for (const taxon of external) {
    const linkedId = taxon.existing_species_id ?? taxon.local_species_id;
    const existing = linkedId != null
      ? known.find((species) => String(species.id) === String(linkedId))
      : known.find((species) => ["col_xr_taxon_key", "gbif_taxon_key"].some((field) =>
        taxon[field] != null && species[field] != null && String(taxon[field]) === String(species[field])));
    const id = existing?.id ?? linkedId;
    if (id == null) {
      externalOnly.push(taxon);
      continue;
    }
    const species = curated.get(String(id)) || existing || {
      id, genus: taxon.genus, specific_epithet: taxon.specific_epithet,
    };
    curated.set(String(id), {
      ...species,
      col_xr_taxon_key: species.col_xr_taxon_key ?? taxon.col_xr_taxon_key,
      gbif_taxon_key: species.gbif_taxon_key ?? taxon.gbif_taxon_key,
    });
  }
  return { curated: [...curated.values()], externalOnly };
}

// Reset stale results immediately; abort and ignore responses after query/context changes.
function useSearch(query, loader) {
  const [state, setState] = useState({ data: [], loading: false, error: "" });
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const q = query.trim();
    setState({ data: [], loading: q.length >= 2, error: "" });
    if (q.length < 2) return () => controller.abort();
    const timer = setTimeout(async () => {
      try {
        const data = await loader(q, { signal: controller.signal });
        if (active) setState({ data, loading: false, error: "" });
      } catch (failure) {
        if (active && failure.name !== "AbortError") setState({ data: [], loading: false, error: failure.message });
      }
    }, 350);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [query, loader]);
  return state;
}

async function ensureMembership(workspaceId, speciesId) {
  try { await addWorkspaceSpecies(workspaceId, speciesId); }
  catch (failure) {
    if (failure.status !== 409) throw failure;
    const current = await fetchWorkspaceSpecies(workspaceId);
    if (!current.some((species) => species.id === speciesId)) throw failure;
  }
}

function AddSpecies({ workspace, members, onClose, onAdded }) {
  const [mode, setMode] = useState("external");
  const [query, setQuery] = useState("");
  const [genusQuery, setGenusQuery] = useState("");
  const [manualGenus, setManualGenus] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [matches, setMatches] = useState([]);
  const [pendingValues, setPendingValues] = useState(null);
  const [createdSpecies, setCreatedSpecies] = useState(null);
  const [form] = Form.useForm();
  const local = useSearch(mode === "external" ? query : "", searchTaxonomySpecies);
  const external = useSearch(mode === "external" ? query : "", externalSpecies);
  const genera = useSearch(mode === "manual" && !manualGenus ? genusQuery : "", externalGenera);
  const memberIds = new Set(members.map((species) => String(species.id)));
  const searchResults = groupSpeciesSearchResults(local.data, external.data, members);

  async function attachExisting(species) {
    setBusy(true); setError("");
    try { await ensureMembership(workspace.id, species.id); onAdded(speciesName(species)); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function importExternal(taxon) {
    setBusy(true); setError("");
    try {
      const result = await importWorkspaceSpecies(workspace.id, taxon.col_xr_taxon_key);
      onAdded(speciesName(result.species));
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function createManual(values) {
    setBusy(true); setError("");
    try {
      const species = createdSpecies || await createTaxonomySpecies(values);
      setCreatedSpecies(species);
      await ensureMembership(workspace.id, species.id);
      onAdded(speciesName(species));
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function checkManual(values) {
    setBusy(true); setError("");
    const normalized = { ...values, genus: values.genus.trim(), specific_epithet: values.specific_epithet?.trim() || null,
      working_name: values.working_name?.trim() || null, notes: values.notes || null };
    try {
      const existing = await searchTaxonomySpecies(`${normalized.genus} ${normalized.specific_epithet || normalized.working_name || ""}`);
      if (existing.length) { setMatches(existing); setPendingValues(normalized); }
      else await createManual(normalized);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  function curatedRows(species) {
    return species.map((row) => ({ ...row, key: row.id }));
  }
  const localColumns = [
    { title: "Scientific / working name", render: (_, row) => speciesName(row) },
    ...(mode === "external" ? [{ title: "Identifiers", render: (_, row) => <>COL XR: {row.col_xr_taxon_key || "—"}<br />GBIF Backbone: {row.gbif_taxon_key || "—"}</> }] : []),
    { title: "Availability", render: (_, row) => <Tag>{mode === "manual" && memberIds.has(String(row.id)) ? "Already in workspace" : "In taxonomy database"}</Tag> },
    { title: "Action", render: (_, row) => <Button disabled={busy || memberIds.has(String(row.id))} onClick={() => attachExisting(row)}>{mode === "manual" ? "Use existing species" : memberIds.has(String(row.id)) ? "Already in workspace" : "Add to workspace"}</Button> },
  ];

  return (
    <Modal open title="Add species" width={1000} footer={null} onCancel={() => { if (!busy) onClose(); }} maskClosable={!busy} closable={!busy}>
      <Paragraph>Species are global records. This adds a species to the working context of {workspace.name}.</Paragraph>
      <Space wrap style={{ marginBottom: 24 }}>
        <Button type={mode === "external" ? "primary" : "default"} disabled={busy || !!createdSpecies} onClick={() => { setMode("external"); setError(""); }}>Find in GBIF / Catalogue of Life</Button>
        <Button type={mode === "manual" ? "primary" : "default"} disabled={busy || !!createdSpecies} onClick={() => { setMode("manual"); setError(""); }}>Create working taxon manually</Button>
      </Space>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      {mode === "external" ? (
        <>
          <Input aria-label="Find species" placeholder="Search a genus or species name (at least 2 characters)" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={200} />
          <Paragraph type="secondary">Phoridae species from COL XR. Accepted species can be imported; legacy Backbone keys are resolved when adding. First 30 matches; refine your search if needed.</Paragraph>
          <Title level={5}>Curated global species</Title>
          {local.error && <Alert type="error" message={local.error} />}
          <Table size="small" dataSource={curatedRows(searchResults.curated)} columns={localColumns} loading={local.loading} pagination={{ pageSize: 5 }} scroll={{ x: 800 }} locale={{ emptyText: query.trim().length < 2 ? "Type a name to find reusable global species." : "No curated species match this search." }} />
          <Title level={5}>GBIF / Catalogue of Life</Title>
          {external.error && <Alert type="error" message={external.error} />}
          <Table size="small" rowKey="col_xr_taxon_key" dataSource={searchResults.externalOnly} loading={external.loading} pagination={{ pageSize: 5 }} scroll={{ x: 800 }}
            locale={{ emptyText: query.trim().length < 2 ? "Type a name to search COL XR." : "No additional external-only Phoridae matches found." }}
            columns={[
              { title: "Name", render: (_, taxon) => <><Text strong>{taxon.canonical_name}</Text><br /><Text type="secondary">{taxon.rank} · {taxon.taxonomic_status}</Text>{taxon.accepted_name && <div>Accepted: {taxon.accepted_name}</div>}<div>{taxon.genus} {taxon.specific_epithet}</div></> },
              { title: "Identifiers", render: (_, taxon) => <>COL XR: {taxon.col_xr_taxon_key}<br />GBIF Backbone: {taxon.gbif_taxon_key || "Not yet resolved"}</> },
              { title: "Availability", render: () => <Tag>GBIF/COL</Tag> },
              { title: "Action", render: (_, taxon) => <Button disabled={busy || !taxon.importable} onClick={() => importExternal(taxon)}>Import and add</Button> },
            ]} />
        </>
      ) : (
        <>
          <Form form={form} layout="vertical" initialValues={{ species_status: "work_in_progress" }} onFinish={checkManual} disabled={busy || !!createdSpecies} onValuesChange={() => { setMatches([]); setPendingValues(null); }}>
            <Checkbox checked={manualGenus} disabled={busy || !!createdSpecies} onChange={(event) => { setManualGenus(event.target.checked); form.setFieldValue("genus", undefined); setGenusQuery(""); setMatches([]); setPendingValues(null); }}>Enter genus manually</Checkbox>
            <Form.Item name="genus" label="Genus" rules={[{ required: true, whitespace: true, message: "Choose or enter a genus." }, { max: 128 }]}>
              {manualGenus ? <Input placeholder="New or provisional genus" maxLength={128} /> : <Select showSearch filterOption={false} onSearch={setGenusQuery} placeholder="Search GBIF/COL genera" loading={genera.loading}
                options={[...new Set(genera.data.filter((taxon) => taxon.taxonomic_status === "ACCEPTED").map((taxon) => taxon.genus))].map((name) => ({ value: name, label: name }))}
                notFoundContent={genera.loading ? <Spin size="small" /> : "Search a Phoridae genus, or enter genus manually."} />}
            </Form.Item>
            {genera.error && !manualGenus && <Alert type="error" message={genera.error} description="You may enter the genus manually." />}
            <Form.Item name="species_status" label="Species status"><Select options={[{ value: "work_in_progress", label: "Work in progress" }, { value: "published", label: "Published" }]} /></Form.Item>
            <Form.Item name="specific_epithet" label="Specific epithet" dependencies={["species_status"]} rules={[{ max: 128 }, ({ getFieldValue }) => ({ validator: (_, value) => getFieldValue("species_status") === "published" && !value?.trim() ? Promise.reject(new Error("Published species require a specific epithet.")) : Promise.resolve() })]}><Input maxLength={128} /></Form.Item>
            <Form.Item name="working_name" label="Working / code name" dependencies={["species_status", "specific_epithet"]} rules={[{ max: 255 }, ({ getFieldValue }) => ({ validator: (_, value) => getFieldValue("species_status") === "work_in_progress" && !getFieldValue("specific_epithet")?.trim() && !value?.trim() ? Promise.reject(new Error("Enter a meaningful working name for an undescribed taxon.")) : Promise.resolve() })]}><Input placeholder="e.g. AZ-17" maxLength={255} /></Form.Item>
            <Form.Item name="notes" label="Notes"><Input.TextArea rows={3} /></Form.Item>
            <Button htmlType="submit" type="primary" loading={busy} disabled={!!createdSpecies}>Check and add species</Button>
          </Form>
          {pendingValues && !createdSpecies && <div style={{ marginTop: 24 }}><Alert type="warning" message="Potential existing global species found" description="Use an existing species, or explicitly create a separate record if these represent a different taxon." /><Table size="small" dataSource={curatedRows(matches)} columns={localColumns} pagination={{ pageSize: 5 }} scroll={{ x: 620 }} /><Button disabled={busy} onClick={() => createManual(pendingValues)}>Create separate global record</Button></div>}
          {createdSpecies && <Alert style={{ marginTop: 16 }} type="info" message="The global species record has been created." description="Retry adding this existing record to the workspace; a second global record will not be created." action={<Button disabled={busy} onClick={() => attachExisting(createdSpecies)}>Retry adding to workspace</Button>} />}
        </>
      )}
    </Modal>
  );
}

function WorkspaceSpecies({ workspace }) {
  const [species, setSpecies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    setLoading(true); setError("");
    fetchWorkspaceSpecies(workspace.id, { signal: controller.signal }).then((rows) => { if (active) setSpecies(rows); })
      .catch((failure) => { if (active && failure.name !== "AbortError") setError(failure.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [workspace.id, reload]);
  async function remove(row) {
    setRemoving(row.id); setError(""); setNotice("");
    try { await removeWorkspaceSpecies(workspace.id, row.id); setNotice(`${speciesName(row)} removed from workspace. The global species record remains.`); setReload((value) => value + 1); }
    catch (failure) { setError(failure.message); }
    finally { setRemoving(null); }
  }
  return (
    <Card>
      <Space wrap style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Species in this workspace</Title>
        <Button type="primary" onClick={() => setAdding(true)} disabled={loading || !!error}>Add species</Button>
      </Space>
      <Paragraph>Global species records selected for {workspace.name}. A species can be used in many workspaces.</Paragraph>
      {notice && <Alert type="success" message={notice} style={{ marginBottom: 16 }} />}
      {error && <Alert type="error" message={error} action={<Button onClick={() => setReload((value) => value + 1)}>Retry</Button>} style={{ marginBottom: 16 }} />}
      <Table rowKey="id" dataSource={species} loading={loading} pagination={{ pageSize: 10 }} scroll={{ x: 850 }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No species have been selected for this workspace yet." /> }} columns={[
        { title: "Scientific / working name", render: (_, row) => speciesName(row) },
        { title: "Status", render: (_, row) => <Tag>{row.species_status === "published" ? "Published" : "Work in progress"}</Tag> },
        { title: "GBIF Backbone", dataIndex: "gbif_taxon_key", render: (value) => value || "—" },
        { title: "COL XR", dataIndex: "col_xr_taxon_key", render: (value) => value || "—" },
        { title: "Descriptions", render: (_, row) => row.descriptions?.length || 0 },
        { title: "Actions", render: (_, row) => <Popconfirm title="Remove species from workspace?" description={row.descriptions?.length ? "This also removes this workspace's descriptions and their observation data. Global species and specimens remain. This species will not be removed from other workspaces. Keys may prevent removal." : "The global species record will remain available. This species will not be removed from other workspaces."} onConfirm={() => remove(row)}><Button danger disabled={removing !== null || loading} loading={removing === row.id}>Remove from workspace</Button></Popconfirm> },
      ]} />
      {adding && <AddSpecies workspace={workspace} members={species} onClose={() => setAdding(false)} onAdded={(name) => { setAdding(false); setNotice(`${name} added to workspace.`); setReload((value) => value + 1); }} />}
    </Card>
  );
}

export default function SpeciesManager() {
  const { currentWorkspace } = useOutletContext();
  return currentWorkspace ? <WorkspaceSpecies key={currentWorkspace.id} workspace={currentWorkspace} /> : null;
}
