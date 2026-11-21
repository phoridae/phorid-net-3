import { useOutletContext } from "react-router-dom";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Card, Empty, Input, Modal, Space, Table, Tag, Typography } from "antd";
import { lookupGbifSpecimens, searchTaxonomySpecimens, fetchWorkspaceSpecimens } from "../../utils/api/taxonomy";
import { speciesName } from "./SpeciesManager";
import SpecimenEditor, { CreateSpecimenForm, specimenIdentity } from "./SpecimenEditor";
import useDebouncedSearch from "./useDebouncedSearch";

const { Title, Paragraph, Text } = Typography;

function AddSpecimen({ workspace, onClose, onCreated, onOpen }) {
  const [mode, setMode] = useState("find");
  const [query, setQuery] = useState("");
  const [candidate, setCandidate] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const workspaceId = workspace?.id;
  const cachedSpecimens = useCallback((q, options) => lookupGbifSpecimens(q, "cache", { ...options, workspaceId }), [workspaceId]);
  const globalSpecimens = useCallback((q, options) => searchTaxonomySpecimens(q, { ...options, workspaceId }), [workspaceId]);
  const registry = useDebouncedSearch(query, globalSpecimens, { enabled: mode === "find", reload });
  const cache = useDebouncedSearch(query, cachedSpecimens, { enabled: mode === "find", reload });
  const [live, setLive] = useState({ data: null, loading: false, error: "" });
  const liveRequest = useRef(null);
  useEffect(() => {
    setLive({ data: null, loading: false, error: "" });
    return () => liveRequest.current?.abort();
  }, [query, mode]);
  async function searchLive() {
    liveRequest.current?.abort();
    const controller = new AbortController(); liveRequest.current = controller;
    setLive({ data: null, loading: true, error: "" });
    try {
      const data = await lookupGbifSpecimens(query.trim(), "live_gbif", { signal: controller.signal, workspaceId });
      if (!controller.signal.aborted) setLive({ data, loading: false, error: "" });
    } catch (failure) {
      if (!controller.signal.aborted) setLive({ data: null, loading: false, error: failure.message });
    }
  }
  const candidates = new Map((cache.data?.results || []).map((record) => [record.gbif_occurrence_key, record]));
  for (const record of live.data?.results || []) candidates.set(record.gbif_occurrence_key, record);
  // Registry rows take precedence when the same occurrence is also in GBIF.
  const registryKeys = new Set((registry.data || []).map((record) => record.gbif_occurrence_key).filter(Boolean));
  for (const key of registryKeys) candidates.delete(key);
  const inWorkspace = (record) => !!workspace && String(record.workspace_identification?.workspace_id) === String(workspace.id);
  const existingAction = (record) => workspace && !inWorkspace(record) ? "Use specimen in this workspace" : "Open existing specimen";
  const availability = (record) => <><Tag>Already in Phorid.net</Tag>{workspace && <div>{inWorkspace(record) ? "Already in this workspace" : `No identification yet in ${workspace.name}`}</div>}</>;
  const exact = (live.data || cache.data)?.query_type === "occurrence_key";
  return <Modal open title="Add specimen" width={1000} footer={null} closable={!busy} maskClosable={!busy} onCancel={() => { if (!busy) onClose(); }}>
    <Paragraph>Find a real specimen or voucher, or enter a specimen manually. Specimens are global records. Identifications belong to individual workspaces. Identifying a specimen automatically includes its species in that workspace.</Paragraph>
    {!candidate && <Space wrap style={{ marginBottom: 24 }}>
      <Button disabled={busy} type={mode === "find" ? "primary" : "default"} onClick={() => setMode("find")}>Find specimen</Button>
      <Button disabled={busy} type={mode === "manual" ? "primary" : "default"} onClick={() => setMode("manual")}>Create manually</Button>
    </Space>}
    {mode === "manual" ? <CreateSpecimenForm key={workspace?.id || "global"} workspace={workspace} onCreated={onCreated} onOpen={onOpen} onBusyChange={setBusy} /> : candidate ? <>
      <Button disabled={busy} onClick={() => setCandidate(null)}>Back to specimen results</Button>
      <Title level={4}>{specimenIdentity(candidate)}</Title>
      <Paragraph>{candidate.scientific_name} · {[candidate.locality, candidate.country].filter(Boolean).join(", ")}</Paragraph>
      <Paragraph>GBIF {candidate.gbif_occurrence_key} · {candidate.basis_of_record}</Paragraph>
      <CreateSpecimenForm key={workspace?.id || "global"} workspace={workspace} candidate={candidate} onCreated={onCreated} onOpen={onOpen} onBusyChange={setBusy} />
    </> : <>
      <label htmlFor="find-specimen">Find specimen</label>
      <Input id="find-specimen" placeholder="e.g. LACM wellsorum, USNM 12345, or a GBIF occurrence key" maxLength={200} value={query} onChange={(event) => setQuery(event.target.value)} />
      <Paragraph type="secondary">Search existing global Phorid.net vouchers and the local GBIF snapshot. Reuse existing vouchers; use current GBIF for newer or missing records.</Paragraph>
      <Title level={5}>Existing global Phorid.net specimens</Title>
      {registry.error && <Alert type="error" message={registry.error} action={<Button onClick={() => setReload((value) => value + 1)}>Retry global search</Button>} />}
      <Table rowKey="id" size="small" dataSource={registry.data || []} loading={registry.loading} pagination={{ pageSize: 5 }} scroll={{ x: 800 }} locale={{ emptyText: query.trim() ? "No global vouchers match this search." : "Enter specimen search terms." }} columns={[
        { title: "Global voucher", render: (_, record) => <><Text strong>{specimenIdentity(record)}</Text>{record.specimen_label && <div>{record.specimen_label}</div>}{record.gbif_occurrence_key && <div>GBIF {record.gbif_occurrence_key}</div>}</> },
        { title: "GBIF accepted name — local snapshot", render: (_, record) => record.external_taxonomy?.accepted_scientific_name || record.external_taxonomy?.species || "—" },
        { title: "Availability", render: (_, record) => availability(record) },
        { title: "Action", render: (_, record) => <Button onClick={() => onOpen(record.id)}>{existingAction(record)}</Button> },
      ]} />
      <Title level={5}>GBIF specimen candidates</Title>
      {cache.error && <Alert type="error" message={cache.error} action={<Button onClick={() => setReload((value) => value + 1)}>Retry cache search</Button>} />}
      <Button style={{ margin: "12px 0" }} type={query.trim() && !candidates.size ? "primary" : "default"} disabled={!query.trim() || live.loading} loading={live.loading} onClick={searchLive}>Search current GBIF</Button>
      {live.error && <Alert type="error" message={live.error} description="Cached results remain available. You can also create a specimen manually." />}
      {exact && <Paragraph>Exact GBIF occurrence-key lookup.</Paragraph>}
      <Table rowKey="gbif_occurrence_key" size="small" dataSource={[...candidates.values()]} loading={cache.loading || live.loading} pagination={{ pageSize: 5 }} scroll={{ x: 800 }} locale={{ emptyText: query.trim() ? "No useful specimen matches. Search current GBIF or create manually." : "Enter specimen search terms." }} columns={[
        { title: "Specimen identity", render: (_, record) => <><Text strong>{specimenIdentity(record)}</Text><br />{record.scientific_name}<br /><Text type="secondary">{[record.locality, record.country].filter(Boolean).join(", ")}</Text><br /><Text type="secondary">GBIF {record.gbif_occurrence_key}</Text></> },
        { title: "Evidence / source", render: (_, record) => <><Tag>{record.basis_of_record}</Tag><Tag>{record.source === "cache" ? "Local GBIF cache" : "Current GBIF"}</Tag>{record.recorded_by && <div>Recorded by: {record.recorded_by}</div>}{record.event_date && <div>{record.event_date}</div>}</> },
        { title: "Availability", render: (_, record) => record.existing_specimen_id ? availability(record) : <Tag>Available to import</Tag> },
        { title: "Action", render: (_, record) => <Button onClick={() => record.existing_specimen_id ? onOpen(record.existing_specimen_id) : setCandidate(record)}>{record.existing_specimen_id ? existingAction(record) : "Select specimen"}</Button> },
      ]} />
    </>}
  </Modal>;
}

