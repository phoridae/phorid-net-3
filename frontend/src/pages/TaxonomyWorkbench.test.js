import React from "react";
import { fireEvent, render as renderReact, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import TaxonomyWorkbench from "./TaxonomyWorkbench";
import TaxonomySection, { taxonomySections } from "../components/taxonomy/TaxonomySection";
import SpeciesManager from "../components/taxonomy/SpeciesManager";
import CharacterManager from "../components/taxonomy/CharacterManager";
import SpecimenManager from "../components/taxonomy/SpecimenManager";
import { useAuth } from "../auth/AuthContext";
import { fetchTaxonomyWorkspaces, fetchWorkspaceCharacters, fetchWorkspaceSpecies, searchTaxonomySpecimens, fetchWorkspaceSpecimens, fetchTaxonomySpecimen, putWorkspaceSpecimenIdentification, searchTaxonomySpecies } from "../utils/api/taxonomy";

jest.mock("../auth/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../utils/api/taxonomy", () => ({ fetchTaxonomyWorkspaces: jest.fn(), fetchWorkspaceSpecies: jest.fn(), fetchWorkspaceCharacters: jest.fn(), searchTaxonomySpecimens: jest.fn(), fetchWorkspaceSpecimens: jest.fn(), fetchTaxonomySpecimen: jest.fn(), putWorkspaceSpecimenIdentification: jest.fn(), searchTaxonomySpecies: jest.fn() }));

const workspaces = [
  { id: "9007199254740993", name: "Canada revision", description: "Canadian research", visibility: "private", owner_uid: "another-researcher" },
  { id: "2", name: "USA revision", description: null, visibility: "shared", owner_uid: "editor" },
];

let initialPath;
function NavigationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <div aria-label="Current path">{location.pathname}</div>
      <button onClick={() => navigate(-1)}>Back a section</button>
    </>
  );
}
function TestRouter({ children }) {
  return (
    <MemoryRouter initialEntries={[initialPath]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <NavigationProbe />
      <Routes>
        <Route path="/admin/taxonomy" element={children}>
          <Route index element={<Navigate to="species" replace />} />
          {taxonomySections.map(({ key }) => <Route key={key} path={key} element={key === "species" ? <SpeciesManager /> : key === "characters" ? <CharacterManager /> : key === "specimens" ? <SpecimenManager /> : <TaxonomySection sectionKey={key} />} />)}
          <Route path="*" element={<Navigate to="/admin/taxonomy/species" replace />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}
function render(ui) {
  return renderReact(ui, { wrapper: TestRouter });
}

beforeEach(() => {
  window.matchMedia = jest.fn().mockImplementation((query) => ({ matches: false, media: query, addListener: jest.fn(), removeListener: jest.fn(), addEventListener: jest.fn(), removeEventListener: jest.fn() }));
  initialPath = "/admin/taxonomy";
  sessionStorage.clear();
  useAuth.mockReturnValue({ user: { uid: "editor" }, authLoading: false });
  fetchTaxonomyWorkspaces.mockReset();
  fetchTaxonomyWorkspaces.mockResolvedValue(workspaces);
  fetchWorkspaceSpecies.mockReset();
  fetchWorkspaceSpecies.mockResolvedValue([]);
  fetchWorkspaceCharacters.mockResolvedValue([]);
  searchTaxonomySpecimens.mockResolvedValue([]);
  fetchWorkspaceSpecimens.mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

async function chooseWorkspace(name) {
  await waitFor(() => expect(screen.getByRole("combobox")).not.toBeDisabled());
  fireEvent.mouseDown(screen.getByRole("combobox"));
  fireEvent.click(await screen.findByText(name));
}

test("loads workspaces and permits selection regardless of owner without exposing UIDs", async () => {
  let resolve;
  fetchTaxonomyWorkspaces.mockReturnValue(new Promise((done) => { resolve = done; }));
  render(<TaxonomyWorkbench />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading workspaces");
  expect(screen.getByRole("combobox")).toBeDisabled();
  resolve(workspaces);
  await chooseWorkspace("Canada revision");
  const summary = screen.getByLabelText("Current workspace");
  expect(within(summary).getByRole("heading", { name: "Canada revision" })).toBeInTheDocument();
  expect(summary).toHaveTextContent("Canadian research");
  expect(summary).toHaveTextContent("Visibility: private");
  expect(screen.queryByText("another-researcher")).not.toBeInTheDocument();
  expect(sessionStorage.getItem("taxonomy-workspace:editor")).toBe("9007199254740993");
});

test("handles an empty list without an active selector", async () => {
  fetchTaxonomyWorkspaces.mockResolvedValue([]);
  render(<TaxonomyWorkbench />);
  expect(await screen.findByText("No taxonomy workspaces are available yet.")).toBeInTheDocument();
  expect(screen.getByRole("combobox")).toBeDisabled();
});

test("shows errors and retries loading", async () => {
  fetchTaxonomyWorkspaces.mockRejectedValueOnce(new Error("Admin access required"));
  render(<TaxonomyWorkbench />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Admin access required");
  expect(screen.getByRole("combobox")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await chooseWorkspace("USA revision");
  expect(screen.getByLabelText("Current workspace")).toHaveTextContent("No workspace description provided.");
  expect(fetchTaxonomyWorkspaces).toHaveBeenCalledTimes(2);
});

test("restores valid selection on return, but removes IDs absent from the latest API list", async () => {
  sessionStorage.setItem("taxonomy-workspace:editor", "2");
  const view = render(<TaxonomyWorkbench />);
  expect(await screen.findByLabelText("Current workspace")).toHaveTextContent("USA revision");
  view.unmount();
  fetchTaxonomyWorkspaces.mockResolvedValue([workspaces[0]]);
  render(<TaxonomyWorkbench />);
  expect(await screen.findByText("Select a workspace to begin working with taxonomy data.")).toBeInTheDocument();
  expect(sessionStorage.getItem("taxonomy-workspace:editor")).toBeNull();
});

test("waits for Firebase auth and scopes stored selection to the current user", async () => {
  sessionStorage.setItem("taxonomy-workspace:other-user", "2");
  useAuth.mockReturnValue({ user: null, authLoading: true });
  const view = render(<TaxonomyWorkbench />);
  expect(fetchTaxonomyWorkspaces).not.toHaveBeenCalled();
  useAuth.mockReturnValue({ user: { uid: "editor" }, authLoading: false });
  view.rerender(<TaxonomyWorkbench />);
  expect(await screen.findByText("Select a workspace to begin working with taxonomy data.")).toBeInTheDocument();
  expect(screen.queryByLabelText("Current workspace")).not.toBeInTheDocument();
});

test("selection works when session storage is blocked", async () => {
  jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Blocked"); });
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Blocked"); });
  render(<TaxonomyWorkbench />);
  await chooseWorkspace("USA revision");
  expect(await screen.findByLabelText("Current workspace")).toHaveTextContent("USA revision");
});

test("aborts requests on unmount", async () => {
  fetchTaxonomyWorkspaces.mockReturnValue(new Promise(() => {}));
  const view = render(<TaxonomyWorkbench />);
  const signal = fetchTaxonomyWorkspaces.mock.calls[0][0].signal;
  view.unmount();
  expect(signal.aborted).toBe(true);
});

test("the base route defaults to Species; global Specimens remains available before workspace selection", async () => {
  render(<TaxonomyWorkbench />);
  expect(await screen.findByText("Select a workspace to begin working with taxonomy data.")).toBeInTheDocument();
  expect(screen.getByLabelText("Current path")).toHaveTextContent("/admin/taxonomy/species");
  expect(screen.getByRole("tab", { name: "Species" })).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByRole("tab", { name: "Specimens" })).not.toHaveAttribute("aria-disabled", "true");
  expect(screen.queryByRole("heading", { name: "Species" })).not.toBeInTheDocument();
  await chooseWorkspace("Canada revision");
  expect(screen.getByRole("tab", { name: "Species" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("heading", { name: "Species in this workspace" })).toBeInTheDocument();
});

test("section URLs and browser history stay in sync while sharing workspace state", async () => {
  render(<TaxonomyWorkbench />);
  await chooseWorkspace("Canada revision");
  for (const [name, path] of [["Specimens", "specimens"], ["Characters", "characters"], ["Data Entry", "data-entry"], ["Descriptions", "descriptions"], ["Keys", "keys"]]) {
    fireEvent.click(screen.getByRole("tab", { name }));
    expect(await screen.findByRole("heading", { name: name === "Characters" ? "Characters in this workspace" : name === "Specimens" ? "Specimens in Canada revision" : name })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Current path")).toHaveTextContent(`/admin/taxonomy/${path}`);
    expect(screen.getByLabelText("Current workspace")).toHaveTextContent("Canada revision");
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  }
  expect(screen.getAllByRole("heading", { name: "Taxonomy Workbench" })).toHaveLength(1);
  expect(fetchTaxonomyWorkspaces).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Back a section" }));
  expect(await screen.findByRole("heading", { name: "Descriptions" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Descriptions" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByLabelText("Current workspace")).toHaveTextContent("Canada revision");
});

test("a direct section link restores the workspace and permits changing it without changing section", async () => {
  initialPath = "/admin/taxonomy/specimens";
  sessionStorage.setItem("taxonomy-workspace:editor", "2");
  render(<TaxonomyWorkbench />);
  expect(await screen.findByRole("heading", { name: "Specimens in USA revision" })).toBeInTheDocument();
  expect(screen.getByText("These are global specimen records currently being interpreted in this workspace.")).toBeInTheDocument();
  expect(await screen.findByLabelText("Current workspace")).toHaveTextContent("USA revision");
  await chooseWorkspace("Canada revision");
  expect(screen.getByLabelText("Current path")).toHaveTextContent("/admin/taxonomy/specimens");
  expect(screen.getByLabelText("Current workspace")).toHaveTextContent("Canada revision");
  expect(fetchTaxonomyWorkspaces).toHaveBeenCalledTimes(1);
});

test("Data Entry presents both specimen scoring and literature digitization as planned workflows", async () => {
  initialPath = "/admin/taxonomy/data-entry";
  sessionStorage.setItem("taxonomy-workspace:editor", "2");
  render(<TaxonomyWorkbench />);
  expect(await screen.findByRole("heading", { name: "Data Entry" })).toBeInTheDocument();
  expect(screen.getByText("Score individual specimens.")).toBeInTheDocument();
  expect(screen.getByText("Digitize structured species-description data from literature.")).toBeInTheDocument();
  expect(screen.getByText("Tools for this section will be added next.")).toBeInTheDocument();
});

test("normal specimen list requires workspace selection and preserves its query when workspace changes", async () => {
  initialPath = "/admin/taxonomy/specimens";
  fetchWorkspaceSpecimens.mockResolvedValue([{ id: "17", specimen_label: "Global voucher", reference_type: "local" }]);
  render(<TaxonomyWorkbench />);
  await screen.findByText(/Select a workspace to see specimens currently interpreted there/);
  expect(fetchWorkspaceSpecimens).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Search curated specimens")).toBeDisabled();
  await chooseWorkspace("Canada revision");
  await screen.findByText("Global voucher");
  fireEvent.change(screen.getByLabelText("Search curated specimens"), { target: { value: "USNM" } });
  await waitFor(() => expect(fetchWorkspaceSpecimens).toHaveBeenLastCalledWith("9007199254740993", "USNM", expect.any(Object)));
  await chooseWorkspace("USA revision");
  expect(screen.getByLabelText("Search curated specimens")).toHaveValue("USNM");
  await waitFor(() => expect(fetchWorkspaceSpecimens).toHaveBeenLastCalledWith("2", "USNM", expect.any(Object)));
  expect(searchTaxonomySpecimens).not.toHaveBeenCalled();
});

test("saving a workspace specimen identification makes its species available in the Species tab", async () => {
  initialPath = "/admin/taxonomy/specimens";
  sessionStorage.setItem("taxonomy-workspace:editor", "2");
  const working = { id: "9", genus: "Myriophora", working_name: "JH-04", species_status: "work_in_progress" };
  const specimen = { id: "17", specimen_label: "Global voucher", reference_type: "local", workspace_identification: { workspace_id: "2", species_id: "1", species: { id: "1", genus: "Phoragenus", specific_epithet: "alpha", species_status: "published" } } };
  let assigned = false;
  fetchWorkspaceSpecimens.mockResolvedValue([specimen]);
  fetchTaxonomySpecimen.mockResolvedValue(specimen);
  searchTaxonomySpecies.mockResolvedValue([working]);
  putWorkspaceSpecimenIdentification.mockImplementation(async () => { assigned = true; return { workspace_id: "2", species_id: "9", species: working }; });
  fetchWorkspaceSpecies.mockImplementation(async () => assigned ? [working] : []);
  render(<TaxonomyWorkbench />);
  await screen.findByText("Global voucher");
  fireEvent.click(screen.getByRole("button", { name: "View/edit specimen" }));
  const picker = await screen.findByRole("combobox", { name: "Identification in USA revision" });
  fireEvent.mouseDown(picker);
  fireEvent.change(picker, { target: { value: "JH-04" } });
  fireEvent.click(await screen.findByText("Myriophora sp. JH-04 · WIP", { selector: ".ant-select-item-option-content" }));
  fireEvent.click(screen.getByRole("button", { name: "Save workspace identification" }));
  await screen.findByText("Specimen saved. Existing observations and evidence are unchanged.");
  expect(putWorkspaceSpecimenIdentification).toHaveBeenCalledWith("2", "17", { species_id: "9", notes: null });
  fireEvent.click(screen.getByRole("tab", { name: "Species" }));
  expect(await screen.findByText("Myriophora sp. JH-04")).toBeInTheDocument();
});
