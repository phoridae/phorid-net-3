import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import SpecimenManager from "./SpecimenManager";
import { specimenIdentity } from "./SpecimenEditor";
import { createTaxonomySpecimen, fetchTaxonomySpecimen, findSpecimenDuplicates, importTaxonomySpecimen, importTaxonomySpecies, lookupGbifSpecimens, searchTaxonomySpecimens, searchTaxonomySpecies, updateTaxonomySpecimen } from "../../utils/api/taxonomy";

jest.mock("../../utils/api/taxonomy", () => ({ createTaxonomySpecimen: jest.fn(), fetchTaxonomySpecimen: jest.fn(), findSpecimenDuplicates: jest.fn(), importTaxonomySpecimen: jest.fn(), importTaxonomySpecies: jest.fn(), lookupGbifSpecimens: jest.fn(), lookupTaxonomyTaxa: jest.fn(), searchTaxonomySpecimens: jest.fn(), searchTaxonomySpecies: jest.fn(), updateTaxonomySpecimen: jest.fn() }));
jest.setTimeout(15000);
const species = { id: "4", genus: "Myriophora", specific_epithet: "wellsorum", species_status: "published", gbif_taxon_key: "9608828", col_xr_taxon_key: "8CYC6" };
const working = { id: "9", genus: "Apocephalus", specific_epithet: null, working_name: "AZ-17", species_status: "work_in_progress", gbif_taxon_key: null, col_xr_taxon_key: null };
const specimen = { id: "17", species_id: "4", species, institution_code: "USNM", collection_code: "ENT", catalog_number: "12345", specimen_label: "Voucher 17", reference_type: "local", gbif_occurrence_key: null, observation_count: 14 };
const candidate = { gbif_occurrence_key: "4021395742", institution_code: "LACM", collection_code: "ENT", catalog_number: "54321", scientific_name: "Myriophora wellsorum", genus: "Myriophora", specific_epithet: "wellsorum", locality: "California", country: "United States", basis_of_record: "PRESERVED_SPECIMEN", source: "cache", existing_specimen_id: null, species_suggestion: species, col_xr_taxon_key: "8CYC6", gbif_taxon_key: "9608828" };
const computed = window.getComputedStyle;
beforeEach(() => {
  window.matchMedia = jest.fn().mockImplementation((query) => ({ matches: false, media: query, addListener: jest.fn(), removeListener: jest.fn(), addEventListener: jest.fn(), removeEventListener: jest.fn() }));
  jest.spyOn(window, "getComputedStyle").mockImplementation((node) => computed(node));
  searchTaxonomySpecimens.mockResolvedValue([specimen]);
  lookupGbifSpecimens.mockImplementation(async (q, source) => ({ results: [{ ...candidate, source }], query_type: /^\d+$/.test(q) ? "occurrence_key" : "fuzzy", source }));
  searchTaxonomySpecies.mockResolvedValue([working, species]);
  fetchTaxonomySpecimen.mockImplementation(async (id) => ({ ...specimen, id }));
  findSpecimenDuplicates.mockResolvedValue([]);
  createTaxonomySpecimen.mockResolvedValue({ ...specimen, id: "18" });
  importTaxonomySpecimen.mockResolvedValue({ specimen: { ...specimen, id: "18", reference_type: "gbif", gbif_occurrence_key: candidate.gbif_occurrence_key }, created: true });
  importTaxonomySpecies.mockResolvedValue({ species, created: true });
  updateTaxonomySpecimen.mockResolvedValue(specimen);
});
afterEach(() => jest.restoreAllMocks());

async function openAdd() {
  render(<SpecimenManager />);
  await screen.findByText("Voucher 17");
  fireEvent.click(screen.getByRole("button", { name: "Add specimen" }));
}
async function findCandidate(query = "LACM wellsorum") {
  await openAdd();
  fireEvent.change(screen.getByLabelText("Find specimen"), { target: { value: query } });
  await within(screen.getByRole("dialog")).findByText("LACM ENT 54321", { selector: "strong" });
}
async function chooseWorkingSpecies() {
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "Current species" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Current species" }), { target: { value: "AZ-17" } });
  fireEvent.click(await screen.findByText("Apocephalus sp. AZ-17 · WIP", { selector: ".ant-select-item-option-content" }));
}

test("curated specimen search is global and debounced", async () => {
  render(<SpecimenManager />);
  await screen.findByText("Voucher 17");
  expect(screen.getByText("Specimens are global records and are not owned by a workspace.")).toBeInTheDocument();
  const input = screen.getByLabelText("Search curated specimens");
  fireEvent.change(input, { target: { value: "US" } });
  fireEvent.change(input, { target: { value: "USNM alpha" } });
  expect(searchTaxonomySpecimens).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(searchTaxonomySpecimens).toHaveBeenCalledTimes(2));
  expect(searchTaxonomySpecimens.mock.calls[1][0]).toBe("USNM alpha");
  expect(searchTaxonomySpecimens.mock.calls[1][1]).toEqual({ signal: expect.any(AbortSignal) });
});

