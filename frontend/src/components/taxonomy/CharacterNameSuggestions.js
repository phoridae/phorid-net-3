import React, { useEffect, useState } from "react";
import { Alert, Button, Space, Tag, Typography } from "antd";
import { searchTaxonomyCharacters } from "../../utils/api/taxonomy";

const normalize = (name) => name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function similarity(left, right) {
  // Compare sorted words so word order alone does not hide a likely match.
  const a = left.split(" ").sort().join(" ");
  const b = right.split(" ").sort().join(" ");
  let row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= b.length; j += 1) {
      next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return 1 - row[b.length] / Math.max(a.length, b.length, 1);
}

export default function CharacterNameSuggestions({ name = "", busy, onUseExisting }) {
  const normalized = normalize(name);
  const [result, setResult] = useState({ name: "", matches: [], error: false });
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setDismissed(false);
    setResult({ name: normalized, matches: [], error: false });
    if (normalized.length < 2) return () => controller.abort();
    const timer = setTimeout(async () => {
      // The existing endpoint uses substring search. A broader word prefix also
      // retrieves candidates with small spelling or inflection differences.
      const longest = normalized.split(" ").sort((a, b) => b.length - a.length)[0];
      const prefix = longest.slice(0, Math.max(2, Math.ceil(longest.length * 0.7)));
      const queries = [...new Set([normalized.slice(0, 200), prefix.slice(0, 200)])];
      try {
        const pages = await Promise.all(queries.map((q) => searchTaxonomyCharacters(q, { signal: controller.signal })));
        const candidates = [...new Map(pages.flat().map((character) => [character.id, character])).values()];
        const matches = candidates.map((character) => {
          const candidate = normalize(character.name);
          return { character, exact: candidate === normalized, score: similarity(normalized, candidate) };
        }).filter(({ exact, score }) => exact || score >= 0.8)
          .sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score);
        if (active) setResult({ name: normalized, matches, error: false });
      } catch (failure) {
        if (active && failure.name !== "AbortError") setResult({ name: normalized, matches: [], error: true });
      }
    }, 350);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [normalized]);

  if (result.name !== normalized || dismissed) return null;
  if (result.error) return <Typography.Text type="secondary">Similar global characters could not be checked. You can still create this character.</Typography.Text>;
  if (!result.matches.length) return null;
  return <Alert showIcon type={result.matches.some((match) => match.exact) ? "warning" : "info"}
    message={result.matches.some((match) => match.exact) ? "A global character with the same name already exists." : "A similar global character may already exist."}
    description={<Space direction="vertical" style={{ width: "100%" }}>
      <Typography.Text>Distinct interpretations may share a name. You can reuse a definition or continue creating a new one.</Typography.Text>
      {result.matches.map(({ character, exact }) => <div key={character.id}>
        <Typography.Text strong>{character.name}</Typography.Text>{" · "}
        <Typography.Text>{character.anatomical_region || "Region unspecified"} · {character.data_type === "categorical" ? "Categorical" : "Numeric range"}</Typography.Text>
        <div>{character.data_type === "categorical"
          ? (character.states.length ? character.states.map((state) => <Tag key={state.id} title={state.description || undefined}>{state.name}</Tag>) : "No states defined")
          : `Unit: ${character.unit || "unspecified"}`}</div>
        <Typography.Text type="secondary">{exact ? "Same normalized name" : "Similar name"}</Typography.Text>{" "}
        <Button disabled={busy} onClick={() => onUseExisting(character)}>Use existing character</Button>
      </div>)}
      <Button disabled={busy} onClick={() => setDismissed(true)}>Continue creating new</Button>
    </Space>} />;
}
