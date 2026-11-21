- The evidence chain is specimen/publication evidence → attributed specimen
  observations → species description (taxonomic hypothesis/interpretation) →
  description-level synthesized character observations → identification key.
- A specimen and a publication are evidence; neither is itself a taxonomic score.
- Specimens are global physical vouchers. Taxonomic identification is a workspace
  interpretation, never a single global Phorid.net truth. A voucher can be
  Myriophora kungae in one workspace and Myriophora sp. JH-04 in another.
- `workspace_specimen_identifications` holds ONE CURRENT interpretation for each
  `(workspace_id, specimen_reference_id)`: species, identifying Firebase user,
  notes, and timestamps. PUT creates or replaces the current interpretation;
  there is no identification-history model. The same global voucher is reused.
- Identification implies workspace species membership. The API saves both in one
  transaction, reuses membership, and never removes the old species automatically
  after reassignment. Removing a species membership while identifications refer
  to it is rejected. Published and WIP species are both valid identifications.
- The nullable `specimen_references.species_id` column is LEGACY. New specimen
  workflows never write it; metadata PATCH rejects it. Legacy values remain
  explicitly readable as legacy data, not a workspace fallback. They are not
  copied into any workspace automatically. No schema changes or migration occur.
- GBIF/cache scientific and accepted names, GBIF Backbone keys, and COL XR keys
  are external reference data. Accepting an import suggestion explicitly records
  an interpretation only in the selected workspace. A GBIF refresh never writes
  a workspace interpretation. With no workspace, import creates/reuses only the
  global voucher and does not import a species or create membership.
- GBIF institution, collection, catalog number, and occurrence key are read-only
  source identity in the normal workflow. Local/manual identity remains editable.
  Voucher labels/notes are local descriptive metadata; identification notes are
  stored separately with the workspace interpretation. A future correction model
  may preserve source and locally corrected values separately.
- Working/code-name species are valid assignments: for example, Apocephalus sp.
  AZ-17 has genus Apocephalus, specific_epithet NULL, species_status
  work_in_progress, and working_name AZ-17. A formal published name is not required.
- The Species manager has two entry workflows: import an accepted Phoridae
  species from GBIF/COL XR, or create a manual/working global taxon. Both then
  select the global species in the active workspace; membership is not ownership.
- COL XR is the preferred current external taxonomy. Import revalidates an exact
  COL identity, reuses a curated record by external identifier, and creates only
  missing workspace membership. A legacy GBIF key is optional and is retained
  only when known or verified by an identifier round trip; absence is not an error.
- Manual genus entry normally uses a standardized COL genus search, with explicit
  manual/provisional genus fallback for new or unresolved genera. No genus ID is
  required or stored. A WIP taxon without an epithet requires a nonblank working
  name; neither external identifier is required. Likely curated matches are offered
  for reuse without imposing name-string uniqueness.
- Changing a workspace identification affects only that workspace. Global raw
  observations, states, synthesis, publications, description/specimen links,
  evidence and provenance remain unchanged. Historical descriptions may disagree
  with any workspace's current identification. Species deletion is restricted by
  workspace identifications and, transitionally, legacy specimen references.
- A specimen observation is an attributed assertion about an individual specimen.
  Multiple taxonomists may record different observations of the same specimen
  and character. Those competing assertions coexist with their own IDs,
  observation basis, attribution, source publication, and categorical/numeric values.
- Species descriptions are globally discoverable taxonomic hypotheses/interpretations
  with an originating/editing workspace. Workspaces are working contexts, not
  visibility boundaries; specimens never acquire workspace ownership.
  Multiple descriptions of the same species, sex scope, and workspace are expected
  and valid. There is no canonical/preferred-description flag or uniqueness rule
  on that combination.
- Interpretation labels/types and attribution distinguish alternative descriptions.
  Interpretation type is independent of basis: an alternative interpretation may
  be based entirely on publications. A derived description references an existing
  description of the same species.
- Descriptions are mutable, not authoritative/final.
- A description's species must be assigned to its workspace through workspace_species.
- character_observations are the explicit description-level synthesized taxonomic
  interpretation. They are not raw specimen observations. A description has at
  most one synthesized observation for a given character, which must belong to
  the description's workspace.
- Synthesized observations may link exact specimen observation IDs and publication
  evidence. Evidence links do not automatically calculate or overwrite synthesis.
- description_specimens links specimens to interpretations. reported_material_examined
  means reported as material examined, often in literature; it does not imply
  personal examination or individual character scoring. directly_examined records
  direct examination in connection with the work. Both flags may be true, and a
  linked specimen may have zero specimen observations.
- description_specimen_publications identifies publications reporting the linked
  specimen as material examined for that interpretation. This is separate from
  specimen-level character scoring and its source publication.
- character_observation_specimen_evidence links a synthesized observation to exact
  attributed specimen assertions of the same character, from specimens already
  associated with that description. Competing assertions are never collapsed.
- character_observation_publications links synthesis to publications. The API
  requires explicit description_publications membership before attaching them;
  it never creates hidden evidence associations.
