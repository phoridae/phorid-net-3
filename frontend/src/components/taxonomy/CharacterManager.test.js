import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useOutletContext } from "react-router-dom";
import CharacterManager from "./CharacterManager";
import { addCharacterState, addWorkspaceCharacter, createCharacterWithStates, fetchCharacterUsage, fetchTaxonomyCharacter, fetchWorkspaceCharacters, removeCharacterState, removeWorkspaceCharacter, searchTaxonomyCharacters, updateTaxonomyCharacter } from "../../utils/api/taxonomy";

jest.mock("react-router-dom", () => ({ ...jest.requireActual("react-router-dom"), useOutletContext: jest.fn() }));
jest.mock("../../utils/api/taxonomy", () => ({ addCharacterState: jest.fn(), addWorkspaceCharacter: jest.fn(), createCharacterWithStates: jest.fn(), fetchCharacterUsage: jest.fn(), fetchTaxonomyCharacter: jest.fn(), fetchWorkspaceCharacters: jest.fn(), removeCharacterState: jest.fn(), removeWorkspaceCharacter: jest.fn(), searchTaxonomyCharacters: jest.fn(), updateTaxonomyCharacter: jest.fn() }));

// Ant Design portal/form interactions can take longer than Jest's default 5s on CI.
jest.setTimeout(15000);

const categorical = { id: "1", name: "Anepisternal setae", description: "Setation of the anepisternum.", anatomical_region: "Thorax", data_type: "categorical", unit: null, visibility: "shared", display_order: 0,
  states: [{ id: "11", name: "bare", description: "No setae", display_order: 0 }, { id: "12", name: "setose", description: "Setae present", display_order: 1 }] };
const numeric = { id: "2", name: "Body length", anatomical_region: "General", data_type: "numeric_range", unit: "mm", visibility: "private", display_order: 1, states: [] };
const usage = { workspace_count: 2, specimen_observation_count: 24, description_observation_count: 7, key_count: 2,
  states: [{ id: "11", specimen_observation_count: 2, description_observation_count: 1 }, { id: "12", specimen_observation_count: 0, description_observation_count: 0 }] };
const computed = window.getComputedStyle;
beforeEach(() => {
  window.matchMedia = jest.fn().mockImplementation((query) => ({ matches: false, media: query, addListener: jest.fn(), removeListener: jest.fn(), addEventListener: jest.fn(), removeEventListener: jest.fn() }));
  jest.spyOn(window, "getComputedStyle").mockImplementation((node) => computed(node));
  useOutletContext.mockReturnValue({ currentWorkspace: { id: "4", name: "Canada" } });
  fetchWorkspaceCharacters.mockResolvedValue([categorical, numeric]);
  searchTaxonomyCharacters.mockResolvedValue([]);
  fetchTaxonomyCharacter.mockResolvedValue(categorical);
  fetchCharacterUsage.mockResolvedValue(usage);
  addWorkspaceCharacter.mockResolvedValue({});
  createCharacterWithStates.mockResolvedValue({ ...categorical, id: "3" });
  updateTaxonomyCharacter.mockResolvedValue(categorical);
  removeWorkspaceCharacter.mockResolvedValue(null);
  addCharacterState.mockResolvedValue({ id: "13" });
  removeCharacterState.mockResolvedValue(null);
});
afterEach(() => jest.restoreAllMocks());

async function openAdd() {
  render(<CharacterManager />);
  const button = screen.getByRole("button", { name: "Add character" });
  await waitFor(() => expect(button).not.toBeDisabled());
  fireEvent.click(button);
}
async function openEditor() {
  render(<CharacterManager />);
  await screen.findByText(categorical.name);
  fireEvent.click(screen.getAllByRole("button", { name: "View/edit character" })[0]);
  await screen.findByText("Shared global character");
}

test("workspace table shows global categorical states and numeric units", async () => {
  render(<CharacterManager />);
  expect(await screen.findByText("Anepisternal setae")).toBeInTheDocument();
  expect(screen.getByText("Thorax")).toBeInTheDocument();
  expect(screen.getByText("bare")).toBeInTheDocument();
  expect(screen.getByText("setose")).toBeInTheDocument();
  const numericRow = screen.getByText("Body length").closest("tr");
  expect(numericRow).toHaveTextContent("Numeric range · mm");
  expect(numericRow).not.toHaveTextContent("No states defined");
  expect(fetchWorkspaceCharacters).toHaveBeenCalledWith("4", expect.objectContaining({ signal: expect.any(AbortSignal) }));
});

