import React, { useEffect, useState } from "react";
import { Alert, Button, Checkbox, Drawer, Form, Input, Space, Spin, Table, Tag, Typography } from "antd";
import { createTaxonomySpecimen, fetchTaxonomySpecimen, findSpecimenDuplicates, importTaxonomySpecimen, updateTaxonomySpecimen } from "../../utils/api/taxonomy";
import SpeciesPicker, { ImportSpeciesSuggestion } from "./SpeciesPicker";
import { speciesName } from "./SpeciesManager";

const { Paragraph, Text } = Typography;
export const specimenIdentity = (row) => [row.institution_code, row.collection_code, row.catalog_number].map((value) => value?.trim()).filter(Boolean).join(" ") || row.specimen_label || `Specimen ${row.id || "(identity not supplied)"}`;

function MetadataFields({ species, disabled }) {
  return <>
    <Form.Item name="species_id" label="Current species" rules={[{ required: true, message: "Choose a current species assignment." }]}><SpeciesPicker initialSpecies={species} disabled={disabled} /></Form.Item>
    <Form.Item name="institution_code" label="Institution code" rules={[{ max: 64 }]}><Input maxLength={64} /></Form.Item>
    <Form.Item name="collection_code" label="Collection code" rules={[{ max: 64 }]}><Input maxLength={64} /></Form.Item>
    <Form.Item name="catalog_number" label="Catalog number" rules={[{ max: 128 }]}><Input maxLength={128} /></Form.Item>
    <Form.Item name="specimen_label" label="Specimen label" rules={[{ max: 255 }]}><Input maxLength={255} /></Form.Item>
    <Form.Item name="notes" label="Notes"><Input.TextArea rows={3} maxLength={16000} /></Form.Item>
  </>;
}
const metadata = (values) => ({ species_id: values.species_id, institution_code: values.institution_code?.trim() || null,
  collection_code: values.collection_code?.trim() || null,
  catalog_number: values.catalog_number?.trim() || null, specimen_label: values.specimen_label?.trim() || null, notes: values.notes?.trim() || null });