- Characters and states are global reusable definitions. Specimen observations
  are global attributed evidence. Workspaces choose which species and characters
  a researcher actively works with; they may reuse the same global entities.
- Workspace character membership is only a working-set relationship, not scientific
  ownership. Reuse a character when its definition and states agree with the
  researcher's interpretation. Substantively different meanings, boundaries, or
  state systems should use a distinct global character and distinct states.
- Editing a shared character can affect observations, descriptions, and keys in
  many workspaces. The Character Manager shows usage counts and requires an
  acknowledgement before shared edits. Copying through “Create a new
  interpretation” is the preferred starting point for alternative definitions;
  the copy has fresh character/state IDs and leaves the original evidence intact.
  No derivation relationship is added to the schema. Existing state definitions
  are preserved in the editor; used states cannot be deleted.
- Identification keys are independent of workspaces.
- A key selects exact species_descriptions, not merely species. Alternative
  descriptions remain separate candidates. Filtering continues to use only
  their synthesized character_observations, never raw specimen observations.
- Keys may use descriptions from multiple workspaces.
- Draft keys may contain work-in-progress species.
- Published keys may contain only published species.
- Missing observation means unscored/unknown, NOT absent.
- A species may exhibit multiple states for one categorical character.
- Within one character, multiple compatible states are alternatives.
- Across selected characters, filtering uses intersection/AND logic.
- Publications/specimens for a key are derived from its selected descriptions.
- The SQL schema is authoritative for enums, uniqueness and FK/cascade behavior.
  The API does not add cascades to bypass restrictive relationships.
- The taxonomy database stores parallel, durable external taxonomic identifiers
  directly: species.gbif_taxon_key is the legacy numeric GBIF Backbone identifier;
  species.col_xr_taxon_key is the newer Catalogue of Life Extended Release (COL XR)
  identifier and may be alphanumeric (for example Q2M4). They are independent:
  neither replaces, derives, or overwrites the other. Either may be NULL, and
  working/undescribed taxa may have neither. Existing Phorid.net integrations
  continue using the legacy GBIF key; future lookup/import workflows may populate
  one or both identifiers. The Species manager's lookup/import adapter provides
  one explicit way to populate them; storing an identifier does not itself fetch
  or refresh external data.
- For specimen identity,
  specimen_references.gbif_occurrence_key identifies the GBIF occurrence.
  johnhash_phorid_research is a rebuildable/cacheable GBIF snapshot, not the
  authoritative identity link. Durable curated taxonomy records do not depend
  on its internal primary keys or cross-database foreign keys.
- The normal Specimens tab is workspace-scoped: it includes global vouchers
  having an identification row in `workspace_specimen_identifications` for the
  selected workspace. No `workspace_specimens` table exists and this working set
  is interpretation, not ownership. Without a selected workspace the tab shows
  instructions instead of the entire global registry. Search stays within the set.
- Add specimen searches and reuses the GLOBAL Phorid.net specimen registry,
  including vouchers not interpreted in the current workspace, alongside the
  local GBIF snapshot and explicit current-GBIF fallback. Existing vouchers are
  reused by recording a workspace identification, which ensures species
  membership without duplicating the physical voucher. The same global voucher
  can participate in multiple workspaces with different identifications. GBIF
  occurrence keys remain durable external IDs; cache row IDs are not identities.
- When recording an identification during import, existing taxonomy suggestions
  match by COL XR, legacy GBIF identifier, then unambiguous exact scientific name.
  Missing accepted species can be resolved/imported as part of the final specimen
  import transaction. The user can override the suggestion with a published/WIP
  species, omit identification, or import globally without selecting a workspace.
- Occurrence import is idempotent by GBIF occurrence key. Likely manual duplicates
  based on institution/collection/catalog metadata are warnings, not a new uniqueness rule.
- Specimen identity has separate, independently nullable components:
  `institution_code` identifies the institution (for example LACM),
  `collection_code` identifies the collection (for example ENT), and
  `catalog_number` identifies the collection's catalog record (for example 12345).
  Institution and collection codes allow 64 characters; catalog numbers allow 128.
  GBIF/cache imports store collection code directly in the taxonomy specimen row.
  `specimen_label` is free-text descriptive metadata, not a substitute for structured
  collection code, and is not automatically assembled from these components.
  Displays join available components cleanly, for example `LACM ENT 12345`.
- Likely manual duplicate checks compare case-insensitive, trimmed values for all
  supplied identity components. Without collection code, institution/catalog
  matching remains available and includes records with null collection codes.
  Omitting collection code on POST leaves it null; omitting it on PATCH preserves
  its existing value. Explicit null clears local identity metadata without changing identifications or evidence.
- Character scoring belongs in the later Data Entry workflow, not Specimens.
- Current API authorization is admin-wide. Workspace owner_uid and visibility
  metadata do not enforce owner/collaborator editing rights. The Species UI
  follows that server policy and does not use browser filtering as authorization.
