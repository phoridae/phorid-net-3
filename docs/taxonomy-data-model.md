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
- The taxonomy database stores GBIF's external identifiers directly:
  species.gbif_taxon_key identifies the GBIF taxon and
  specimen_references.gbif_occurrence_key identifies the GBIF occurrence.
  johnhash_phorid_research is a rebuildable/cacheable GBIF snapshot, not the
  authoritative identity link. Durable curated taxonomy records do not depend
  on its internal primary keys or cross-database foreign keys.
