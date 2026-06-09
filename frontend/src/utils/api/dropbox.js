import { auth } from "../../firebase";
import { apiUrl } from "./config";

async function getAuthHeaders() {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("You must be signed in.");
  }

  const token = await user.getIdToken();

  return {
    Authorization: `Bearer ${token}`,
  };
}

export async function searchDropbox(query) {
  const headers = await getAuthHeaders();

  const response = await fetch(
    apiUrl(`/api/dropbox/search?q=${encodeURIComponent(query)}`),
    { headers }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Dropbox search failed");
  }

  const data = await response.json();
  return data.results || [];
}

export async function openDropboxPdf(path) {
  const headers = await getAuthHeaders();

  const response = await fetch(
    apiUrl(`/api/dropbox/open?path=${encodeURIComponent(path)}`),
    { headers }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to open PDF");
  }

  const data = await response.json();
  return data.link;
}