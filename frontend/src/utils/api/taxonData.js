import { apiUrl } from "./config";

/**
 * Fetch taxa matching selected character filters
 *
 * @param {string} selectedGenus
 * @param {object} selectedCharacters
 */
export async function fetchTaxonData(selectedGenus, selectedCharacters) {
  try {
    if (!selectedGenus) {
      throw new Error("selectedGenus is required");
    }

    if (!selectedCharacters) {
      throw new Error("selectedCharacters is required");
    }

    const params = new URLSearchParams({
      selectedGenus,
      ...selectedCharacters,
    });

    const response = await fetch(
      apiUrl(`/flies/selectedCharacters?${params.toString()}`)
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Failed to fetch taxon data:", error);
    throw error;
  }
}