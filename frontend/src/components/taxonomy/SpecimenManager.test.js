import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useOutletContext } from "react-router-dom";
import SpecimenManager from "./SpecimenManager";
import { specimenIdentity } from "./SpecimenEditor";
import * as api from "../../utils/api/taxonomy";

jest.mock("react-router-dom", () => ({ ...jest.requireActual("react-router-dom"), useOutletContext: jest.fn() }));
jest.mock("../../utils/api/taxonomy", () => ({ createTaxonomySpecimen: jest.fn(), fetchTaxonomySpecimen: jest.fn(), findSpecimenDuplicates: jest.fn(), importTaxonomySpecimen: jest.fn(), lookupGbifSpecimens: jest.fn(), searchTaxonomySpecimens: jest.fn(), fetchWorkspaceSpecimens: jest.fn(), searchTaxonomySpecies: jest.fn(), updateTaxonomySpecimen: jest.fn(), putWorkspaceSpecimenIdentification: jest.fn(), fetchSpecimenExternalTaxonomy: jest.fn() }));
jest.setTimeout(15000);
const workspace = { id: "2", name: "USA revision" };
const species = { id: "4", genus: "Myriophora", specific_epithet: "kungae", species_status: "published" };
const working = { id: "9", genus: "Myriophora", specific_epithet: null, working_name: "JH-04", species_status: "work_in_progress" };
const identification = { workspace_id: "2", specimen_reference_id: "17", species_id: "4", species, notes: "Reviewed voucher" };
const specimen = { id: "17", institution_code: "LACM", collection_code: "ENT", catalog_number: "093601", specimen_label: "Voucher 17", reference_type: "local", workspace_identification: identification, observation_count: 14, species_id: null, legacy_species: null };
const candidate = { gbif_occurrence_key: "3417795479", institution_code: "LACM", collection_code: "ENT", catalog_number: "LACM ENT 093601", scientific_name: "Myriophora kungae", genus: "Myriophora", specific_epithet: "kungae", locality: "Barro Colorado Island", basis_of_record: "PRESERVED_SPECIMEN", source: "cache", species_suggestion: species };
const computed = window.getComputedStyle;
beforeEach(() => {
  window.matchMedia = jest.fn().mockImplementation((query) => ({ matches: false, media: query, addListener: jest.fn(), removeListener: jest.fn(), addEventListener: jest.fn(), removeEventListener: jest.fn() }));
  jest.spyOn(window, "getComputedStyle").mockImplementation((node) => computed(node));
  useOutletContext.mockReturnValue({ currentWorkspace: workspace });
  api.fetchWorkspaceSpecimens.mockResolvedValue([specimen]);
  api.searchTaxonomySpecimens.mockResolvedValue([]);
  api.lookupGbifSpecimens.mockImplementation(async (q, source) => ({ results: [{ ...candidate, source }], query_type: /^\d+$/.test(q) ? "occurrence_key" : "fuzzy" }));
  api.searchTaxonomySpecies.mockResolvedValue([working, species]);
  api.fetchTaxonomySpecimen.mockResolvedValue(specimen);
  api.findSpecimenDuplicates.mockResolvedValue([]);
  api.createTaxonomySpecimen.mockResolvedValue({ ...specimen, id: "18" });
  api.importTaxonomySpecimen.mockResolvedValue({ specimen: { ...specimen, id: "18" }, created: true });
  api.putWorkspaceSpecimenIdentification.mockResolvedValue(identification);
  api.updateTaxonomySpecimen.mockResolvedValue(specimen);
  api.fetchSpecimenExternalTaxonomy.mockImplementation(async (id, source) => ({ source, taxonomy: { scientific_name: "Myriophora kungae Brown", accepted_scientific_name: source === "cache" ? "Myriophora kungae" : "Myriophora changed", gbif_taxon_key: "9608828", col_xr_taxon_key: "COL-K" } }));
});
afterEach(() => jest.restoreAllMocks());
async function openAdd() {
  render(<SpecimenManager />);
  fireEvent.click(screen.getByRole("button", { name: "Add specimen" }));
}
async function findCandidate() {
  await openAdd();
  fireEvent.change(screen.getByLabelText("Find specimen"), { target: { value: "LACM kungae" } });
  await screen.findByText("LACM ENT 093601", { selector: "strong" });
}
async function chooseWorkingSpecies() {
  const picker = screen.getByRole("combobox", { name: "Identification in USA revision" });
  fireEvent.mouseDown(picker);
  fireEvent.change(picker, { target: { value: "JH-04" } });
  fireEvent.click(await screen.findByText("Myriophora sp. JH-04 · WIP", { selector: ".ant-select-item-option-content" }));
}
async function openDetail() {
  render(<SpecimenManager />);
  await screen.findByText("Voucher 17");
  fireEvent.click(screen.getByRole("button", { name: "View/edit specimen" }));
  return within(await screen.findByRole("dialog"));
}
async function importSelected() {
  fireEvent.click(screen.getByRole("button", { name: "Import specimen" }));
  await screen.findByText("Specimen #18 created.");
}