test("global library search is debounced and reuse adds only membership", async () => {
  searchTaxonomyCharacters.mockResolvedValue([categorical, { ...numeric, id: "3", name: "Wing length" }]);
  await openAdd();
  const input = screen.getByLabelText("Search global characters");
  fireEvent.change(input, { target: { value: "Wi" } });
  fireEvent.change(input, { target: { value: "Wing" } });
  expect(searchTaxonomyCharacters).not.toHaveBeenCalled();
  const modal = within(screen.getByRole("dialog"));
  await modal.findByText("Wing length");
  expect(searchTaxonomyCharacters).toHaveBeenCalledTimes(1);
  expect(searchTaxonomyCharacters.mock.calls[0][0]).toBe("Wing");
  expect(modal.getByText("Already in this workspace")).toBeInTheDocument();
  expect(modal.getByText(categorical.description)).toBeInTheDocument();
  expect(modal.getAllByRole("button", { name: "Add existing character" })[0]).toBeDisabled();
  fireEvent.click(modal.getAllByRole("button", { name: "Add existing character" })[1]);
  expect(await screen.findByText("Wing length added to workspace.")).toBeInTheDocument();
  expect(addWorkspaceCharacter).toHaveBeenCalledWith("4", "3");
  expect(createCharacterWithStates).not.toHaveBeenCalled();
});

test("duplicate membership conflict is verified before reporting success", async () => {
  searchTaxonomyCharacters.mockResolvedValue([{ ...numeric, id: "3", name: "Wing length" }]);
  addWorkspaceCharacter.mockRejectedValue(Object.assign(new Error("Duplicate membership"), { status: 409 }));
  await openAdd();
  fireEvent.change(screen.getByLabelText("Search global characters"), { target: { value: "Wing" } });
  await within(screen.getByRole("dialog")).findByText("Wing length");
  fetchWorkspaceCharacters.mockResolvedValue([categorical, { ...numeric, id: "3" }]);
  fireEvent.click(screen.getByRole("button", { name: "Add existing character" }));
  expect(await screen.findByText("Wing length added to workspace.")).toBeInTheDocument();
  expect(createCharacterWithStates).not.toHaveBeenCalled();
});

