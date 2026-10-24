import React, { useEffect, useState } from "react";
import { Alert, Button, Card, Checkbox, Form, Input, Modal, Popconfirm, Select, Space, Spin, Table, Typography } from "antd";
import { addCharacterState, createCharacterWithStates, fetchCharacterUsage, fetchTaxonomyCharacter, removeCharacterState, updateTaxonomyCharacter } from "../../utils/api/taxonomy";

const { Paragraph, Title } = Typography;

function DefinitionFields({ lockType = false, lockUnit = false }) {
  const form = Form.useFormInstance();
  const type = Form.useWatch("data_type", form) || "categorical";
  return <>
    <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true }, { max: 255 }]}><Input maxLength={255} /></Form.Item>
    <Form.Item name="description" label="Description"><Input.TextArea rows={3} maxLength={16000} /></Form.Item>
    <Form.Item name="anatomical_region" label="Anatomical region"><Input maxLength={128} /></Form.Item>
    <Form.Item name="data_type" label="Data type"><Select disabled={lockType || undefined} options={[{ value: "categorical", label: "Categorical" }, { value: "numeric_range", label: "Numeric range" }]} /></Form.Item>
    {type === "numeric_range" && <Form.Item name="unit" label="Unit"><Input disabled={lockUnit || undefined} placeholder="e.g. mm" maxLength={64} /></Form.Item>}
    <Form.Item name="visibility" label="Visibility" extra="Visibility is metadata. Current taxonomy access is admin-wide."><Select options={["private", "shared", "public"].map((value) => ({ value, label: value }))} /></Form.Item>
  </>;
}

const definition = (values) => ({
  name: values.name.trim(), description: values.description?.trim() || null,
  anatomical_region: values.anatomical_region?.trim() || null,
  data_type: values.data_type, unit: values.data_type === "numeric_range" ? values.unit?.trim() || null : null,
  visibility: values.visibility,
});

export function CreateCharacterForm({ workspace, source, onCreated, onBusyChange = () => {} }) {
  const [form] = Form.useForm();
  const type = Form.useWatch("data_type", form) || source?.data_type || "categorical";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(values) {
    setBusy(true); onBusyChange(true); setError("");
    try {
      const result = await createCharacterWithStates({ ...definition(values), workspace_id: workspace.id,
        states: values.data_type === "categorical" ? (values.states || []).map((state) => ({ name: state.name.trim(), description: state.description?.trim() || null })) : [] });
      onCreated(result);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); onBusyChange(false); }
  }
  return <>
    {source && <Alert type="info" showIcon message="Create a new interpretation" description="This creates a distinct global character and new states. The original definition and its observations stay unchanged." style={{ marginBottom: 16 }} />}
    {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
    <Form form={form} layout="vertical" disabled={busy} onFinish={save} initialValues={{ name: source?.name || "", description: source?.description,
      anatomical_region: source?.anatomical_region, data_type: source?.data_type || "categorical", unit: source?.unit,
      visibility: source?.visibility || "private", states: source?.states?.map(({ name, description }) => ({ name, description })) || [] }}>
      <DefinitionFields />
      {type === "categorical" && <>
        <Title level={5}>State definitions</Title>
        <Paragraph>Order states with the arrow buttons. Use a new interpretation when scientific meanings differ.</Paragraph>
        <Form.List name="states">{(fields, { add, remove, move }) => <>
          {fields.map((field, index) => <Card key={field.key} size="small" style={{ marginBottom: 12 }}>
            <Form.Item name={[field.name, "name"]} label={`State ${index + 1} name`} rules={[{ required: true, whitespace: true }, { max: 255 }]}><Input maxLength={255} /></Form.Item>
            <Form.Item name={[field.name, "description"]} label={`State ${index + 1} description`}><Input.TextArea rows={2} maxLength={16000} /></Form.Item>
            <Space wrap>
              <Button aria-label={`Move state ${index + 1} up`} disabled={busy || index === 0} onClick={() => move(index, index - 1)}>↑</Button>
              <Button aria-label={`Move state ${index + 1} down`} disabled={busy || index === fields.length - 1} onClick={() => move(index, index + 1)}>↓</Button>
              <Button danger onClick={() => remove(field.name)}>Remove state {index + 1}</Button>
            </Space>
          </Card>)}
          <Button disabled={busy || fields.length >= 200} onClick={() => add({ name: "", description: "" })}>Add state</Button>
        </>}</Form.List>
      </>}
      {type === "numeric_range" && <Paragraph>Numeric observations use ranges in the specified unit; this character has no categorical states.</Paragraph>}
      <Button style={{ marginTop: 24 }} type="primary" htmlType="submit" loading={busy}>Create and add to workspace</Button>
    </Form>
  </>;
}

