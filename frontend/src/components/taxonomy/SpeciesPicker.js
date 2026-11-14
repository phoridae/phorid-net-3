import React, { useState } from "react";
import { Alert, Button, Select, Space, Table, Typography } from "antd";
import { importTaxonomySpecies, lookupTaxonomyTaxa, searchTaxonomySpecies } from "../../utils/api/taxonomy";
import { speciesName } from "./SpeciesManager";
import useDebouncedSearch from "./useDebouncedSearch";

const label = (species) => `${speciesName(species)} · ${species.species_status === "work_in_progress" ? "WIP" : "Published"}`;

export default function SpeciesPicker({ value, onChange, initialSpecies, disabled, id }) {
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState(initialSpecies || null);
  const search = useDebouncedSearch(query, searchTaxonomySpecies, { minLength: 2 });
  const options = new Map((search.data || []).map((species) => [species.id, species]));
  if (initialSpecies) options.set(initialSpecies.id, initialSpecies);
  if (chosen) options.set(chosen.id, chosen);
  return <>
    <Select id={id} aria-label="Current species" style={{ width: "100%" }} disabled={disabled} showSearch filterOption={false} value={value}
      placeholder="Search global published or working species" onSearch={setQuery} loading={search.loading}
      options={[...options.values()].map((species) => ({ value: species.id, label: label(species) }))}
      onChange={(selected) => { setChosen(options.get(selected)); onChange(selected); }}
      notFoundContent={search.loading ? "Searching…" : "Search by scientific or working name."} />
    {search.error && <Alert type="error" message={search.error} />}
  </>;
}

export function ImportSpeciesSuggestion({ candidate, onImported, onBusyChange }) {
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(action) {
    setBusy(true); onBusyChange(true); setError("");
    try { await action(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); onBusyChange(false); }
  }
  const importSpecies = (id) => run(async () => { const result = await importTaxonomySpecies(id); onImported(result.species); });
  return <Space direction="vertical" style={{ width: "100%", marginBottom: 16 }}>
    <Typography.Text>Choose another existing species above, or resolve and import the suggested species.</Typography.Text>
    <Button disabled={busy} loading={busy} onClick={() => candidate.col_xr_taxon_key ? importSpecies(candidate.col_xr_taxon_key) : run(async () => setResults(await lookupTaxonomyTaxa(candidate.scientific_name || `${candidate.genus} ${candidate.specific_epithet || ""}`, "SPECIES")))}>Add/import this species</Button>
    {error && <Alert type="error" message={error} />}
    {results && <Table size="small" rowKey="col_xr_taxon_key" dataSource={results} pagination={{ pageSize: 5 }} columns={[
      { title: "Suggested species", dataIndex: "canonical_name" }, { title: "COL XR", dataIndex: "col_xr_taxon_key" },
      { title: "Action", render: (_, taxon) => <Button disabled={busy || !taxon.importable} onClick={() => importSpecies(taxon.col_xr_taxon_key)}>Import this species</Button> },
    ]} />}
  </Space>;
}