test("normal specimen search is debounced and uses the selected workspace endpoint", async () => {
  render(<SpecimenManager />);
  await screen.findByText("Voucher 17");
  fireEvent.change(screen.getByLabelText("Search curated specimens"), { target: { value: "LAC" } });
  fireEvent.change(screen.getByLabelText("Search curated specimens"), { target: { value: "LACM" } });
  await waitFor(() => expect(api.fetchWorkspaceSpecimens).toHaveBeenCalledTimes(2));
  expect(api.fetchWorkspaceSpecimens).toHaveBeenLastCalledWith("2", "LACM", { signal: expect.any(AbortSignal) });
  expect(api.searchTaxonomySpecimens).not.toHaveBeenCalled();
});

test("workspace changes show different identifications for the same global voucher", async () => {
  api.fetchWorkspaceSpecimens.mockImplementation(async (workspaceId, q) => [{ ...specimen, workspace_identification: workspaceId === "2" ? identification : { ...identification, workspace_id: "1", species_id: "9", species: working } }]);
  const view = render(<SpecimenManager />);
  expect(await screen.findByText("Myriophora kungae")).toBeInTheDocument();
  useOutletContext.mockReturnValue({ currentWorkspace: { id: "1", name: "Canada revision" } });
  view.rerender(<SpecimenManager />);
  expect(await screen.findByText("Myriophora sp. JH-04")).toBeInTheDocument();
  expect(screen.getByText("Identification in Canada revision")).toBeInTheDocument();
  expect(screen.getByText("Voucher 17")).toBeInTheDocument();
  expect(screen.getByText("LACM ENT 093601")).toBeInTheDocument();
});

test("normal list does not load the global registry or show an unassigned global voucher", async () => {
  api.fetchWorkspaceSpecimens.mockResolvedValue([]);
  api.searchTaxonomySpecimens.mockResolvedValue([{ ...specimen, workspace_identification: null }]);
  render(<SpecimenManager />);
  expect(screen.getByRole("heading", { name: "Specimens in USA revision" })).toBeInTheDocument();
  expect(await screen.findByText(/No specimens are currently interpreted/)).toBeInTheDocument();
  expect(screen.queryByText("Voucher 17")).not.toBeInTheDocument();
  expect(api.searchTaxonomySpecimens).not.toHaveBeenCalled();
});

test("list external accepted names are separate and never trigger live GBIF calls", async () => {
  api.fetchWorkspaceSpecimens.mockResolvedValue([{ ...specimen, workspace_identification: { ...identification, species: working }, external_taxonomy: { accepted_scientific_name: "Myriophora kungae" } }]);
  render(<SpecimenManager />);
  expect(await screen.findByText("Myriophora sp. JH-04")).toBeInTheDocument();
  expect(screen.getByText("Myriophora kungae")).toBeInTheDocument();
  expect(screen.getByText("GBIF accepted name — local snapshot")).toBeInTheDocument();
  expect(api.fetchSpecimenExternalTaxonomy).not.toHaveBeenCalled();
});

test.each(["cache", "live_gbif"])("%s candidate source identity is read-only and existing species is confirmed by final import", async (source) => {
  await findCandidate();
  if (source === "live_gbif") {
    fireEvent.click(screen.getByRole("button", { name: "Search current GBIF" }));
    await screen.findByText("Current GBIF");
    expect(screen.getAllByText("LACM ENT 093601", { selector: "strong" })).toHaveLength(1);
  }
  fireEvent.click(screen.getByRole("button", { name: "Select specimen" }));
  expect(screen.getByRole("combobox", { name: "Identification in USA revision" }).closest(".ant-select")).toHaveTextContent("Myriophora kungae · Published");
  expect(screen.getByText(/Matched existing taxonomy species/)).toBeInTheDocument();
  const sourceInfo = within(screen.getByRole("region", { name: "Voucher identity — from GBIF" }));
  for (const value of ["LACM", "ENT", "093601", "3417795479"]) expect(sourceInfo.getByText(value)).toBeInTheDocument();
  expect(sourceInfo.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: /I confirm|Also add/ })).not.toBeInTheDocument();
  await importSelected();
  expect(api.importTaxonomySpecimen).toHaveBeenCalledWith({ gbif_occurrence_key: "3417795479", workspace_id: "2", species_id: "4", identification_notes: null, specimen_label: null, notes: null });
});