function LoadedEditor({ character, usage, onCopy, onSaved, onStatesChanged, onBusyChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [stateName, setStateName] = useState("");
  const [stateDescription, setStateDescription] = useState("");
  const observed = usage.specimen_observation_count + usage.description_observation_count > 0;
  const shared = usage.workspace_count > 0 || observed || usage.key_count > 0;
  const canEdit = !busy && (!shared || acknowledged);
  async function mutate(action, after) {
    setBusy(true); onBusyChange(true); setError("");
    try { await action(); after(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); onBusyChange(false); }
  }
  function stateIsUsed(id) {
    const state = usage.states.find((item) => item.id === id);
    return !state || state.specimen_observation_count + state.description_observation_count > 0;
  }
  return <>
    <Paragraph>{usage.workspace_count} workspace(s) · {usage.specimen_observation_count} specimen observation(s) · {usage.description_observation_count} description observation(s) · {usage.key_count} key(s)</Paragraph>
    {shared && <Alert type="warning" showIcon message="Shared global character" description="This is a shared global character. Changes affect every workspace and observation that uses it." style={{ marginBottom: 16 }} />}
    <Paragraph>Reuse this definition when you agree with its meaning. For different meanings, boundaries, or states, start a new interpretation.</Paragraph>
    <Button disabled={busy} onClick={() => onCopy(character)}>Create a new interpretation</Button>
    {shared && <div style={{ margin: "16px 0" }}><Checkbox checked={acknowledged} disabled={busy} onChange={(event) => setAcknowledged(event.target.checked)}>I understand the effects of editing this shared global definition.</Checkbox></div>}
    {error && <Alert type="error" showIcon message={error} style={{ margin: "16px 0" }} />}
    <Form layout="vertical" initialValues={character} disabled={!canEdit} onFinish={(values) => mutate(() => updateTaxonomyCharacter(character.id, definition(values)), onSaved)}>
      <DefinitionFields lockType={observed || character.states.length > 0} lockUnit={observed} />
      {(observed || character.states.length > 0) && <Paragraph type="secondary">Data type is fixed while states or observations exist. Units are fixed while observations exist.</Paragraph>}
      <Button type="primary" htmlType="submit" loading={busy}>Save global changes</Button>
    </Form>
    {character.data_type === "categorical" && <>
      <Title level={5}>States</Title>
      <Paragraph>Existing state names and definitions are preserved. Create a new interpretation to redefine or reorder them. States used by observations cannot be removed.</Paragraph>
      <Table size="small" rowKey="id" dataSource={character.states} pagination={false} scroll={{ x: 500 }} columns={[
        { title: "State", dataIndex: "name" }, { title: "Definition", dataIndex: "description" },
        { title: "Action", render: (_, state) => <Popconfirm title="Remove this global state?" description="This affects every workspace using this definition. Used states cannot be removed." onConfirm={() => mutate(() => removeCharacterState(character.id, state.id), onStatesChanged)}><Button danger disabled={!canEdit || stateIsUsed(state.id)}>{stateIsUsed(state.id) ? "State in use" : "Remove state"}</Button></Popconfirm> },
      ]} />
      <Space direction="vertical" style={{ width: "100%", marginTop: 16 }}>
        <Input aria-label="New state name" placeholder="New state name" value={stateName} onChange={(event) => setStateName(event.target.value)} disabled={!canEdit} maxLength={255} />
        <Input.TextArea aria-label="New state description" placeholder="New state description (optional)" value={stateDescription} onChange={(event) => setStateDescription(event.target.value)} disabled={!canEdit} maxLength={16000} />
        <Button disabled={!canEdit || !stateName.trim()} onClick={() => mutate(() => addCharacterState(character.id, {
          name: stateName.trim(), description: stateDescription.trim() || null,
          display_order: Math.max(-1, ...character.states.map((state) => state.display_order)) + 1,
        }), onStatesChanged)}>Add state to global character</Button>
      </Space>
    </>}
  </>;
}

export default function CharacterEditor({ id, onClose, onCopy, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    setLoading(true); setError("");
    Promise.all([fetchTaxonomyCharacter(id, { signal: controller.signal }), fetchCharacterUsage(id, { signal: controller.signal })])
      .then(([character, usage]) => { if (active) setData({ character, usage }); })
      .catch((failure) => { if (active && failure.name !== "AbortError") setError(failure.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [id, reload]);
  return <Modal open title="View/edit global character" footer={null} width={850} maskClosable={!busy} closable={!busy} onCancel={() => { if (!busy) onClose(); }}>
    {loading ? <div role="status"><Spin size="small" /> Loading definition and usage…</div> : error ? <Alert type="error" message={error} action={<Button onClick={() => setReload((value) => value + 1)}>Retry</Button>} /> : data &&
      <LoadedEditor key={reload} {...data} onBusyChange={setBusy} onCopy={onCopy} onSaved={() => { onChanged(); onClose(); }} onStatesChanged={() => { onChanged(); setReload((value) => value + 1); }} />}
  </Modal>;
}