test("one fuzzy cache search emphasizes specimen identity and supports deliberate live search", async () => {
  await findCandidate();
  const modal = within(screen.getByRole("dialog"));
  expect(modal.getByText("Local GBIF cache")).toBeInTheDocument();
  expect(modal.getByText("California, United States")).toBeInTheDocument();
  expect(modal.getByText("GBIF 4021395742")).toBeInTheDocument();
  expect(lookupGbifSpecimens).toHaveBeenCalledWith("LACM wellsorum", "cache", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  fireEvent.click(modal.getByRole("button", { name: "Search current GBIF" }));
  await modal.findByText("Current GBIF");
  // The same occurrence from cache and live remains one candidate.
  expect(modal.getAllByText("LACM ENT 54321", { selector: "strong" })).toHaveLength(1);
});

test("live failure retains cached candidates and leaves manual entry usable", async () => {
  await findCandidate();
  lookupGbifSpecimens.mockRejectedValueOnce(new Error("Current GBIF lookup failed"));
  fireEvent.click(screen.getByRole("button", { name: "Search current GBIF" }));
  expect(await screen.findByText("Current GBIF lookup failed")).toBeInTheDocument();
  expect(screen.getByText("LACM ENT 54321", { selector: "strong" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Create manually" }));
  expect(screen.getByRole("button", { name: "Check and create specimen" })).toBeInTheDocument();
});

test("exact occurrence keys retain the single search interface and expose live fallback for cache misses", async () => {
  lookupGbifSpecimens.mockImplementation(async (q, source) => ({ results: source === "cache" ? [] : [{ ...candidate, source }], query_type: "occurrence_key", source }));
  await openAdd();
  fireEvent.change(screen.getByLabelText("Find specimen"), { target: { value: "4021395742" } });
  await screen.findByText("Exact GBIF occurrence-key lookup.");
  fireEvent.click(screen.getByRole("button", { name: "Search current GBIF" }));
  await screen.findByText("LACM ENT 54321", { selector: "strong" });
  expect(lookupGbifSpecimens).toHaveBeenCalledWith("4021395742", "live_gbif", expect.objectContaining({ signal: expect.any(AbortSignal) }));
});

test("existing GBIF occurrences open their curated record instead of importing", async () => {
  lookupGbifSpecimens.mockResolvedValue({ results: [{ ...candidate, existing_specimen_id: "17" }], query_type: "fuzzy" });
  await findCandidate();
  expect(screen.getByText("Already in taxonomy database")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Open existing specimen" }));
  expect(await screen.findByText("Internal specimen record ID: 17")).toBeInTheDocument();
  expect(importTaxonomySpecimen).not.toHaveBeenCalled();
  expect(createTaxonomySpecimen).not.toHaveBeenCalled();
});

test("manual creation accepts a working species without external identifiers", async () => {
  await openAdd();
  fireEvent.click(screen.getByRole("button", { name: "Create manually" }));
  await chooseWorkingSpecies();
  fireEvent.change(screen.getByLabelText("Institution code"), { target: { value: "USNM" } });
  fireEvent.change(screen.getByLabelText("Collection code"), { target: { value: "ENT" } });
  fireEvent.change(screen.getByLabelText("Catalog number"), { target: { value: "AZ-17-voucher" } });
  fireEvent.click(screen.getByRole("button", { name: "Check and create specimen" }));
  await screen.findByText("Specimen #18 created.");
  expect(createTaxonomySpecimen).toHaveBeenCalledWith({ species_id: "9", reference_type: "local", institution_code: "USNM", collection_code: "ENT", catalog_number: "AZ-17-voucher", specimen_label: null, notes: null });
  expect(importTaxonomySpecimen).not.toHaveBeenCalled();
});

test("manual catalog duplicates require an explicit separate-record choice", async () => {
  findSpecimenDuplicates.mockResolvedValue([specimen]);
  await openAdd();
  fireEvent.click(screen.getByRole("button", { name: "Create manually" }));
  await chooseWorkingSpecies();
  fireEvent.change(screen.getByLabelText("Institution code"), { target: { value: "USNM" } });
  fireEvent.change(screen.getByLabelText("Collection code"), { target: { value: "ENT" } });
  fireEvent.change(screen.getByLabelText("Catalog number"), { target: { value: "12345" } });
  fireEvent.click(screen.getByRole("button", { name: "Check and create specimen" }));
  await screen.findByText("Possible existing specimens");
  expect(createTaxonomySpecimen).not.toHaveBeenCalled();
  expect(findSpecimenDuplicates).toHaveBeenCalledWith({ institution_code: "USNM", collection_code: "ENT", catalog_number: "12345" });
  fireEvent.click(screen.getByRole("button", { name: "Create separate specimen" }));
  await screen.findByText("Specimen #18 created.");
  expect(createTaxonomySpecimen).toHaveBeenCalledTimes(1);
});

test("GBIF import preselects a suggestion but requires explicit assignment confirmation", async () => {
  await findCandidate();
  fireEvent.click(screen.getByRole("button", { name: "Select specimen" }));
  expect(screen.getByText(/GBIF identification is a suggestion/)).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Current species" }).closest(".ant-select")).toHaveTextContent("Myriophora wellsorum · Published");
  expect(screen.getByLabelText("Collection code")).toHaveValue("ENT");
  expect(screen.getByLabelText("Specimen label")).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Import specimen" }));
  await screen.findByText("Confirm the current species assignment before import.");
  expect(importTaxonomySpecimen).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox", { name: /I confirm/ }));
  fireEvent.click(screen.getByRole("button", { name: "Import specimen" }));
  await screen.findByText("Specimen #18 created.");
  expect(importTaxonomySpecimen).toHaveBeenCalledWith(expect.objectContaining({ species_id: "4", gbif_occurrence_key: "4021395742", institution_code: "LACM", collection_code: "ENT", catalog_number: "54321", specimen_label: null }));
});

test("missing suggested species can be imported globally without workspace membership", async () => {
  lookupGbifSpecimens.mockResolvedValue({ results: [{ ...candidate, species_suggestion: null }], query_type: "fuzzy" });
  await findCandidate();
  fireEvent.click(screen.getByRole("button", { name: "Select specimen" }));
  fireEvent.click(screen.getByRole("button", { name: "Add/import this species" }));
  await waitFor(() => expect(importTaxonomySpecies).toHaveBeenCalledWith("8CYC6"));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Add/import this species" })).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getByRole("checkbox", { name: /I confirm/ })).not.toBeDisabled());
  fireEvent.click(screen.getByRole("checkbox", { name: /I confirm/ }));
  fireEvent.click(screen.getByRole("button", { name: "Import specimen" }));
  await screen.findByText("Specimen #18 created.");
  expect(importTaxonomySpecimen.mock.calls[0][0]).not.toHaveProperty("workspace_id");
});

test("specimen detail permits reassignment, shows observation count and never clears species", async () => {
  render(<SpecimenManager />);
  await screen.findByText("Voucher 17");
  fireEvent.click(screen.getByRole("button", { name: "View/edit specimen" }));
  await screen.findByText("Changing the current species assignment does not alter existing observations or evidence.");
  expect(screen.getByText("Character observations: 14")).toBeInTheDocument();
  expect(screen.getByText("Specimen identity: USNM ENT 12345")).toBeInTheDocument();
  expect(screen.getByLabelText("Collection code")).toHaveValue("ENT");
  fireEvent.change(screen.getByLabelText("Collection code"), { target: { value: "DIP" } });
  await chooseWorkingSpecies();
  fireEvent.click(screen.getByRole("button", { name: "Save specimen" }));
  await screen.findByText("Specimen metadata and current assignment saved. Existing observations and evidence are unchanged.");
  expect(updateTaxonomySpecimen).toHaveBeenCalledWith("17", expect.objectContaining({ species_id: "9", collection_code: "DIP" }));
});

test("legacy unassigned specimens remain readable and must choose species before saving", async () => {
  fetchTaxonomySpecimen.mockResolvedValue({ ...specimen, species_id: null, species: null });
  render(<SpecimenManager />);
  await screen.findByText("Voucher 17");
  fireEvent.click(screen.getByRole("button", { name: "View/edit specimen" }));
  await screen.findByText("Current species: Unassigned (legacy record)");
  fireEvent.click(screen.getByRole("button", { name: "Save specimen" }));
  await screen.findByText("Choose a current species assignment.");
  expect(updateTaxonomySpecimen).not.toHaveBeenCalled();
});

test.each([
  ["LACM", "ENT", "12345", "LACM ENT 12345"],
  ["USNM", null, "987654", "USNM 987654"],
  [null, "ENT", "12345", "ENT 12345"],
  [null, null, "12345", "12345"],
  [" LACM ", "  ", "12345", "LACM 12345"],
])("specimen identity gracefully composes %s/%s/%s", (institution_code, collection_code, catalog_number, expected) => {
  expect(specimenIdentity({ institution_code, collection_code, catalog_number })).toBe(expected);
});

test("curated table shows compact structured identity and keeps descriptive label separate", async () => {
  render(<SpecimenManager />);
  expect(await screen.findByText("USNM ENT 12345")).toBeInTheDocument();
  expect(screen.getByText("Voucher 17")).toBeInTheDocument();
});

test("manual collection omission preserves null payload and institution/catalog duplicate fallback", async () => {
  await openAdd();
  fireEvent.click(screen.getByRole("button", { name: "Create manually" }));
  await chooseWorkingSpecies();
  fireEvent.change(screen.getByLabelText("Institution code"), { target: { value: "USNM" } });
  fireEvent.change(screen.getByLabelText("Catalog number"), { target: { value: "12345" } });
  fireEvent.click(screen.getByRole("button", { name: "Check and create specimen" }));
  await screen.findByText("Specimen #18 created.");
  expect(findSpecimenDuplicates).toHaveBeenCalledWith({ institution_code: "USNM", catalog_number: "12345" });
  expect(createTaxonomySpecimen).toHaveBeenCalledWith(expect.objectContaining({ collection_code: null }));
});