export function CreateSpecimenForm({ candidate, onCreated, onOpen, onBusyChange }) {
  const [form] = Form.useForm();
  const [species, setSpecies] = useState(candidate?.species_suggestion || null);
  const [busy, setBusy] = useState(false);
  const [importingSpecies, setImportingSpecies] = useState(false);
  const [error, setError] = useState("");
  const [duplicates, setDuplicates] = useState([]);
  const [pending, setPending] = useState(null);
  async function create(values, separate = false) {
    setBusy(true); onBusyChange(true); setError("");
    try {
      const body = metadata(values);
      if (!candidate && !separate && body.catalog_number) {
        const matches = await findSpecimenDuplicates({ catalog_number: body.catalog_number, ...(body.institution_code ? { institution_code: body.institution_code } : {}), ...(body.collection_code ? { collection_code: body.collection_code } : {}) });
        if (matches.length) { setDuplicates(matches); setPending(values); return; }
      }
      const result = candidate ? await importTaxonomySpecimen({ ...body, gbif_occurrence_key: candidate.gbif_occurrence_key })
        : { specimen: await createTaxonomySpecimen({ ...body, reference_type: "local" }), created: true };
      onCreated(result);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); onBusyChange(false); }
  }
  return <>
    {candidate && <Alert type="info" showIcon message="Confirm the current species assignment" description="GBIF identification is a suggestion, not permanent curated truth. Choose or confirm a global species before creating this specimen." style={{ marginBottom: 16 }} />}
    {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
    <Form form={form} layout="vertical" disabled={busy || importingSpecies} initialValues={{ species_id: species?.id,
      institution_code: candidate?.institution_code, collection_code: candidate?.collection_code, catalog_number: candidate?.catalog_number,
      specimen_label: "" }}
      onValuesChange={(changed) => { setDuplicates([]); setPending(null); if (Object.hasOwn(changed, "species_id")) form.setFieldValue("confirmed", false); }} onFinish={(values) => create(values)}>
      <MetadataFields species={species} disabled={busy || importingSpecies} />
      {candidate && !species && <ImportSpeciesSuggestion candidate={candidate} onBusyChange={(value) => { setImportingSpecies(value); onBusyChange(value); }} onImported={(record) => { setSpecies(record); form.setFieldsValue({ species_id: record.id, confirmed: false }); }} />}
      {candidate && <Form.Item name="confirmed" valuePropName="checked" rules={[{ validator: (_, value) => value ? Promise.resolve() : Promise.reject(new Error("Confirm the current species assignment before import.")) }]}><Checkbox>I confirm this specimen's current species assignment.</Checkbox></Form.Item>}
      <Button type="primary" htmlType="submit" loading={busy} disabled={importingSpecies}>{candidate ? "Import specimen" : "Check and create specimen"}</Button>
    </Form>
    {duplicates.length > 0 && <div style={{ marginTop: 24 }}>
      <Alert type="warning" showIcon message="Possible existing specimens" description="These catalog details match existing records. Inspect them before creating a separate specimen." />
      <Table rowKey="id" size="small" pagination={{ pageSize: 5 }} dataSource={duplicates} columns={[
        { title: "Specimen", render: (_, row) => <>#{row.id} · {specimenIdentity(row)}</> },
        { title: "Current species", render: (_, row) => row.species ? speciesName(row.species) : "Unassigned (legacy record)" },
        { title: "Action", render: (_, row) => <Button disabled={busy} onClick={() => onOpen(row.id)}>Open existing specimen</Button> },
      ]} />
      <Button disabled={busy} onClick={() => create(pending, true)}>Create separate specimen</Button>
    </div>}
  </>;
}

function EditSpecimenForm({ specimen, onSaved, onBusyChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(values) {
    setBusy(true); onBusyChange(true); setError("");
    try { await updateTaxonomySpecimen(specimen.id, metadata(values)); onSaved(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); onBusyChange(false); }
  }
  return <>
    <Paragraph>Internal specimen record ID: {specimen.id}</Paragraph>
    <Paragraph>Specimen identity: {specimenIdentity(specimen)}</Paragraph>
    <Space wrap><Tag>{specimen.reference_type === "gbif" ? "GBIF-linked" : specimen.reference_type}</Tag>{specimen.gbif_occurrence_key && <Text>GBIF {specimen.gbif_occurrence_key}</Text>}</Space>
    <Paragraph>Current species: {specimen.species ? `${speciesName(specimen.species)} · ${specimen.species.species_status === "work_in_progress" ? "WIP" : "Published"}` : "Unassigned (legacy record)"}</Paragraph>
    <Paragraph>Character observations: {specimen.observation_count}</Paragraph>
    <Paragraph type="secondary">Created: {specimen.created_at || "Unknown"} · Updated: {specimen.updated_at || "Unknown"}</Paragraph>
    <Alert type="info" message="Changing the current species assignment does not alter existing observations or evidence." style={{ marginBottom: 16 }} />
    {error && <Alert type="error" message={error} />}
    <Form layout="vertical" disabled={busy} initialValues={specimen} onFinish={save}>
      <MetadataFields species={specimen.species} disabled={busy} />
      <Button type="primary" htmlType="submit" loading={busy}>Save specimen</Button>
    </Form>
  </>;
}

export default function SpecimenEditor({ id, onClose, onSaved }) {
  const [specimen, setSpecimen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    setLoading(true); setError("");
    fetchTaxonomySpecimen(id, { signal: controller.signal }).then((record) => { if (active) setSpecimen(record); })
      .catch((failure) => { if (active && failure.name !== "AbortError") setError(failure.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [id, reload]);
  return <Drawer open title="Global specimen detail" width={700} closable={!busy} maskClosable={!busy} onClose={() => { if (!busy) onClose(); }}>
    {loading ? <div role="status"><Spin size="small" /> Loading specimen…</div> : error ? <Alert type="error" message={error} action={<Button onClick={() => setReload((value) => value + 1)}>Retry</Button>} />
      : specimen && <EditSpecimenForm specimen={specimen} onBusyChange={setBusy} onSaved={onSaved} />}
  </Drawer>;
}