export default function SpecimenManager() {
  const { currentWorkspace = null } = useOutletContext() || {};
  const [query, setQuery] = useState("");
  const [reload, setReload] = useState(0);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [notice, setNotice] = useState("");
  const workspaceId = currentWorkspace?.id;
  const loadSpecimens = useCallback(async (q, options) => ({ workspaceId, rows: await fetchWorkspaceSpecimens(workspaceId, q, options) }), [workspaceId]);
  const search = useDebouncedSearch(query, loadSpecimens, { enabled: !!workspaceId, minLength: 0, reload });
  const specimens = workspaceId && search.data?.workspaceId === workspaceId ? search.data.rows : [];
  const open = (id) => { setAdding(false); setEditingId(id); };
  return <Card>
    <Space wrap style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
      <Title level={3} style={{ margin: 0 }}>{currentWorkspace ? `Specimens in ${currentWorkspace.name}` : "Specimens"}</Title>
      <Button type="primary" onClick={() => setAdding(true)}>Add specimen</Button>
    </Space>
    <Paragraph>{currentWorkspace ? "These are global specimen records currently being interpreted in this workspace." : "Select a workspace to see specimens currently interpreted there. Use Add specimen to search the global registry."}</Paragraph>
    {notice && <Alert type="success" message={notice} style={{ marginBottom: 16 }} />}
    <Input disabled={!workspaceId} aria-label="Search curated specimens" placeholder="Search specimens interpreted in this workspace" maxLength={200} value={query} onChange={(event) => setQuery(event.target.value)} />
    <Paragraph type="secondary">Global vouchers interpreted in the selected workspace · first 30 matches. Add specimen searches the global registry.</Paragraph>
    {search.error && <Alert type="error" message={search.error} action={<Button onClick={() => setReload((value) => value + 1)}>Retry search</Button>} />}
    <Table rowKey="id" size="small" dataSource={specimens || []} loading={search.loading} pagination={{ pageSize: 10 }} scroll={{ x: 1000 }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={currentWorkspace ? "No specimens are currently interpreted in this workspace matching this search. Use Add specimen to find a global voucher." : "No workspace selected"} /> }} columns={[
      { title: "Record ID", dataIndex: "id" }, { title: "Institution / collection / catalog", render: (_, row) => [row.institution_code, row.collection_code, row.catalog_number].some((value) => value?.trim()) ? specimenIdentity(row) : null }, { title: "Specimen label", dataIndex: "specimen_label" },
      { title: currentWorkspace ? `Identification in ${currentWorkspace.name}` : "Workspace identification", render: (_, row) => {
        const identification = String(row.workspace_identification?.workspace_id) === String(workspaceId) ? row.workspace_identification : null;
        return !currentWorkspace ? "No workspace selected" : identification ? <>{speciesName(identification.species)}<br /><Tag>{identification.species.species_status === "work_in_progress" ? "WIP" : "Published"}</Tag></> : "No identification in this workspace";
      } },
      { title: "GBIF accepted name — local snapshot", render: (_, row) => row.external_taxonomy?.accepted_scientific_name || row.external_taxonomy?.species || "—" },
      { title: "Reference type", dataIndex: "reference_type" }, { title: "GBIF occurrence", dataIndex: "gbif_occurrence_key", render: (value) => value || "—" },
      { title: "Action", render: (_, row) => <Button onClick={() => open(row.id)}>View/edit specimen</Button> },
    ]} />
    {adding && <AddSpecimen key={workspaceId || "global"} workspace={currentWorkspace} onClose={() => setAdding(false)} onOpen={open} onCreated={({ specimen, created }) => { setAdding(false); setNotice(created ? `Specimen #${specimen.id} created.` : `Specimen #${specimen.id} is already in the taxonomy database. Global voucher identity is unchanged.`); setReload((value) => value + 1); open(specimen.id); }} />}
    {editingId && <SpecimenEditor key={`${editingId}:${workspaceId || "global"}`} id={editingId} workspace={currentWorkspace} onClose={() => setEditingId(null)} onSaved={() => { setEditingId(null); setNotice("Specimen saved. Existing observations and evidence are unchanged."); setReload((value) => value + 1); }} />}
  </Card>;
}
