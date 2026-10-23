import { auth } from "../../firebase";
import { apiUrl } from "./config";
import { fetchTaxonomyWorkspaces, importWorkspaceSpecies, removeWorkspaceSpecies } from "./taxonomy";

jest.mock("../../firebase", () => ({ auth: { currentUser: null } }));
const originalFetch = global.fetch;
beforeEach(() => {
  auth.currentUser = { getIdToken: jest.fn().mockResolvedValue("firebase-token") };
  global.fetch = jest.fn();
});
afterAll(() => { global.fetch = originalFetch; });

test("uses the configured API URL, Firebase bearer token and cancellation signal", async () => {
  const data = [{ id: "9007199254740993", name: "Revision" }];
  fetch.mockResolvedValue({ ok: true, json: async () => data });
  const controller = new AbortController();
  expect(await fetchTaxonomyWorkspaces({ signal: controller.signal })).toEqual(data);
  expect(fetch).toHaveBeenCalledWith(apiUrl("/api/taxonomy/workspaces"), {
    headers: { Authorization: "Bearer firebase-token" }, signal: controller.signal,
  });
});

test("does not send unauthenticated requests", async () => {
  auth.currentUser = null;
  await expect(fetchTaxonomyWorkspaces()).rejects.toThrow("You must be signed in.");
  expect(fetch).not.toHaveBeenCalled();
});

test.each([
  [401, "Your session could not be verified"],
  [403, "Admin access is required"],
  [500, "Database unavailable"],
])("reports HTTP %s as a controlled error", async (status, message) => {
  fetch.mockResolvedValue({ ok: false, status, json: async () => ({ error: "Database unavailable" }) });
  await expect(fetchTaxonomyWorkspaces()).rejects.toThrow(message);
});

test("handles malformed/error responses without displaying server HTML", async () => {
  fetch.mockResolvedValueOnce({ ok: false, status: 502, json: async () => { throw new Error("HTML response"); } });
  await expect(fetchTaxonomyWorkspaces()).rejects.toThrow("Could not load taxonomy workspaces");
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ unexpected: true }) });
  await expect(fetchTaxonomyWorkspaces()).rejects.toThrow("unexpected response");
});

test("imports only the selected COL ID using JSON and a Firebase bearer token", async () => {
  fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ species: { id: "2" } }) });
  await importWorkspaceSpecies("4", "FQL6");
  expect(fetch).toHaveBeenCalledWith(apiUrl("/api/taxonomy/workspaces/4/species/import"), expect.objectContaining({
    method: "POST", body: JSON.stringify({ col_xr_taxon_key: "FQL6" }),
    headers: { Authorization: "Bearer firebase-token", "Content-Type": "application/json" },
  }));
});

test("membership DELETE handles an empty 204 response and preserves controlled conflict status", async () => {
  fetch.mockResolvedValueOnce({ ok: true, status: 204 });
  expect(await removeWorkspaceSpecies("4", "2")).toBeNull();
  expect(fetch).toHaveBeenCalledWith(apiUrl("/api/taxonomy/workspaces/4/species/2"), expect.objectContaining({ method: "DELETE" }));
  fetch.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: "Descriptions are used by an identification key" }) });
  await expect(removeWorkspaceSpecies("4", "2")).rejects.toMatchObject({ status: 409 });
});
