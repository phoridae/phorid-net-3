import React, { useState } from "react";
import { Alert, Select } from "antd";
import { searchTaxonomySpecies } from "../../utils/api/taxonomy";
import { speciesName } from "./SpeciesManager";
import useDebouncedSearch from "./useDebouncedSearch";

const label = (species) => `${speciesName(species)} · ${species.species_status === "work_in_progress" ? "WIP" : "Published"}`;

export default function SpeciesPicker({ value, onChange, initialSpecies, disabled, id, onSelected, ariaLabel = "Current species" }) {
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState(initialSpecies || null);
  const search = useDebouncedSearch(query, searchTaxonomySpecies, { minLength: 2 });
  const options = new Map((search.data || []).map((species) => [species.id, species]));
  if (initialSpecies) options.set(initialSpecies.id, initialSpecies);
  if (chosen) options.set(chosen.id, chosen);
  return <>
    <Select id={id} aria-label={ariaLabel} style={{ width: "100%" }} disabled={disabled} showSearch filterOption={false} value={value}
      placeholder="Search global published or working species" onSearch={setQuery} loading={search.loading}
      options={[...options.values()].map((species) => ({ value: species.id, label: label(species) }))}
      onChange={(selected) => { setChosen(options.get(selected)); onChange(selected); onSelected?.(options.get(selected)); }}
      notFoundContent={search.loading ? "Searching…" : "Search by scientific or working name."} />
    {search.error && <Alert type="error" message={search.error} />}
  </>;
}