test("categorical creation sends ordered state definitions in one atomic request", async () => {
  await openAdd();
  fireEvent.click(screen.getByRole("button", { name: "Create new character" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Frons setation" } });
  fireEvent.click(screen.getByRole("button", { name: "Add state" }));
  fireEvent.change(screen.getByLabelText("State 1 name"), { target: { value: "bare" } });
  fireEvent.click(screen.getByRole("button", { name: "Add state" }));
  fireEvent.change(screen.getByLabelText("State 2 name"), { target: { value: "setose" } });
  fireEvent.change(screen.getByLabelText("State 2 description"), { target: { value: "Setae present" } });
  fireEvent.click(screen.getByRole("button", { name: "Move state 2 up" }));
  expect(screen.getByLabelText("State 1 name")).toHaveValue("setose");
  fireEvent.click(screen.getByRole("button", { name: "Create and add to workspace" }));
  await screen.findByText("Anepisternal setae added to workspace.");
  expect(createCharacterWithStates).toHaveBeenCalledWith(expect.objectContaining({ name: "Frons setation", workspace_id: "4", data_type: "categorical", unit: null,
    states: [{ name: "setose", description: "Setae present" }, { name: "bare", description: null }] }));
  expect(addCharacterState).not.toHaveBeenCalled();
  expect(addWorkspaceCharacter).not.toHaveBeenCalled();
});

test("numeric creation omits categorical states and retains form values after a controlled error", async () => {
  createCharacterWithStates.mockRejectedValueOnce(new Error("Edit conflicts with existing data"));
  await openAdd();
  fireEvent.click(screen.getByRole("button", { name: "Create new character" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Wing length" } });
  fireEvent.mouseDown(screen.getByLabelText("Data type"));
  fireEvent.click(await screen.findByText("Numeric range", { selector: ".ant-select-item-option-content" }));
  fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "mm" } });
  expect(screen.queryByRole("button", { name: "Add state" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Create and add to workspace" }));
  expect(await screen.findByText("Edit conflicts with existing data")).toBeInTheDocument();
  expect(screen.getByLabelText("Name")).toHaveValue("Wing length");
  expect(createCharacterWithStates).toHaveBeenCalledWith(expect.objectContaining({ data_type: "numeric_range", unit: "mm", states: [] }));
  fireEvent.click(screen.getByRole("button", { name: "Create and add to workspace" }));
  await screen.findByText("Anepisternal setae added to workspace.");
});

test("editing waits for usage, warns about shared effects and requires acknowledgement", async () => {
  await openEditor();
  expect(fetchCharacterUsage).toHaveBeenCalledWith("1", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(screen.getByText("This is a shared global character. Changes affect every workspace and observation that uses it.")).toBeInTheDocument();
  expect(screen.getByText(/24 specimen observation/)).toBeInTheDocument();
  expect(screen.getByLabelText("Name")).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: /I understand/ }));
  expect(screen.getByRole("button", { name: "State in use" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Clarified definition" } });
  fireEvent.click(screen.getByRole("button", { name: "Save global changes" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(updateTaxonomyCharacter).toHaveBeenCalledWith("1", expect.objectContaining({ description: "Clarified definition" }));
});

test("new interpretation starts with source fields and states but never updates original IDs", async () => {
  await openEditor();
  fireEvent.click(screen.getByRole("button", { name: "Create a new interpretation" }));
  expect(screen.getByLabelText("Name")).toHaveValue(categorical.name);
  expect(screen.getByLabelText("Description")).toHaveValue(categorical.description);
  expect(screen.getByLabelText("Anatomical region")).toHaveValue("Thorax");
  expect(screen.getByLabelText("State 1 name")).toHaveValue("bare");
  expect(screen.getByLabelText("State 2 description")).toHaveValue("Setae present");
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Anepisternal setae — alternative" } });
  fireEvent.change(screen.getByLabelText("State 1 name"), { target: { value: "no visible setae" } });
  fireEvent.click(screen.getByRole("button", { name: "Create and add to workspace" }));
  await screen.findByText("Anepisternal setae added to workspace.");
  const sent = createCharacterWithStates.mock.calls[0][0];
  expect(sent.name).toBe("Anepisternal setae — alternative");
  expect(sent.states).toEqual([{ name: "no visible setae", description: "No setae" }, { name: "setose", description: "Setae present" }]);
  expect(sent).not.toHaveProperty("id");
  expect(updateTaxonomyCharacter).not.toHaveBeenCalled();
  expect(removeCharacterState).not.toHaveBeenCalled();
});

test("state deletion preserves controlled conflicts and state additions use the existing API", async () => {
  removeCharacterState.mockRejectedValue(Object.assign(new Error("State is used by specimen observations"), { status: 409 }));
  await openEditor();
  fireEvent.click(screen.getByRole("checkbox", { name: /I understand/ }));
  fireEvent.click(screen.getByRole("button", { name: "Remove state" }));
  fireEvent.click(await screen.findByRole("button", { name: "OK" }));
  expect(await screen.findByText("State is used by specimen observations")).toBeInTheDocument();
  expect(removeCharacterState).toHaveBeenCalledWith("1", "12");
  fireEvent.change(screen.getByLabelText("New state name"), { target: { value: "one large seta" } });
  fireEvent.click(screen.getByRole("button", { name: "Add state to global character" }));
  await waitFor(() => expect(addCharacterState).toHaveBeenCalledWith("1", { name: "one large seta", description: null, display_order: 2 }));
  await waitFor(() => expect(fetchCharacterUsage).toHaveBeenCalledTimes(2));
  await screen.findByText("Shared global character");
});

test("removal confirmation preserves global data and displays observation conflicts", async () => {
  removeWorkspaceCharacter.mockRejectedValueOnce(new Error("Workspace character has observations"));
  render(<CharacterManager />);
  await screen.findByText(categorical.name);
  fireEvent.click(screen.getAllByRole("button", { name: "Remove from workspace" })[0]);
  expect(await screen.findByText(/It will not be removed from other workspaces/)).toBeInTheDocument();
  expect(removeWorkspaceCharacter).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "OK" }));
  expect(await screen.findByText("Workspace character has observations")).toBeInTheDocument();
  expect(removeWorkspaceCharacter).toHaveBeenCalledWith("4", "1");
  expect(removeCharacterState).not.toHaveBeenCalled();
});

test("workspace and usage failures have retry paths and do not expose an unguarded editor", async () => {
  fetchWorkspaceCharacters.mockRejectedValueOnce(new Error("Workspace unavailable"));
  render(<CharacterManager />);
  expect(await screen.findByText("Workspace unavailable")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByText(categorical.name);
  fetchCharacterUsage.mockRejectedValueOnce(new Error("Usage unavailable"));
  fireEvent.click(screen.getAllByRole("button", { name: "View/edit character" })[0]);
  expect(await screen.findByText("Usage unavailable")).toBeInTheDocument();
  expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByText("Shared global character");
});

test("global character search failures can be retried", async () => {
  await openAdd();
  searchTaxonomyCharacters.mockRejectedValueOnce(new Error("Search unavailable"));
  fireEvent.change(screen.getByLabelText("Search global characters"), { target: { value: "Thorax" } });
  expect(await screen.findByText("Search unavailable")).toBeInTheDocument();
  searchTaxonomyCharacters.mockResolvedValue([categorical]);
  fireEvent.click(screen.getByRole("button", { name: "Retry search" }));
  expect(await within(screen.getByRole("dialog")).findByText(categorical.description)).toBeInTheDocument();
});
