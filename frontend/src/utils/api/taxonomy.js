import { auth } from "../../firebase";
import { apiUrl } from "./config";

export async function fetchTaxonomyWorkspaces({ signal } = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in.");

  const token = await user.getIdToken();
  const response = await fetch(apiUrl("/api/taxonomy/workspaces"), {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401) throw new Error("Your session could not be verified. Please sign in again.");
    if (response.status === 403) throw new Error("Admin access is required to load taxonomy workspaces.");
    throw new Error(typeof data?.error === "string" ? data.error : "Could not load taxonomy workspaces. Please try again.");
  }
  if (!Array.isArray(data)) throw new Error("The workspace API returned an unexpected response.");
  return data;
}
