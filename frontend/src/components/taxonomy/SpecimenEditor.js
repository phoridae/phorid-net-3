import { normalizeSpecimenIdentity } from "../../utils/specimenIdentity";
import React, { useEffect, useState } from "react";
import { Alert, Button, Checkbox, Drawer, Form, Input, Space, Spin, Table, Tag, Typography } from "antd";
import { createTaxonomySpecimen, fetchTaxonomySpecimen, findSpecimenDuplicates, importTaxonomySpecimen, updateTaxonomySpecimen, putWorkspaceSpecimenIdentification, fetchSpecimenExternalTaxonomy } from "../../utils/api/taxonomy";
import SpeciesPicker from "./SpeciesPicker";
import { speciesName } from "./SpeciesManager";

const { Paragraph, Text, Title } = Typography;
export const specimenIdentity = (row) => Object.values(normalizeSpecimenIdentity(row)).filter(Boolean).join(" ") || row.specimen_label || `Specimen ${row.id || "(identity not supplied)"}`;
const externalChoice = "__gbif_suggestion__";

function SourceIdentity({ specimen }) {
  const identity = normalizeSpecimenIdentity(specimen);
  return <section aria-label="Voucher identity — from GBIF" style={{ marginBottom: 24 }}>
    <Title level={5}>Voucher identity — from GBIF</Title>
    <dl><dt>Institution</dt><dd>{identity.institution_code || "—"}</dd>
      <dt>Collection</dt><dd>{identity.collection_code || "—"}</dd>
      <dt>Catalog number</dt><dd>{identity.catalog_number || "—"}</dd>
      <dt>GBIF occurrence key</dt><dd>{specimen.gbif_occurrence_key || "—"}</dd></dl>
    <Text type="secondary">Source identity metadata is read-only in Phorid.net.</Text>
  </section>;
}
function VoucherFields({ source }) {
  return <>
    {source ? <SourceIdentity specimen={source} /> : <>
      <Form.Item name="institution_code" label="Institution code" rules={[{ max: 64 }]}><Input maxLength={64} /></Form.Item>
      <Form.Item name="collection_code" label="Collection code" rules={[{ max: 64 }]}><Input maxLength={64} /></Form.Item>
      <Form.Item name="catalog_number" label="Catalog number" rules={[{ max: 128 }]}><Input maxLength={128} /></Form.Item>
    </>}
    <Form.Item name="specimen_label" label="Specimen label" rules={[{ max: 255 }]}><Input maxLength={255} /></Form.Item>
    <Form.Item name="notes" label="Voucher notes"><Input.TextArea rows={3} maxLength={16000} /></Form.Item>
  </>;
}
const metadata = (values, includeIdentity = true) => ({ ...(includeIdentity ? normalizeSpecimenIdentity(values) : {}), specimen_label: values.specimen_label?.trim() || null, notes: values.notes?.trim() || null });
function IdentificationPicker({ workspace, species }) {
  return <Form.Item name="species_id" label={`Identification in ${workspace.name}`} rules={[{ required: true, message: "Choose a published or WIP species for this workspace." }]}>
    <SpeciesPicker ariaLabel={`Identification in ${workspace.name}`} initialSpecies={species} />
  </Form.Item>;
}
export function CreateSpecimenForm({ workspace, candidate, onCreated, onOpen, onBusyChange }) {
  const [form] = Form.useForm();
  const suggestion = candidate?.species_suggestion || (candidate?.genus && candidate?.specific_epithet ? {
    id: externalChoice, genus: candidate.genus, specific_epithet: candidate.specific_epithet, species_status: "published",
  } : null);
  const [identify, setIdentify] = useState(!!workspace);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [duplicates, setDuplicates] = useState([]);
  const [pending, setPending] = useState(null);
  async function create(values, separate = false) {
    setBusy(true); onBusyChange(true); setError("");
    try {
      const body = metadata(values, !candidate);
      if (!candidate && !separate && body.catalog_number) {
        const matches = await findSpecimenDuplicates({ catalog_number: body.catalog_number, ...(body.institution_code ? { institution_code: body.institution_code } : {}), ...(body.collection_code ? { collection_code: body.collection_code } : {}) });
        if (matches.length) { setDuplicates(matches); setPending(values); return; }
      }
      if (workspace && identify) {
        body.workspace_id = workspace.id;
        if (values.species_id === externalChoice) body.accept_gbif_identification = true;
        else body.species_id = values.species_id;
        body.identification_notes = values.identification_notes?.trim() || null;
      }
      const result = candidate ? await importTaxonomySpecimen({ ...body, gbif_occurrence_key: candidate.gbif_occurrence_key })
        : { specimen: await createTaxonomySpecimen({ ...body, reference_type: "local" }), created: true };
      onCreated(result);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); onBusyChange(false); }
  }
  return <>
    {candidate && <Alert type="info" message={`GBIF identification: ${candidate.scientific_name || "Unavailable"}`} description="External reference information, not permanent taxonomic truth. Import confirms only the identification you choose for this workspace." style={{ marginBottom: 16 }} />}
    {error && <Alert type="error" message={error} />}
    <Form form={form} layout="vertical" disabled={busy} initialValues={{ species_id: suggestion?.id, specimen_label: "" }} onValuesChange={() => { setDuplicates([]); setPending(null); }} onFinish={(values) => create(values)}>
      {workspace && <Checkbox checked={identify} disabled={busy} onChange={(event) => setIdentify(event.target.checked)}>Record an identification in {workspace.name}</Checkbox>}
      {workspace && identify && <>
        {suggestion && <Paragraph>{candidate.species_suggestion ? "Matched existing taxonomy species · Suggested from GBIF" : `Suggested from GBIF: ${speciesName(suggestion)} · Not yet in taxonomy database`}</Paragraph>}
        <IdentificationPicker workspace={workspace} species={suggestion} />
        <Paragraph type="secondary">Identifying this specimen automatically includes the species in {workspace.name}.</Paragraph>
        <Form.Item name="identification_notes" label="Identification notes"><Input.TextArea maxLength={16000} /></Form.Item>
      </>}
      <VoucherFields source={candidate} />
      <Button type="primary" htmlType="submit" loading={busy}>{candidate ? "Import specimen" : "Check and create specimen"}</Button>
    </Form>
    {duplicates.length > 0 && <div>
      <Alert type="warning" message="Possible existing specimens" description="Inspect matching catalog details before creating a separate specimen." />
      <Table rowKey="id" size="small" dataSource={duplicates} columns={[
        { title: "Specimen", render: (_, row) => <>#{row.id} · {specimenIdentity(row)}</> },
        { title: "Action", render: (_, row) => <Button disabled={busy} onClick={() => onOpen(row.id)}>Open existing specimen</Button> },
      ]} />
      <Button disabled={busy} onClick={() => create(pending, true)}>Create separate specimen</Button>
    </div>}
  </>;
}
function ExternalTaxonomy({ specimen }) {
  const [state, setState] = useState({ taxonomy: null, source: "cache", loading: true, error: "" });
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    fetchSpecimenExternalTaxonomy(specimen.id, "cache", { signal: controller.signal })
      .then((data) => { if (active) setState({ ...data, loading: false, error: "" }); })
      .catch((failure) => { if (active && failure.name !== "AbortError") setState({ loading: false, error: failure.message }); });
    return () => { active = false; controller.abort(); };
  }, [specimen.id]);
  async function refresh() {
    setState((old) => ({ ...old, loading: true, error: "" }));
    try { setState({ ...await fetchSpecimenExternalTaxonomy(specimen.id, "live_gbif"), loading: false, error: "" }); }
    catch (failure) { setState((old) => ({ ...old, loading: false, error: failure.message })); }
  }
  return <section aria-label="External GBIF taxonomy">
    <Title level={5}>External GBIF taxonomy</Title>
    {state.loading && <Spin size="small" />}
    {state.error && <Alert type="warning" message={state.error} />}
    <Paragraph>{state.source === "live_gbif" ? "GBIF/COL accepted name — current GBIF" : "GBIF accepted name — local snapshot"}: {state.taxonomy?.accepted_scientific_name || "Unavailable"}</Paragraph>
    <Paragraph>GBIF scientific name: {state.taxonomy?.scientific_name || "Unavailable"}</Paragraph>
    <Paragraph>Legacy GBIF Backbone key: {state.taxonomy?.gbif_taxon_key || "—"} · COL XR key: {state.taxonomy?.col_xr_taxon_key || "—"}</Paragraph>
    <Paragraph type="secondary">External reference data. Refreshing GBIF never changes a workspace identification.</Paragraph>
    <Button disabled={state.loading} onClick={refresh}>Check current GBIF</Button>
  </section>;
}
function WorkspaceIdentification({ workspace, specimen, onSaved, onBusyChange }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const identification = String(specimen.workspace_identification?.workspace_id) === String(workspace.id) ? specimen.workspace_identification : null;
  async function save(values) {
    setBusy(true); onBusyChange(true); setError("");
    try { await putWorkspaceSpecimenIdentification(workspace.id, specimen.id, { species_id: values.species_id, notes: values.identification_notes || null }); onSaved(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); onBusyChange(false); }
  }
  return <section aria-label="Workspace interpretation">
    <Title level={5}>Workspace interpretation</Title>
    {!identification && <Paragraph>No identification in this workspace</Paragraph>}
    <Paragraph type="secondary">This interpretation affects only {workspace.name}. Saving includes the species in this workspace.</Paragraph>
    {error && <Alert type="error" message={error} />}
    <Form layout="vertical" disabled={busy} initialValues={{ species_id: identification?.species_id, identification_notes: identification?.notes }} onFinish={save}>
      <IdentificationPicker workspace={workspace} species={identification?.species} />
      <Form.Item name="identification_notes" label="Identification notes"><Input.TextArea maxLength={16000} /></Form.Item>
      <Button htmlType="submit" type="primary" loading={busy}>Save workspace identification</Button>
    </Form>
  </section>;
}
function EditVoucher({ specimen, onSaved, onBusyChange }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function save(values) {
    setBusy(true); onBusyChange(true); setError("");
    try { await updateTaxonomySpecimen(specimen.id, metadata(values, specimen.reference_type !== "gbif")); onSaved(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); onBusyChange(false); }
  }
  return <>
    {error && <Alert type="error" message={error} />}
    <Form layout="vertical" initialValues={specimen} disabled={busy} onFinish={save}>
      <VoucherFields source={specimen.reference_type === "gbif" ? specimen : null} />
      <Button htmlType="submit" loading={busy}>Save voucher metadata</Button>
    </Form>
  </>;
}
export default function SpecimenEditor({ id, workspace, onClose, onSaved }) {
  const [specimen, setSpecimen] = useState(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    fetchTaxonomySpecimen(id, { workspaceId: workspace?.id, signal: controller.signal }).then((record) => { if (active) setSpecimen(record); })
      .catch((failure) => { if (active && failure.name !== "AbortError") setError(failure.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [id, workspace?.id]);
  return <Drawer open title="Global specimen detail" width={700} closable={!busy} maskClosable={!busy} onClose={() => { if (!busy) onClose(); }}>
    {loading ? <Spin /> : error ? <Alert type="error" message={error} /> : specimen && <>
      <Title level={4}>Voucher identity</Title>
      <Paragraph>Internal specimen record ID: {specimen.id} · {specimenIdentity(specimen)}</Paragraph>
      <Space><Tag>{specimen.reference_type}</Tag><Text>Character observations: {specimen.observation_count}</Text></Space>
      {specimen.legacy_species && <Paragraph type="secondary">Legacy global assignment (not a workspace identification): {speciesName(specimen.legacy_species)}</Paragraph>}
      <EditVoucher specimen={specimen} onSaved={onSaved} onBusyChange={setBusy} />
      {specimen.gbif_occurrence_key && <ExternalTaxonomy specimen={specimen} />}
      {workspace ? <WorkspaceIdentification workspace={workspace} specimen={specimen} onSaved={onSaved} onBusyChange={setBusy} /> : <Paragraph>No workspace selected</Paragraph>}
      <Paragraph type="secondary">Workspace identification changes do not alter global observations, evidence or other workspaces.</Paragraph>
    </>}
  </Drawer>;
}
