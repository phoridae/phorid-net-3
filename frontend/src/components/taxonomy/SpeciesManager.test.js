import React, { act } from "react";
import userEvent from "@testing-library/user-event";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useOutletContext } from "react-router-dom";
import SpeciesManager, { groupSpeciesSearchResults } from "./SpeciesManager";
import { addWorkspaceSpecies, createTaxonomySpecies, fetchWorkspaceSpecies, importWorkspaceSpecies, lookupTaxonomyTaxa, removeWorkspaceSpecies, searchTaxonomySpecies } from "../../utils/api/taxonomy";

jest.mock("react-router-dom", () => ({ ...jest.requireActual("react-router-dom"), useOutletContext: jest.fn() }));
jest.mock("../../utils/api/taxonomy", () => ({ addWorkspaceSpecies: jest.fn(), createTaxonomySpecies: jest.fn(), fetchWorkspaceSpecies: jest.fn(), importWorkspaceSpecies: jest.fn(), lookupTaxonomyTaxa: jest.fn(), removeWorkspaceSpecies: jest.fn(), searchTaxonomySpecies: jest.fn() }));
const member = { id: "1", genus: "Phoragenus", specific_epithet: "alpha", species_status: "published", gbif_taxon_key: "123", col_xr_taxon_key: "COL1", descriptions: [{ id: "10" }] };
const working = { id: "2", genus: "Apocephalus", specific_epithet: null, working_name: "AZ-17", species_status: "work_in_progress", gbif_taxon_key: null, col_xr_taxon_key: null, descriptions: [] };
const computed = window.getComputedStyle;
beforeEach(() => {
  window.matchMedia = jest.fn().mockImplementation((query) => ({ matches: false, media: query, addListener: jest.fn(), removeListener: jest.fn(), addEventListener: jest.fn(), removeEventListener: jest.fn() }));
  jest.spyOn(window, "getComputedStyle").mockImplementation((node) => computed(node));
});
afterAll(() => jest.restoreAllMocks());
beforeEach(() => {
  jest.clearAllMocks();
  useOutletContext.mockReturnValue({ currentWorkspace: { id: "4", name: "Canada" } });
  fetchWorkspaceSpecies.mockResolvedValue([member]);
  searchTaxonomySpecies.mockResolvedValue([]);
  lookupTaxonomyTaxa.mockResolvedValue([]);
  createTaxonomySpecies.mockResolvedValue(working);
  addWorkspaceSpecies.mockResolvedValue({});
  importWorkspaceSpecies.mockResolvedValue({ species: working });
  removeWorkspaceSpecies.mockResolvedValue(null);
});
async function openAdd() {
  render(<SpeciesManager />);
  const button = screen.getByRole("button", { name: "Add species" });
  await waitFor(() => expect(button).not.toBeDisabled());
  fireEvent.click(button);
}
async function manual() {
  await openAdd();
  fireEvent.click(screen.getByRole("button", { name: "Create working taxon manually" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Enter genus manually" }));
  fireEvent.change(screen.getByLabelText("Genus"), { target: { value: "Apocephalus" } });
  fireEvent.change(screen.getByLabelText("Working / code name"), { target: { value: "AZ-17" } });
}

test("workspace species table shows both identifiers and removes only workspace membership after confirmation", async () => {
  render(<SpeciesManager />);
  expect(await screen.findByText("Phoragenus alpha")).toBeInTheDocument();
  expect(screen.getByText("COL1")).toBeInTheDocument();
  expect(screen.getByText("123")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Remove from workspace" }));
  expect(removeWorkspaceSpecies).not.toHaveBeenCalled();
  expect(await screen.findByText(/This also removes this workspace's descriptions/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "OK" }));
  await waitFor(() => expect(removeWorkspaceSpecies).toHaveBeenCalledWith("4", "1"));
  expect(await screen.findByText(/The global species record remains/)).toBeInTheDocument();
});

test("external lookup is debounced, shows local/workspace availability and imports through the adapter", async () => {
  searchTaxonomySpecies.mockResolvedValue([member]);
  lookupTaxonomyTaxa.mockResolvedValue([{ col_xr_taxon_key: "FQL6", canonical_name: "Apocephalus gemellus", rank: "SPECIES", taxonomic_status: "ACCEPTED", genus: "Apocephalus", specific_epithet: "gemellus", gbif_taxon_key: null, importable: true, local_species_id: null }]);
  await openAdd();
  const input = screen.getByLabelText("Find species");
  fireEvent.change(input, { target: { value: "Ap" } });
  fireEvent.change(input, { target: { value: "Apo" } });
  expect(lookupTaxonomyTaxa).not.toHaveBeenCalled();
  expect(await screen.findByText("Apocephalus gemellus", { selector: "strong" })).toBeInTheDocument();
  expect(lookupTaxonomyTaxa).toHaveBeenCalledTimes(1);
  expect(lookupTaxonomyTaxa.mock.calls[0][0]).toBe("Apo");
  expect(screen.getByText("Already in workspace")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Already in workspace" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Import and add" }));
  await waitFor(() => expect(importWorkspaceSpecies).toHaveBeenCalledWith("4", "FQL6"));
  expect(createTaxonomySpecies).not.toHaveBeenCalled();
  expect(await screen.findByText("Apocephalus sp. AZ-17 added to workspace.")).toBeInTheDocument();
});

test.each([false, true])("linked external species appears once as curated, with workspace membership %s", async (alreadyMember) => {
  const curated = { ...member, genus: "Myriophora", specific_epithet: "wellsorum", working_name: "curated interpretation" };
  fetchWorkspaceSpecies.mockResolvedValue(alreadyMember ? [curated] : []);
  searchTaxonomySpecies.mockResolvedValue([curated]);
  lookupTaxonomyTaxa.mockResolvedValue([
    { ...curated, canonical_name: "Myriophora wellsorum", local_species_id: "1", importable: true },
    { col_xr_taxon_key: "EXTERNAL", canonical_name: "Myriophora other", genus: "Myriophora", specific_epithet: "other", importable: true },
  ]);
  await openAdd();
  fireEvent.change(screen.getByLabelText("Find species"), { target: { value: "Myriophora" } });
  const modal = within(screen.getByRole("dialog"));
  expect(await modal.findByText("Myriophora other", { selector: "strong" })).toBeInTheDocument();
  expect(modal.getAllByText("Myriophora wellsorum (curated interpretation)")).toHaveLength(1);
  expect(modal.queryByText("Myriophora wellsorum", { selector: "strong" })).not.toBeInTheDocument();
  const curatedRow = within(modal.getByText("Myriophora wellsorum (curated interpretation)").closest("tr"));
  expect(curatedRow.getByText("In taxonomy database")).toBeInTheDocument();
  expect(curatedRow.getByText(/COL XR: COL1/)).toBeInTheDocument();
  expect(curatedRow.getByText(/GBIF Backbone: 123/)).toBeInTheDocument();
  expect(modal.getAllByRole("button", { name: "Import and add" })).toHaveLength(1);
  const externalRow = within(modal.getByText("Myriophora other", { selector: "strong" }).closest("tr"));
  expect(externalRow.getByText("GBIF/COL")).toBeInTheDocument();
  const action = curatedRow.getByRole("button", { name: alreadyMember ? "Already in workspace" : "Add to workspace" });
  if (alreadyMember) {
    expect(action).toBeDisabled();
  } else {
    fireEvent.click(action);
    await waitFor(() => expect(addWorkspaceSpecies).toHaveBeenCalledWith("4", "1"));
  }
  expect(importWorkspaceSpecies).not.toHaveBeenCalled();
});

test.each(["col_xr_taxon_key", "gbif_taxon_key"])("exact %s identity suppresses an external row without a linked ID", (field) => {
  const taxon = { [field]: member[field], canonical_name: "Different external name" };
  const result = groupSpeciesSearchResults([member], [taxon]);
  expect(result.curated).toEqual([member]);
  expect(result.externalOnly).toEqual([]);
});

test.each(["existing_species_id", "local_species_id"])("%s retains linked species omitted from curated search", (field) => {
  const linked = { [field]: 1, genus: "Phoragenus", specific_epithet: "alpha", col_xr_taxon_key: "COL1", gbif_taxon_key: "123" };
  const fallback = groupSpeciesSearchResults([], [linked]);
  expect(fallback.curated).toEqual([{ id: 1, genus: "Phoragenus", specific_epithet: "alpha", col_xr_taxon_key: "COL1", gbif_taxon_key: "123" }]);
  expect(fallback.externalOnly).toEqual([]);
  // Prefer curated metadata from workspace membership when it is available.
  expect(groupSpeciesSearchResults([], [linked], [member]).curated).toEqual([member]);
});

test("names alone never collapse records, and identifiers remain independent", () => {
  const sameName = { genus: member.genus, specific_epithet: member.specific_epithet, col_xr_taxon_key: "OTHER", gbif_taxon_key: "999" };
  const sameValueDifferentSystem = { col_xr_taxon_key: member.gbif_taxon_key, gbif_taxon_key: null };
  const result = groupSpeciesSearchResults([member, working], [sameName, sameValueDifferentSystem]);
  expect(result.curated).toEqual([member, working]);
  expect(result.externalOnly).toEqual([sameName, sameValueDifferentSystem]);
});

test("linked external identifiers enrich the curated display without overwriting local values", () => {
  const local = { ...member, gbif_taxon_key: null };
  const external = { local_species_id: "1", gbif_taxon_key: "123", col_xr_taxon_key: "DIFFERENT" };
  expect(groupSpeciesSearchResults([local], [external]).curated).toEqual([member]);
  expect(local.gbif_taxon_key).toBeNull();
});

test("manual genus fallback creates a WIP taxon with no identifiers and attaches its global ID", async () => {
  await manual();
  fireEvent.click(screen.getByRole("button", { name: "Check and add species" }));
  await waitFor(() => expect(createTaxonomySpecies).toHaveBeenCalledWith(expect.objectContaining({ genus: "Apocephalus", working_name: "AZ-17", specific_epithet: null, species_status: "work_in_progress" })));
  expect(createTaxonomySpecies.mock.calls[0][0]).not.toHaveProperty("gbif_taxon_key");
  await waitFor(() => expect(addWorkspaceSpecies).toHaveBeenCalledWith("4", "2"));
});

test("standardized genus search plus working name offers likely existing global species before creating", async () => {
  lookupTaxonomyTaxa.mockResolvedValue([{ genus: "Apocephalus", taxonomic_status: "ACCEPTED" }]);
  searchTaxonomySpecies.mockResolvedValue([working]);
  await openAdd();
  fireEvent.click(screen.getByRole("button", { name: "Create working taxon manually" }));
  fireEvent.mouseDown(screen.getByLabelText("Genus"));
  fireEvent.change(screen.getByLabelText("Genus"), { target: { value: "Apo" } });
  fireEvent.click(await screen.findByText("Apocephalus", { selector: ".ant-select-item-option-content" }));
  expect(lookupTaxonomyTaxa.mock.calls[0][1]).toBe("GENUS");
  fireEvent.change(screen.getByLabelText("Working / code name"), { target: { value: "AZ-17" } });
  fireEvent.click(screen.getByRole("button", { name: "Check and add species" }));
  expect(await screen.findByText("Potential existing global species found")).toBeInTheDocument();
  expect(createTaxonomySpecies).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Use existing species" }));
  await waitFor(() => expect(addWorkspaceSpecies).toHaveBeenCalledWith("4", "2"));
  expect(createTaxonomySpecies).not.toHaveBeenCalled();
  expect(await screen.findByText("Apocephalus sp. AZ-17 added to workspace.")).toBeInTheDocument();
});

test("failed membership after manual creation retries the existing ID without creating a second species", async () => {
  addWorkspaceSpecies.mockRejectedValueOnce(new Error("Membership unavailable"));
  await manual();
  fireEvent.click(screen.getByRole("button", { name: "Check and add species" }));
  expect(await screen.findByText("Membership unavailable")).toBeInTheDocument();
  expect(await screen.findByText("The global species record has been created.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry adding to workspace" }));
  await waitFor(() => expect(addWorkspaceSpecies).toHaveBeenCalledTimes(2));
  expect(createTaxonomySpecies).toHaveBeenCalledTimes(1);
});

test("workspace load and external search failures remain visible with recovery controls", async () => {
  fetchWorkspaceSpecies.mockRejectedValueOnce(new Error("Workspace unavailable"));
  render(<SpeciesManager />);
  expect(await screen.findByText("Workspace unavailable")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Add species" })).not.toBeDisabled());
  fireEvent.click(screen.getByRole("button", { name: "Add species" }));
  lookupTaxonomyTaxa.mockRejectedValue(new Error("COL service unavailable"));
  fireEvent.change(screen.getByLabelText("Find species"), { target: { value: "Apo" } });
  expect(await screen.findByText("COL service unavailable")).toBeInTheDocument();
});


const typeText = (input, text) => act(() => userEvent.type(input, text));
const clickControl = (control) => act(() => userEvent.click(control));
const clearText = (input) => act(() => userEvent.clear(input));

async function manualForm({ manualGenus = true } = {}) {
  await openAdd();
  fireEvent.click(screen.getByRole("button", { name: "Create working taxon manually" }));
  if (manualGenus) clickControl(screen.getByRole("checkbox", { name: "Enter genus manually" }));
}
async function standardizedGenus() {
  lookupTaxonomyTaxa.mockResolvedValue([{ genus: "Dohrniphora", taxonomic_status: "ACCEPTED" }]);
  const genus = screen.getByLabelText("Genus");
  fireEvent.mouseDown(genus);
  typeText(genus, "Dohr");
  fireEvent.click(await screen.findByText("Dohrniphora", { selector: ".ant-select-item-option-content" }));
}
async function publishedStatus() {
  fireEvent.mouseDown(screen.getByLabelText("Species status"));
  fireEvent.click(await screen.findByText("Published", { selector: ".ant-select-item-option-content" }));
}

test.each(["Newgenus", "TESTIPHORIA", "PhoridaeGenusA"])("manual genus permits arbitrary keyboard input: %s", async (name) => {
  await manualForm();
  const genus = screen.getByRole("textbox", { name: "Genus" });
  const epithet = screen.getByRole("textbox", { name: "Specific epithet" });
  expect(genus).toBeEnabled(); expect(epithet).toBeEnabled();
  typeText(genus, name);
  typeText(epithet, "examplei");
  expect(genus).toHaveValue(name); expect(epithet).toHaveValue("examplei");
  expect(lookupTaxonomyTaxa).not.toHaveBeenCalled();
});

test("published manually entered genus and epithet can be created", async () => {
  await manualForm();
  typeText(screen.getByLabelText("Genus"), "Newgenus");
  typeText(screen.getByLabelText("Specific epithet"), "examplei");
  await publishedStatus();
  fireEvent.click(screen.getByRole("button", { name: "Check and add species" }));
  await waitFor(() => expect(createTaxonomySpecies).toHaveBeenCalledWith(expect.objectContaining({ genus: "Newgenus", specific_epithet: "examplei", species_status: "published" })));
});

test("standardized genus requires lookup selection while epithet is editable before and after selection", async () => {
  await manualForm({ manualGenus: false });
  const epithet = screen.getByLabelText("Specific epithet");
  typeText(epithet, "testensis");
  const genus = screen.getByRole("combobox", { name: "Genus" });
  typeText(genus, "Unconfirmedgenus");
  fireEvent.click(screen.getByRole("button", { name: "Check and add species" }));
  await screen.findByText("Choose or enter a genus.");
  expect(createTaxonomySpecies).not.toHaveBeenCalled();
  clearText(genus);
  await standardizedGenus();
  expect(epithet).toBeEnabled();
  clearText(epithet); typeText(epithet, "examplei");
  fireEvent.click(screen.getByRole("button", { name: "Check and add species" }));
  await waitFor(() => expect(createTaxonomySpecies).toHaveBeenCalledWith(expect.objectContaining({ genus: "Dohrniphora", specific_epithet: "examplei", species_status: "work_in_progress" })));
  expect(lookupTaxonomyTaxa).toHaveBeenCalledWith("Dohr", "GENUS", { signal: expect.any(AbortSignal) });
});

test("WIP with no epithet requires a nonblank working name", async () => {
  await manualForm();
  typeText(screen.getByLabelText("Genus"), "Dohrniphora");
  typeText(screen.getByLabelText("Working / code name"), "   ");
  fireEvent.click(screen.getByRole("button", { name: "Check and add species" }));
  await screen.findByText("Enter a meaningful working name for an undescribed taxon.");
  expect(createTaxonomySpecies).not.toHaveBeenCalled();
  typeText(screen.getByLabelText("Working / code name"), "JH-04");
  fireEvent.click(screen.getByRole("button", { name: "Check and add species" }));
  await waitFor(() => expect(createTaxonomySpecies).toHaveBeenCalledWith(expect.objectContaining({ genus: "Dohrniphora", specific_epithet: null, working_name: "JH-04" })));
});

test("WIP with epithet and working name can be created", async () => {
  await manualForm();
  typeText(screen.getByLabelText("Genus"), "Dohrniphora");
  typeText(screen.getByLabelText("Specific epithet"), "testensis");
  typeText(screen.getByLabelText("Working / code name"), "JH-04");
  fireEvent.click(screen.getByRole("button", { name: "Check and add species" }));
  await waitFor(() => expect(createTaxonomySpecies).toHaveBeenCalledWith(expect.objectContaining({ genus: "Dohrniphora", specific_epithet: "testensis", working_name: "JH-04", species_status: "work_in_progress" })));
});

test("switching genus modes clears the genus choice and preserves editable epithet", async () => {
  await manualForm();
  typeText(screen.getByLabelText("Genus"), "Newgenus");
  typeText(screen.getByLabelText("Specific epithet"), "examplei");
  const toggle = screen.getByRole("checkbox", { name: "Enter genus manually" });
  clickControl(toggle);
  expect(screen.getByRole("combobox", { name: "Genus" })).toBeEnabled();
  await standardizedGenus();
  clickControl(toggle);
  const manualInput = screen.getByRole("textbox", { name: "Genus" });
  expect(manualInput).toBeEnabled(); expect(manualInput).toHaveValue("");
  typeText(manualInput, "PhoridaeGenusA");
  typeText(screen.getByLabelText("Specific epithet"), "new");
  expect(manualInput).toHaveValue("PhoridaeGenusA");
  expect(screen.getByLabelText("Specific epithet")).toHaveValue("exampleinew");
});


test("a saved species with failed membership is separate from a fresh editable draft", async () => {
  addWorkspaceSpecies.mockRejectedValueOnce(new Error("Membership unavailable"));
  await manual();
  fireEvent.click(screen.getByRole("button", { name: "Check and add species" }));
  await screen.findByText("The global species record has been created.");
  expect(screen.queryByRole("textbox", { name: "Genus" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Start a new species" }));
  const genus = screen.getByRole("textbox", { name: "Genus" });
  const epithet = screen.getByRole("textbox", { name: "Specific epithet" });
  expect(genus).toBeEnabled(); expect(epithet).toBeEnabled();
  typeText(genus, "Newgenus"); typeText(epithet, "examplei");
  expect(genus).toHaveValue("Newgenus"); expect(epithet).toHaveValue("examplei");
  expect(screen.getByLabelText("Working / code name")).toHaveValue("");
  expect(createTaxonomySpecies).toHaveBeenCalledTimes(1);
});

test("switching workspace opens an independent editable species draft", async () => {
  const view = render(<SpeciesManager />);
  await screen.findByText("Phoragenus alpha");
  fireEvent.click(screen.getByRole("button", { name: "Add species" }));
  fireEvent.click(screen.getByRole("button", { name: "Create working taxon manually" }));
  useOutletContext.mockReturnValue({ currentWorkspace: { id: "5", name: "New workspace" } });
  view.rerender(<SpeciesManager />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Add species" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Add species" }));
  fireEvent.click(screen.getByRole("button", { name: "Create working taxon manually" }));
  clickControl(screen.getByRole("checkbox", { name: "Enter genus manually" }));
  typeText(screen.getByLabelText("Genus"), "TESTIPHORIA");
  typeText(screen.getByLabelText("Specific epithet"), "testensis");
  expect(screen.getByLabelText("Genus")).toHaveValue("TESTIPHORIA");
  expect(screen.getByLabelText("Specific epithet")).toHaveValue("testensis");
});
