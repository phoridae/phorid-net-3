- The evidence chain is specimen/publication evidence → attributed specimen
  observations → species description (taxonomic hypothesis/interpretation) →
  description-level synthesized character observations → identification key.
- A specimen and a publication are evidence; neither is itself a taxonomic score.
- Species and specimens are global scientific entities. Every specimen has a
  current taxonomic species assignment, independent of workspace membership.
  New specimen API records require species_id. The schema still permits NULL
  for legacy records, which remain readable until explicitly assigned.
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
- Specimen assignment may change without changing the physical specimen's ID,
  attributed observations, description-level synthesis, publications, or evidence
  links. Historical description-specimen relationships remain valid even when the
  specimen's current species differs from that interpretation's species.
- The schema restricts species deletion while specimens are currently assigned
  to it. Reassign or delete those specimen references before deleting the species.
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
- Current API authorization is admin-wide. Workspace owner_uid and visibility
  metadata do not enforce owner/collaborator editing rights. The Species UI
  follows that server policy and does not use browser filtering as authorization.
