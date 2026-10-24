import React, { useEffect, useState } from "react";
import { Alert, Button, Card, Empty, Input, Modal, Popconfirm, Space, Table, Tag, Typography } from "antd";
import { useOutletContext } from "react-router-dom";
import { addWorkspaceCharacter, fetchWorkspaceCharacters, removeWorkspaceCharacter, searchTaxonomyCharacters } from "../../utils/api/taxonomy";
import CharacterEditor, { CreateCharacterForm } from "./CharacterEditor";

const { Title, Paragraph, Text } = Typography;
function CharacterValues({ character }) {
  return character.data_type === "numeric_range"
    ? <Text>Numeric range · {character.unit || "Unit unspecified"}</Text>
    : <Space size={[0, 4]} wrap>{character.states.length ? character.states.map((state) => <Tag key={state.id} title={state.description || undefined}>{state.name}</Tag>) : <Text type="secondary">No states defined</Text>}</Space>;
}

function AddCharacter({ workspace, members, source, onClose, onAdded }) {
  const [mode, setMode] = useState(source ? "create" : "existing");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const memberIds = new Set(members.map((character) => character.id));
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    setResults([]); setError("");
    const q = query.trim();
    setLoading(mode === "existing" && q.length >= 2);
    if (mode !== "existing" || q.length < 2) return () => controller.abort();
    const timer = setTimeout(async () => {
      try {
        const data = await searchTaxonomyCharacters(q, { signal: controller.signal });
        if (active) setResults(data);
      } catch (failure) { if (active && failure.name !== "AbortError") setError(failure.message); }
      finally { if (active) setLoading(false); }
    }, 350);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [query, mode, reload]);
  async function addExisting(character) {
    setBusy(true); setError("");
    try {
      try { await addWorkspaceCharacter(workspace.id, character.id); }
      catch (failure) {
        if (failure.status !== 409) throw failure;
        const current = await fetchWorkspaceCharacters(workspace.id);
        if (!current.some((item) => item.id === character.id)) throw failure;
      }
      onAdded(character);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <Modal open title={source ? "Create a new interpretation" : "Add character"} footer={null} width={1000} closable={!busy} maskClosable={!busy} onCancel={() => { if (!busy) onClose(); }}>
    <Paragraph>Characters and states are global reusable definitions. Workspace membership only selects a working set. Reuse definitions you agree with; create a new character for a substantively different interpretation.</Paragraph>
    {!source && <Space wrap style={{ marginBottom: 24 }}>
      <Button disabled={busy} type={mode === "existing" ? "primary" : "default"} onClick={() => setMode("existing")}>Use existing character</Button>
      <Button disabled={busy} type={mode === "create" ? "primary" : "default"} onClick={() => setMode("create")}>Create new character</Button>
    </Space>}
    {mode === "existing" ? <>
      <Input aria-label="Search global characters" placeholder="Search name, anatomical region, or description (at least 2 characters)" value={query} maxLength={200} onChange={(event) => setQuery(event.target.value)} />
      <Paragraph type="secondary">Global character library · first 30 matches. Refine your search as needed.</Paragraph>
      {error && <Alert type="error" message={error} action={<Button onClick={() => setReload((value) => value + 1)}>Retry search</Button>} />}
      <Table size="small" rowKey="id" dataSource={results} loading={loading} pagination={{ pageSize: 5 }} scroll={{ x: 850 }} locale={{ emptyText: query.trim().length < 2 ? "Search the global character library." : "No global characters match this search." }} columns={[
        { title: "Definition", render: (_, character) => <><Text strong>{character.name}</Text><Paragraph>{character.description || "No description provided."}</Paragraph><Text type="secondary">{character.anatomical_region || "Region unspecified"} · {character.data_type === "categorical" ? "Categorical" : "Numeric range"} · {character.visibility}</Text></> },
        { title: "States / unit", render: (_, character) => <CharacterValues character={character} /> },
        { title: "Availability", render: (_, character) => <Tag>{memberIds.has(character.id) ? "Already in this workspace" : "Available global character"}</Tag> },
        { title: "Action", render: (_, character) => <Button disabled={busy || memberIds.has(character.id)} onClick={() => addExisting(character)}>Add existing character</Button> },
      ]} />
    </> : <CreateCharacterForm workspace={workspace} source={source} onCreated={onAdded} onBusyChange={setBusy} />}
  </Modal>;
}

function WorkspaceCharacters({ workspace }) {
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [adding, setAdding] = useState(false);
  const [source, setSource] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [removing, setRemoving] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    setLoading(true); setError("");
    fetchWorkspaceCharacters(workspace.id, { signal: controller.signal })
      .then((data) => { if (active) setCharacters(data); })
      .catch((failure) => { if (active && failure.name !== "AbortError") setError(failure.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [workspace.id, reload]);
  const refresh = () => setReload((value) => value + 1);
  async function remove(character) {
    setRemoving(true); setError(""); setNotice("");
    try { await removeWorkspaceCharacter(workspace.id, character.id); setNotice(`${character.name} removed from this workspace. The global character and states remain available.`); refresh(); }
    catch (failure) { setError(failure.message); }
    finally { setRemoving(false); }
  }
  return <Card>
    <Space wrap style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
      <Title level={3} style={{ margin: 0 }}>Characters in this workspace</Title>
      <Button type="primary" disabled={loading || !!error} onClick={() => { setSource(null); setAdding(true); }}>Add character</Button>
    </Space>
    <Paragraph>Global reusable characters selected for {workspace.name}. A workspace's working set does not imply scientific ownership.</Paragraph>
    {notice && <Alert type="success" message={notice} style={{ marginBottom: 16 }} />}
    {error && <Alert type="error" message={error} action={<Button onClick={refresh}>Retry</Button>} style={{ marginBottom: 16 }} />}
    <Table rowKey="id" dataSource={characters} loading={loading} pagination={{ pageSize: 10 }} scroll={{ x: 1000 }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No characters have been selected for this workspace yet." /> }} columns={[
      { title: "Character", dataIndex: "name" }, { title: "Anatomical region", dataIndex: "anatomical_region", render: (value) => value || "—" },
      { title: "Data type", render: (_, character) => <Tag>{character.data_type === "categorical" ? "Categorical" : "Numeric range"}</Tag> },
      { title: "States / unit", render: (_, character) => <CharacterValues character={character} /> },
      { title: "Order", dataIndex: "display_order" },
      { title: "Actions", render: (_, character) => <Space wrap>
        <Button disabled={loading || removing} onClick={() => setEditingId(character.id)}>View/edit character</Button>
        <Popconfirm title="Remove character from workspace?" description="The global character and its states will remain available. It will not be removed from other workspaces. Observations in this workspace may prevent removal." onConfirm={() => remove(character)}><Button danger disabled={loading || removing}>Remove from workspace</Button></Popconfirm>
      </Space> },
    ]} />
    {adding && <AddCharacter workspace={workspace} members={characters} source={source} onClose={() => setAdding(false)} onAdded={(character) => { setAdding(false); setNotice(`${character.name} added to workspace.`); refresh(); }} />}
    {editingId && <CharacterEditor id={editingId} onClose={() => setEditingId(null)} onChanged={refresh} onCopy={(character) => { setEditingId(null); setSource(character); setAdding(true); }} />}
  </Card>;
}

export default function CharacterManager() {
  const { currentWorkspace } = useOutletContext();
  return currentWorkspace ? <WorkspaceCharacters key={currentWorkspace.id} workspace={currentWorkspace} /> : null;
}
