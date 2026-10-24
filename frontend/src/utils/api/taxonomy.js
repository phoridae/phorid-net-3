import { auth } from "../../firebase";
import { apiUrl } from "./config";

async function taxonomyRequest(path, { signal, method = "GET", body, fallback = "Taxonomy request failed. Please try again." } = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in.");

  const token = await user.getIdToken();
  const response = await fetch(apiUrl(`/api/taxonomy${path}`), {
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    signal, ...(method !== "GET" ? { method } : {}), ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401) throw new Error("Your session could not be verified. Please sign in again.");
    if (response.status === 403) throw new Error("Admin access is required for taxonomy tools.");
    throw Object.assign(new Error(typeof data?.error === "string" ? data.error : fallback), { status: response.status });
  }
  return data;
}

export async function fetchTaxonomyWorkspaces({ signal } = {}) {
  const data = await taxonomyRequest("/workspaces", { signal, fallback: "Could not load taxonomy workspaces. Please try again." });
  if (!Array.isArray(data)) throw new Error("The workspace API returned an unexpected response.");
  return data;
}

export const fetchWorkspaceSpecies = (id, options) => taxonomyRequest(`/workspaces/${encodeURIComponent(id)}/species`, options);
export const searchTaxonomySpecies = (q, options) => taxonomyRequest(`/species/search?q=${encodeURIComponent(q)}`, options);
export async function lookupTaxonomyTaxa(q, rank = "SPECIES", options) {
  const data = await taxonomyRequest(`/lookup/gbif/taxa?${new URLSearchParams({ q, rank })}`, options);
  return data.results;
}
export const createTaxonomySpecies = (body) => taxonomyRequest("/species", { method: "POST", body });
export const addWorkspaceSpecies = (id, speciesId) => taxonomyRequest(`/workspaces/${encodeURIComponent(id)}/species`, { method: "POST", body: { species_id: speciesId } });
export const importWorkspaceSpecies = (id, colId) => taxonomyRequest(`/workspaces/${encodeURIComponent(id)}/species/import`, { method: "POST", body: { col_xr_taxon_key: colId } });
export const removeWorkspaceSpecies = (id, speciesId) => taxonomyRequest(`/workspaces/${encodeURIComponent(id)}/species/${encodeURIComponent(speciesId)}`, { method: "DELETE" });

export const fetchWorkspaceCharacters = (id, options) => taxonomyRequest(`/workspaces/${encodeURIComponent(id)}/characters`, options);
export const searchTaxonomyCharacters = (q, options) => taxonomyRequest(`/characters/search?q=${encodeURIComponent(q)}`, options);
export const fetchTaxonomyCharacter = (id, options) => taxonomyRequest(`/characters/${encodeURIComponent(id)}`, options);
export const fetchCharacterUsage = (id, options) => taxonomyRequest(`/characters/${encodeURIComponent(id)}/usage`, options);
export const createCharacterWithStates = (body) => taxonomyRequest("/characters/with-states", { method: "POST", body });
export const updateTaxonomyCharacter = (id, body) => taxonomyRequest(`/characters/${encodeURIComponent(id)}`, { method: "PATCH", body });
export const addCharacterState = (id, body) => taxonomyRequest(`/characters/${encodeURIComponent(id)}/states`, { method: "POST", body });
export const removeCharacterState = (id, stateId) => taxonomyRequest(`/characters/${encodeURIComponent(id)}/states/${encodeURIComponent(stateId)}`, { method: "DELETE" });
export const addWorkspaceCharacter = (id, characterId) => taxonomyRequest(`/workspaces/${encodeURIComponent(id)}/characters`, { method: "POST", body: { character_id: characterId } });
export const removeWorkspaceCharacter = (id, characterId) => taxonomyRequest(`/workspaces/${encodeURIComponent(id)}/characters/${encodeURIComponent(characterId)}`, { method: "DELETE" });