test("new GBIF species is accepted as part of final specimen import without a separate species-import click", async () => {
  api.lookupGbifSpecimens.mockResolvedValue({ results: [{ ...candidate, species_suggestion: null }] });
  await findCandidate();
  fireEvent.click(screen.getByRole("button", { name: "Select specimen" }));
  expect(screen.getByText(/Not yet in taxonomy database/)).toHaveTextContent("Suggested from GBIF: Myriophora kungae");
  expect(screen.queryByRole("button", { name: "Import and use this species" })).not.toBeInTheDocument();
  await importSelected();
  expect(api.importTaxonomySpecimen).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: "2", accept_gbif_identification: true }));
  expect(api.importTaxonomySpecimen.mock.calls[0][0]).not.toHaveProperty("species_id");
});

test("a GBIF species suggestion can be overridden with a WIP species", async () => {
  await findCandidate();
  fireEvent.click(screen.getByRole("button", { name: "Select specimen" }));
  await chooseWorkingSpecies();
  await importSelected();
  expect(api.importTaxonomySpecimen).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: "2", species_id: "9" }));
});

test("unresolved suggestion requires selection only when recording a workspace identification", async () => {
  api.lookupGbifSpecimens.mockResolvedValue({ results: [{ ...candidate, scientific_name: "Phoridae", species_suggestion: null, genus: null, specific_epithet: null }] });
  await findCandidate();
  fireEvent.click(screen.getByRole("button", { name: "Select specimen" }));
  fireEvent.click(screen.getByRole("button", { name: "Import specimen" }));
  await screen.findByText("Choose a published or WIP species for this workspace.");
  expect(api.importTaxonomySpecimen).not.toHaveBeenCalled();
  await chooseWorkingSpecies();
  await importSelected();
});

test("no workspace imports only a global voucher", async () => {
  useOutletContext.mockReturnValue({ currentWorkspace: null });
  await findCandidate();
  fireEvent.click(screen.getByRole("button", { name: "Select specimen" }));
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  await importSelected();
  expect(api.importTaxonomySpecimen).toHaveBeenCalledWith({ gbif_occurrence_key: "3417795479", specimen_label: null, notes: null });
  expect(api.putWorkspaceSpecimenIdentification).not.toHaveBeenCalled();
});

