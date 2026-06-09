import { apiUrl } from "./config";

export async function fetchCharacterData(label) {
  try {
    const response = await fetch(
      apiUrl(`/flies/keyCharacters?selectedGenus=${encodeURIComponent(label)}`)
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Failed to fetch character data:", error);
    throw error;
  }
}