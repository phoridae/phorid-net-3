import { API_BASE } from "./config";

export async function searchDropbox(query) {
  const res = await fetch(
    `${API_BASE}/api/dropbox/search?q=${encodeURIComponent(query)}`
  );

  if (!res.ok) {
    throw new Error("Dropbox search failed");
  }

  const json = await res.json();
  return json.results || [];
}

export async function openDropboxPdf(id) {
  const res = await fetch(`${API_BASE}/api/dropbox/open?path=${id}`);

  if (!res.ok) {
    throw new Error("Failed to open PDF");
  }

  const { link } = await res.json();
  return link;
}
