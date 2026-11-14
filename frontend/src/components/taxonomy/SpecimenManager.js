import React, { useEffect, useRef, useState } from "react";
import { Alert, Button, Card, Empty, Input, Modal, Space, Table, Tag, Typography } from "antd";
import { lookupGbifSpecimens, searchTaxonomySpecimens } from "../../utils/api/taxonomy";
import { speciesName } from "./SpeciesManager";
import SpecimenEditor, { CreateSpecimenForm, specimenIdentity } from "./SpecimenEditor";
import useDebouncedSearch from "./useDebouncedSearch";

const { Title, Paragraph, Text } = Typography;
const cachedSpecimens = (q, options) => lookupGbifSpecimens(q, "cache", options);

function AddSpecimen({ onClose, onCreated, onOpen }) {
  const [mode, setMode] = useState("find");
  const [query, setQuery] = useState("");
  const [candidate, setCandidate] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
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
      const data = await lookupGbifSpecimens(query.trim(), "live_gbif", { signal: controller.signal });
      if (!controller.signal.aborted) setLive({ data, loading: false, error: "" });
    } catch (failure) {
      if (!controller.signal.aborted) setLive({ data: null, loading: false, error: failure.message });
    }
  }
  const candidates = new Map((cache.data?.results || []).map((record) => [record.gbif_occurrence_key, record]));
  for (const record of live.data?.results || []) candidates.set(record.gbif_occurrence_key, record);
  const exact = (live.data || cache.data)?.query_type === "occurrence_key";
  return <Modal open title="Add specimen" width={1000} footer={null} closable={!busy} maskClosable={!busy} onCancel={() => { if (!busy) onClose(); }}>
    <Paragraph>Find a real specimen or voucher, or enter a specimen manually. No workspace membership is created.</Paragraph>
    {!candidate && <Space wrap style={{ marginBottom: 24 }}>
      <Button disabled={busy} type={mode === "find" ? "primary" : "default"} onClick={() => setMode("find")}>Find specimen</Button>
      <Button disabled={busy} type={mode === "manual" ? "primary" : "default"} onClick={() => setMode("manual")}>Create manually</Button>
    </Space>}
    {mode === "manual" ? <CreateSpecimenForm onCreated={onCreated} onOpen={onOpen} onBusyChange={setBusy} /> : candidate ? <>
      <Button disabled={busy} onClick={() => setCandidate(null)}>Back to specimen results</Button>
      <Title level={4}>{specimenIdentity(candidate)}</Title>
      <Paragraph>{candidate.scientific_name} · {[candidate.locality, candidate.country].filter(Boolean).join(", ")}</Paragraph>
      <Paragraph>GBIF {candidate.gbif_occurrence_key} · {candidate.basis_of_record}</Paragraph>
      <CreateSpecimenForm candidate={candidate} onCreated={onCreated} onOpen={onOpen} onBusyChange={setBusy} />
    </> : <>
      <label htmlFor="find-specimen">Find specimen</label>
      <Input id="find-specimen" placeholder="e.g. LACM wellsorum, USNM 12345, or a GBIF occurrence key" maxLength={200} value={query} onChange={(event) => setQuery(event.target.value)} />
      <Paragraph type="secondary">Search the local GBIF snapshot first. Use current GBIF for newer or missing records.</Paragraph>
      {cache.error && <Alert type="error" message={cache.error} action={<Button onClick={() => setReload((value) => value + 1)}>Retry cache search</Button>} />}
      <Button style={{ margin: "12px 0" }} type={query.trim() && !candidates.size ? "primary" : "default"} disabled={!query.trim() || live.loading} loading={live.loading} onClick={searchLive}>Search current GBIF</Button>
      {live.error && <Alert type="error" message={live.error} description="Cached results remain available. You can also create a specimen manually." />}
      {exact && <Paragraph>Exact GBIF occurrence-key lookup.</Paragraph>}
      <Table rowKey="gbif_occurrence_key" size="small" dataSource={[...candidates.values()]} loading={cache.loading || live.loading} pagination={{ pageSize: 5 }} scroll={{ x: 800 }} locale={{ emptyText: query.trim() ? "No useful specimen matches. Search current GBIF or create manually." : "Enter specimen search terms." }} columns={[
        { title: "Specimen identity", render: (_, record) => <><Text strong>{specimenIdentity(record)}</Text><br />{record.scientific_name}<br /><Text type="secondary">{[record.locality, record.country].filter(Boolean).join(", ")}</Text><br /><Text type="secondary">GBIF {record.gbif_occurrence_key}</Text></> },
        { title: "Evidence / source", render: (_, record) => <><Tag>{record.basis_of_record}</Tag><Tag>{record.source === "cache" ? "Local GBIF cache" : "Current GBIF"}</Tag>{record.recorded_by && <div>Recorded by: {record.recorded_by}</div>}{record.event_date && <div>{record.event_date}</div>}</> },
        { title: "Availability", render: (_, record) => record.existing_specimen_id ? <Tag>Already in taxonomy database</Tag> : <Tag>Available to import</Tag> },
        { title: "Action", render: (_, record) => <Button onClick={() => record.existing_specimen_id ? onOpen(record.existing_specimen_id) : setCandidate(record)}>{record.existing_specimen_id ? "Open existing specimen" : "Select specimen"}</Button> },
      ]} />
    </>}
  </Modal>;
}