test("workspace identification can be omitted while importing a global specimen", async () => {
  await findCandidate();
  fireEvent.click(screen.getByRole("button", { name: "Select specimen" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Record an identification in USA revision" }));
  await importSelected();
  expect(api.importTaxonomySpecimen.mock.calls[0][0]).not.toHaveProperty("workspace_id");
});

test("manual creation sends identification in workspace context and leaves voucher global", async () => {
  await openAdd();
  fireEvent.click(screen.getByRole("button", { name: "Create manually" }));
  await chooseWorkingSpecies();
  fireEvent.change(screen.getByLabelText("Institution code"), { target: { value: "LACM" } });
  fireEvent.change(screen.getByLabelText("Collection code"), { target: { value: "ENT" } });
  fireEvent.change(screen.getByLabelText("Catalog number"), { target: { value: "LACM ENT 093601" } });
  fireEvent.click(screen.getByRole("button", { name: "Check and create specimen" }));
  await screen.findByText("Specimen #18 created.");
  expect(api.createTaxonomySpecimen).toHaveBeenCalledWith(expect.objectContaining({ reference_type: "local", workspace_id: "2", species_id: "9", catalog_number: "093601" }));
  expect(api.findSpecimenDuplicates).toHaveBeenCalledWith({ institution_code: "LACM", collection_code: "ENT", catalog_number: "093601" });
});

test("manual creation without workspace requires no species", async () => {
  useOutletContext.mockReturnValue({ currentWorkspace: null });
  await openAdd();
  fireEvent.click(screen.getByRole("button", { name: "Create manually" }));
  fireEvent.click(screen.getByRole("button", { name: "Check and create specimen" }));
  await screen.findByText("Specimen #18 created.");
  expect(api.createTaxonomySpecimen).toHaveBeenCalledWith({ reference_type: "local", institution_code: null, collection_code: null, catalog_number: null, specimen_label: null, notes: null });
});

test("manual duplicate warning preserves explicit separate creation", async () => {
  api.findSpecimenDuplicates.mockResolvedValue([specimen]);
  await openAdd();
  fireEvent.click(screen.getByRole("button", { name: "Create manually" }));
  await chooseWorkingSpecies();
  fireEvent.change(screen.getByLabelText("Catalog number"), { target: { value: "093601" } });
  fireEvent.click(screen.getByRole("button", { name: "Check and create specimen" }));
  await screen.findByText("Possible existing specimens");
  expect(api.createTaxonomySpecimen).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Create separate specimen" }));
  await screen.findByText("Specimen #18 created.");
});

test("GBIF detail separates read-only identity, external names and editable workspace interpretation", async () => {
  api.fetchTaxonomySpecimen.mockResolvedValue({ ...specimen, reference_type: "gbif", gbif_occurrence_key: "3417795479", workspace_identification: { ...identification, species: working, species_id: "9" } });
  const drawer = await openDetail();
  await drawer.findByRole("region", { name: "Voucher identity — from GBIF" });
  expect(drawer.queryByLabelText("Catalog number")).not.toBeInTheDocument();
  const external = within(await drawer.findByRole("region", { name: "External GBIF taxonomy" }));
  await external.findByText("GBIF accepted name — local snapshot: Myriophora kungae");
  expect(drawer.getByRole("combobox", { name: "Identification in USA revision" }).closest(".ant-select")).toHaveTextContent("Myriophora sp. JH-04 · WIP");
  fireEvent.click(external.getByRole("button", { name: "Check current GBIF" }));
  await external.findByText("GBIF/COL accepted name — current GBIF: Myriophora changed");
  expect(api.putWorkspaceSpecimenIdentification).not.toHaveBeenCalled();
  expect(api.updateTaxonomySpecimen).not.toHaveBeenCalled();
});

test("changing workspace identification saves only through the workspace endpoint", async () => {
  const drawer = await openDetail();
  await drawer.findByRole("region", { name: "Workspace interpretation" });
  expect(drawer.getByLabelText("Identification notes")).toHaveValue("Reviewed voucher");
  await chooseWorkingSpecies();
  fireEvent.change(drawer.getByLabelText("Identification notes"), { target: { value: "Re-examined morphology" } });
  fireEvent.click(drawer.getByRole("button", { name: "Save workspace identification" }));
  await screen.findByText("Specimen saved. Existing observations and evidence are unchanged.");
  expect(api.putWorkspaceSpecimenIdentification).toHaveBeenCalledWith("2", "17", { species_id: "9", notes: "Re-examined morphology" });
  expect(api.updateTaxonomySpecimen).not.toHaveBeenCalled();
});

test("local voucher metadata stays editable without writing an identification", async () => {
  const drawer = await openDetail();
  await drawer.findByLabelText("Collection code");
  fireEvent.change(drawer.getByLabelText("Collection code"), { target: { value: "DIP" } });
  fireEvent.change(drawer.getByLabelText("Voucher notes"), { target: { value: "Voucher condition" } });
  fireEvent.click(drawer.getByRole("button", { name: "Save voucher metadata" }));
  await screen.findByText("Specimen saved. Existing observations and evidence are unchanged.");
  expect(api.updateTaxonomySpecimen).toHaveBeenCalledWith("17", { institution_code: "LACM", collection_code: "DIP", catalog_number: "093601", specimen_label: "Voucher 17", notes: "Voucher condition" });
  expect(api.putWorkspaceSpecimenIdentification).not.toHaveBeenCalled();
});

test("legacy identification is explicitly labelled in the drawer and not preselected for workspace", async () => {
  api.fetchTaxonomySpecimen.mockResolvedValue({ ...specimen, legacy_species: species, workspace_identification: null });
  const drawer = await openDetail();
  await drawer.findByText("Legacy global assignment (not a workspace identification): Myriophora kungae");
  expect(drawer.getByText("No identification in this workspace")).toBeInTheDocument();
  expect(drawer.getByRole("combobox").closest(".ant-select")).not.toHaveTextContent("Myriophora kungae");
});

test.each([
  ["LACM", "ENT", "LACM ENT 093601", "LACM ENT 093601"],
  ["LACM", null, "LACM 093601", "LACM 093601"],
  [null, "ENT", "093601", "ENT 093601"],
])("identity remains normalized %s/%s/%s", (institution_code, collection_code, catalog_number, expected) => {
  expect(specimenIdentity({ institution_code, collection_code, catalog_number })).toBe(expected);
});


test("no workspace shows instructions without silently browsing all global vouchers", async () => {
  useOutletContext.mockReturnValue({ currentWorkspace: null });
  render(<SpecimenManager />);
  expect(screen.getByText(/Select a workspace to see specimens currently interpreted there/)).toBeInTheDocument();
  expect(screen.getByLabelText("Search curated specimens")).toBeDisabled();
  expect(api.fetchWorkspaceSpecimens).not.toHaveBeenCalled();
  expect(api.searchTaxonomySpecimens).not.toHaveBeenCalled();
});

test("switching workspace excludes a voucher until this workspace identifies it", async () => {
  api.fetchWorkspaceSpecimens.mockImplementation(async (workspaceId) => workspaceId === "2" ? [specimen] : []);
  const view = render(<SpecimenManager />);
  await screen.findByText("Voucher 17");
  useOutletContext.mockReturnValue({ currentWorkspace: { id: "1", name: "Canada revision" } });
  view.rerender(<SpecimenManager />);
  expect(await screen.findByRole("heading", { name: "Specimens in Canada revision" })).toBeInTheDocument();
  await waitFor(() => expect(api.fetchWorkspaceSpecimens).toHaveBeenLastCalledWith("1", "", expect.any(Object)));
  expect(screen.queryByText("Voucher 17")).not.toBeInTheDocument();
});

test("Add specimen finds a global voucher outside this workspace and reuses it for identification", async () => {
  let identified = false;
  const globalVoucher = { ...specimen, workspace_identification: null, external_taxonomy: { accepted_scientific_name: "Myriophora kungae" } };
  api.fetchWorkspaceSpecimens.mockImplementation(async () => identified ? [{ ...specimen, workspace_identification: { ...identification, species: working, species_id: "9" } }] : []);
  api.searchTaxonomySpecimens.mockResolvedValue([globalVoucher]);
  api.lookupGbifSpecimens.mockResolvedValue({ results: [] });
  api.fetchTaxonomySpecimen.mockResolvedValue(globalVoucher);
  api.putWorkspaceSpecimenIdentification.mockImplementation(async () => { identified = true; return identification; });
  await openAdd();
  fireEvent.change(screen.getByLabelText("Find specimen"), { target: { value: "LACM 093601" } });
  const modal = within(screen.getByRole("dialog"));
  expect(await modal.findByText("Already in Phorid.net")).toBeInTheDocument();
  expect(modal.getByText("No identification yet in USA revision")).toBeInTheDocument();
  expect(modal.getByText("Myriophora kungae")).toBeInTheDocument();
  expect(api.searchTaxonomySpecimens).toHaveBeenCalledWith("LACM 093601", expect.objectContaining({ workspaceId: "2" }));
  fireEvent.click(modal.getByRole("button", { name: "Use specimen in this workspace" }));
  await screen.findByRole("region", { name: "Workspace interpretation" });
  await chooseWorkingSpecies();
  fireEvent.click(screen.getByRole("button", { name: "Save workspace identification" }));
  await screen.findByText("Specimen saved. Existing observations and evidence are unchanged.");
  expect(await screen.findByText("Voucher 17")).toBeInTheDocument();
  expect(screen.getByText("Myriophora sp. JH-04")).toBeInTheDocument();
  expect(api.putWorkspaceSpecimenIdentification).toHaveBeenCalledWith("2", "17", { species_id: "9", notes: null });
  expect(api.createTaxonomySpecimen).not.toHaveBeenCalled();
  expect(api.importTaxonomySpecimen).not.toHaveBeenCalled();
});

test("already identified global specimen shows Already in this workspace and opens existing detail", async () => {
  api.searchTaxonomySpecimens.mockResolvedValue([specimen]);
  api.lookupGbifSpecimens.mockResolvedValue({ results: [] });
  await openAdd();
  fireEvent.change(screen.getByLabelText("Find specimen"), { target: { value: "LACM" } });
  const modal = within(screen.getByRole("dialog"));
  await modal.findByText("Already in this workspace");
  expect(modal.queryByRole("button", { name: "Use specimen in this workspace" })).not.toBeInTheDocument();
  fireEvent.click(modal.getByRole("button", { name: "Open existing specimen" }));
  await screen.findByRole("region", { name: "Workspace interpretation" });
  expect(api.putWorkspaceSpecimenIdentification).not.toHaveBeenCalled();
  expect(api.createTaxonomySpecimen).not.toHaveBeenCalled();
});