export default function SpecimenManager() {
  // Deliberately independent of workspace context and workspace IDs.
  const [query, setQuery] = useState("");
  const [reload, setReload] = useState(0);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [notice, setNotice] = useState("");
  const search = useDebouncedSearch(query, searchTaxonomySpecimens, { minLength: 0, reload });
  const open = (id) => { setAdding(false); setEditingId(id); };
  return <Card>
    <Space wrap style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
      <Title level={3} style={{ margin: 0 }}>Specimens</Title>
      <Button type="primary" onClick={() => setAdding(true)}>Add specimen</Button>
    </Space>
    <Paragraph>Specimens are global records and are not owned by a workspace.</Paragraph>
    {notice && <Alert type="success" message={notice} style={{ marginBottom: 16 }} />}
    <Input aria-label="Search curated specimens" placeholder="Search record ID, institution/collection/catalog details, species, or working name" maxLength={200} value={query} onChange={(event) => setQuery(event.target.value)} />
    <Paragraph type="secondary">Global curated specimens · first 30 matches. An empty search shows recent records.</Paragraph>
    {search.error && <Alert type="error" message={search.error} action={<Button onClick={() => setReload((value) => value + 1)}>Retry search</Button>} />}
    <Table rowKey="id" size="small" dataSource={search.data || []} loading={search.loading} pagination={{ pageSize: 10 }} scroll={{ x: 1000 }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No curated specimens match this search." /> }} columns={[
      { title: "Record ID", dataIndex: "id" }, { title: "Institution / collection / catalog", render: (_, row) => [row.institution_code, row.collection_code, row.catalog_number].some((value) => value?.trim()) ? specimenIdentity(row) : null }, { title: "Specimen label", dataIndex: "specimen_label" },
      { title: "Current species", render: (_, row) => row.species ? <>{speciesName(row.species)}<br /><Tag>{row.species.species_status === "work_in_progress" ? "WIP" : "Published"}</Tag></> : "Unassigned (legacy record)" },
      { title: "Reference type", dataIndex: "reference_type" }, { title: "GBIF occurrence", dataIndex: "gbif_occurrence_key", render: (value) => value || "—" },
      { title: "Action", render: (_, row) => <Button onClick={() => open(row.id)}>View/edit specimen</Button> },
    ]} />
    {adding && <AddSpecimen onClose={() => setAdding(false)} onOpen={open} onCreated={({ specimen, created }) => { setAdding(false); setNotice(created ? `Specimen #${specimen.id} created.` : `Specimen #${specimen.id} is already in the taxonomy database. Its current assignment is unchanged.`); setReload((value) => value + 1); open(specimen.id); }} />}
    {editingId && <SpecimenEditor key={editingId} id={editingId} onClose={() => setEditingId(null)} onSaved={() => { setEditingId(null); setNotice("Specimen metadata and current assignment saved. Existing observations and evidence are unchanged."); setReload((value) => value + 1); }} />}
  </Card>;
}
