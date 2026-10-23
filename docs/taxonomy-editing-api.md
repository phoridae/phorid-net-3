All routes below are relative to `/api/taxonomy`. They require a Firebase bearer
token with `admin: true` and use the taxonomy database. Each mutation runs in a
transaction and responds only after commit. Existing read routes remain available.

Species, specimens, characters/states, and attributed specimen observations are
global entities. Workspaces select active species/characters and provide the
originating/editing context for globally discoverable descriptions; a workspace
is not a visibility boundary. Specimens have no workspace ownership. Keys remain
products built from exact descriptions and their synthesized character observations.

| Method | Route | Body |
| --- | --- | --- |
| POST | `/workspaces` | `name` required; `description`, `owner_uid`, `visibility` optional |
| PATCH | `/workspaces/:id` | Any workspace fields above |
| DELETE | `/workspaces/:id` | None |
| POST | `/species` | `genus` required; `gbif_taxon_key`, `col_xr_taxon_key`, `specific_epithet`, `species_status`, `working_name`, `notes` optional |
| DELETE | `/species/:id` | None |
| POST | `/workspaces/:id/species` | `species_id` required; `display_order` optional |
| DELETE | `/workspaces/:id/species/:speciesId` | None |
| POST | `/characters` | `name` required; `description`, `anatomical_region`, `data_type`, `unit`, `visibility` optional |
| PATCH | `/characters/:id` | Any character fields above |
| DELETE | `/characters/:id` | None |
| POST | `/characters/:id/states` | `name` required; `description`, `display_order` optional |
| DELETE | `/characters/:id/states/:stateId` | None |
| POST | `/workspaces/:id/characters` | `character_id` required; `display_order` optional |
| DELETE | `/workspaces/:id/characters/:characterId` | None |
| PATCH | `/workspaces/:id/characters` | `character_ids`: all current character IDs, in desired order |
| POST | `/descriptions` | `workspace_id`, `species_id` required; description fields below optional |
| PATCH | `/descriptions/:id` | Description fields listed below, including workspace/species and interpretation fields |
| DELETE | `/descriptions/:id` | None |
| PUT | `/descriptions/:id/observations/:characterId` | Full categorical or numeric observation, as below |
| DELETE | `/descriptions/:id/observations/:characterId` | None |

Creates return `201` with the new record or membership. PATCH and observation
PUT return `200` with the updated record; deletes return `204`. Observation
responses include `state_ids`, `numeric_min`, `numeric_max`, and `notes`.
All IDs are strings in responses. Pass large IDs as JSON strings to preserve
precision; positive safe JSON integers are also accepted as input.

Defaults and validation:

- Workspace visibility and character visibility default to `private`; accepted
  values are `private`, `shared`, `public`. Workspace `owner_uid`, character
  `created_by_uid`, and description `prepared_by_uid` default to the caller UID.
  Character `created_by_uid` cannot be supplied or changed through this API.
  Explicit admin-supplied `owner_uid` and `prepared_by_uid` are intentionally
  retained on create and PATCH, including null: these identify the workspace's
  owner and the description's credited preparer, who may differ from the admin
  making the request. They are attribution fields, not an audit of the caller.
  Neither field affects authentication or grants access through these routes.
- Species default to `published` and require a nonblank `specific_epithet`.
  `work_in_progress` species require a nonblank `working_name`. Creating a species
  does not attach it to a workspace automatically.
  The optional external identifiers are independent: `gbif_taxon_key` is the
  legacy numeric GBIF Backbone key (positive unsigned BIGINT, serialized as a
  string), while `col_xr_taxon_key` is a nullable string of at most 64 characters
  for Catalogue of Life Extended Release (COL XR). Alphanumeric values such as
  `Q2M4` are accepted; numeric JSON values are rejected for COL XR. Neither field
  is required, and either or both may be null, including for working taxa.
  Each identifier has its own schema unique constraint. Duplicate non-null values
  return controlled `409`; invalid types/lengths return `400`. Multiple nulls are
  permitted. One identifier never fills or overwrites the other.
  There is currently no global species PATCH endpoint; this change adds none.
- Characters default to `categorical`; the other type is `numeric_range`.
  Only categorical characters have states; only numeric characters have units.
  A character's type cannot change while it has states or observations. Units
  cannot change while observations exist, to avoid silently reinterpreting data.
- Descriptions default to `sex_scope: "general"`; `female` and `male` are also
  accepted. `basis` accepts `publication`, `new_observations`, `mixed`, or null.
  The species must already belong to the workspace. Multiple descriptions of the
  same workspace/species/sex are legitimate competing interpretations and receive
  distinct IDs; matching that combination never causes `409`.
  POST and PATCH accept `workspace_id`, `species_id`, `sex_scope`, `basis`,
  `interpretation_label`, `interpretation_type`, `attribution_text`,
  `derived_from_description_id`, `diagnosis`, `remarks`, and `prepared_by_uid`.
  Interpretation type accepts `published`, `new_interpretation` (default),
  `alternative`, or `synthesis`, independently of basis. Labels/attribution are
  nullable strings up to 255 characters. A supplied non-null derivation ID must
  exist and refer to the same species, otherwise `400`. PATCH can change workspace
  or species, subject to destination membership and derivation validation.
  Moving to a workspace missing existing synthesized characters returns `409`;
  changing species while other same-species interpretations derive from this
  description returns `409` if it would invalidate those derivations.
- Membership and state `display_order` defaults to zero and accepts unsigned
  32-bit integers. Reordering requires every current workspace character exactly
  once; it assigns consecutive order values beginning at zero. It neither adds
  nor removes memberships. An empty array is valid for an empty workspace.
- PATCH changes only supplied fields. Explicit null clears nullable fields;
  required names, enums, and IDs cannot be null. Empty bodies and unsupported
  fields return `400`. Text length, enum, ID, and numeric precision constraints
  are validated before writes. Names must be nonblank.

Categorical observation replacement:

```http
PUT /api/taxonomy/descriptions/1/observations/1
Content-Type: application/json

{"state_ids":["1","2"],"evidence_basis":"taxonomic_judgment","notes":"Both states observed"}
```

The character must belong to the description's workspace, and every state must
belong to the character. Duplicate state IDs are deduplicated. The entire state
set is replaced atomically; `state_ids: []` records an unknown/unscored
observation. Numeric fields are rejected on categorical observations.

Numeric observation replacement:

```http
PUT /api/taxonomy/descriptions/1/observations/2
Content-Type: application/json

{"numeric_min":1.5,"numeric_max":1.8,"notes":"Measured in mm"}
```

Numeric fields accept finite JSON numbers fitting `DECIMAL(12,6)` (up to six
decimal places, absolute value at most `999999.999999`) or null. At least one
bound field must be supplied; omitted bounds become null. When both are known,
`numeric_min <= numeric_max` is required. Both bounds null records an unknown
range. State IDs are rejected on numeric observations. The unit is defined by
the character.

PUT creates or replaces the observation for this description and character,
keeping its existing ID when present. Omitted `notes` becomes null. DELETE
removes the observation and its categorical state associations; missing data
continues to mean unknown, never absent. Observations remain specific to their
description, workspace, and sex scope.
These observations are synthesized taxonomic judgments. They accept `evidence_basis`:
`unspecified`, `specimen`, `publication`, `mixed`, or `taxonomic_judgment`.
Omitting it retains the existing value on PUT, or defaults to `unspecified` on
creation. Evidence links never automatically change this field or the score.
PUT retains the observation ID and its evidence links; DELETE cascades those
links according to the schema.

Specimen evidence endpoints:

| Method | Route | Body / behavior |
| --- | --- | --- |
| POST | `/specimen-references` | `reference_type` and `species_id` required; other fields below optional |
| GET | `/specimen-references/:id` | Specimen reference record with current species metadata |
| PATCH | `/specimen-references/:id` | Supplied specimen fields only |
| DELETE | `/specimen-references/:id` | `204`; description associations restrict deletion with `409` |
| POST | `/descriptions/:id/specimens` | `specimen_reference_id` required; `reported_material_examined`, `directly_examined`, `notes` optional |
| PATCH | `/descriptions/:id/specimens/:specimenId` | Update either examination flag or `notes` |
| DELETE | `/descriptions/:id/specimens/:specimenId` | Unlink; schema cascades reporting/evidence links, preserving independent specimen assertions |
| POST | `/descriptions/:id/specimens/:specimenId/publications` | `publication_id` required |
| DELETE | `/descriptions/:id/specimens/:specimenId/publications/:publicationId` | Remove reporting publication association |
| POST | `/specimen-references/:specimenId/observations` | `character_id` and categorical `state_ids` or numeric bounds, plus attribution below |
| PATCH | `/specimen-observations/:id` | Update values/attribution of this exact assertion; character and specimen are immutable |
| DELETE | `/specimen-observations/:id` | Remove exact assertion; state/evidence-link rows cascade, synthesized scores remain |
| POST | `/descriptions/:id/publications` | `publication_id` required, `notes` optional; explicit description association |
| DELETE | `/descriptions/:id/publications/:publicationId` | Remove association; `409` while synthesis uses it as publication evidence |
| PUT | `/descriptions/:descriptionId/observations/:characterId/specimen-evidence` | Full replacement: `{"specimen_observation_ids":["1","2"]}` |
| PUT | `/descriptions/:descriptionId/observations/:characterId/publication-evidence` | Full replacement: `{"publication_ids":["1","2"]}` |

These routes are admin-only and follow the same `201` create, `200` read/update,
`204` delete, `400` invalid input, `404` missing resource, and controlled `409`
relationship/duplicate conflict conventions. Specimen-evidence and publication-evidence
relationship mismatches return `400`; missing resources return `404`. Replacement
operations are transactional, deduplicate IDs, and accept empty arrays to clear links.

Specimen reference fields match the schema: `species_id`, `reference_type` (`gbif`, `local`,
`publication`), nullable `gbif_occurrence_key`, `publication_id`, `institution_code`
(64 characters), `catalog_number` (128), `specimen_label` (255), and `notes` (TEXT).
Publication IDs must exist when supplied; duplicate GBIF occurrence keys return
`409`. IDs and occurrence keys serialize as strings. Deleting an unassociated
specimen cascades its raw observations; a specimen still associated with a
description cannot be deleted.

Every new specimen must have a current species assignment. POST requires an
existing `species_id`; PATCH accepts a new `species_id` to change that assignment.
Malformed, null, zero, or unsafe numeric IDs return `400`. A well-formed ID for a
missing species returns controlled `404`. PATCH with species_id omitted retains
the assignment. A species need not belong to any workspace to be assigned to a
specimen. Working/code-name species are valid, for example:

```json
{
  "genus": "Apocephalus",
  "specific_epithet": null,
  "species_status": "work_in_progress",
  "working_name": "AZ-17"
}
```

Create that global species with `POST /species`, then use its ID in
`POST /specimen-references` or PATCH an existing specimen. Assignment updates
change only the specimen reference record. Specimen observations, synthesized
character observations, historical publications, description-specimen links, and
all evidence relationships remain intact. A historical description can therefore
retain a specimen whose current assignment differs from that description's species.
No identification history or competing identification assertion is generated.

Specimen POST/PATCH/GET responses include the string `species_id` and a nested
`species` record containing string `id`/`gbif_taxon_key`, genus, specific epithet,
nullable string `col_xr_taxon_key`, species status, and working name, along with other species metadata. The same
species information appears in description-detail `specimen_references` and nested
specimen references in raw observation and provenance responses.

Compatibility: the authoritative schema still allows `species_id = NULL`, and
existing dump records use that value. Legacy specimens remain readable with
`species_id: null` and `species: null`; metadata PATCH does not implicitly assign
them. Explicitly PATCH a valid species ID to assign them. New API creates require
species_id and PATCH rejects clearing it, so existing clients creating specimens
must supply the assignment. This task does not backfill legacy data or change DDL.

External identity remains independent of the research cache. The small, durable
taxonomy database directly stores the legacy GBIF Backbone key in
`species.gbif_taxon_key`, the COL XR string identifier in `species.col_xr_taxon_key`,
and GBIF occurrence keys in `specimen_references.gbif_occurrence_key`. The latter keeps
its existing optional/null, positive-ID validation and uniqueness behavior during
reassignment. `johnhash_phorid_research` is a rebuildable GBIF snapshot/cache;
curated taxonomy records never depend on its internal row IDs or foreign keys.
Existing Phorid.net/GBIF integrations continue using `gbif_taxon_key` unchanged.
Future species lookup/import may populate one or both taxonomic identifiers;
there are no new live GBIF/COL lookup endpoints or HTTP calls in this change.

For example, `POST /api/taxonomy/species` may receive:

```json
{
  "genus": "Testphora",
  "specific_epithet": "example",
  "gbif_taxon_key": "1234567",
  "col_xr_taxon_key": "Q2M4"
}
```

The create response and species metadata in workspace species, descriptions,
specimen references, provenance/evidence, and key candidates/filter results expose
both identifiers as strings or null. This is an additive response field; existing
GBIF names, values, validation, and filtering semantics are preserved.

The two examination flags accept JSON booleans, default to false, and are
independent. `reported_material_examined: true` means reported as material examined
for this interpretation, often in literature; it does not mean individually scored
or personally examined. `directly_examined: true` means examined in connection
with this work. Both may be true. Neither flag creates observations. Reporting
publication links require an existing description-specimen association and an
existing publication, without implying character scoring.

Specimen observations are independent attributed assertions. POST always creates
a new ID; multiple assertions of the same specimen and character are allowed.
For example:

```json
{
  "character_id": "1",
  "state_ids": ["2"],
  "observation_basis": "publication",
  "attribution_text": "Smith's interpretation of this specimen",
  "source_publication_id": "1"
}
```

Optional fields are `observation_basis` (`direct_exam`, `publication`, `other`),
`observed_by_uid` (nullable, 128 characters), `attribution_text` (nullable, 255),
`source_publication_id` (nullable existing publication), and `notes` (nullable TEXT).
Default basis is `direct_exam`. On creation, omitted `observed_by_uid` defaults
to `req.user.uid` only for direct examination. Explicit admin attribution, including
null UID, is retained. Publication/other observations do not inherit the caller UID.
On PATCH, omitted fields remain unchanged; explicitly changing basis to `direct_exam`
from another basis defaults an omitted observer UID to the caller. No other PATCH
silently changes basis or attribution.

Categorical assertions require state IDs belonging to the character and reject
numeric fields (including explicit null numeric fields). Numeric assertions require
`numeric_min` and/or `numeric_max` on creation, use the same DECIMAL bounds and
ordering rules as synthesis, and reject `state_ids`. PATCH may update metadata alone;
numeric PATCH retains omitted bounds and validates the resulting full range.
Categorical PATCH replaces the complete state set when `state_ids` is supplied.
An empty state set or null numeric bounds represent unknown. Raw observations need
no workspace membership because they are assertions about specimens, independent
of descriptions. Character types/units cannot be changed while either raw or
synthesized observations exist; states in use by either layer cannot be removed.

Specimen-evidence replacement requires an existing synthesized observation, each
exact specimen observation, matching character IDs, and an existing
`description_specimens` association for each underlying specimen. Publication-evidence
replacement requires existing publications already associated with this description
through `description_publications`. Use the explicit description-publication POST
route to establish membership. Neither replacement changes states, numeric values,
attribution, or evidence basis in either observation layer. Competing observations
are never merged or auto-selected.

`GET /descriptions/:id` preserves the existing response shape and adds:

- Interpretation label/type, attribution, and string/null derivation ID.
- On each `specimen_references` entry, current `species_id`/`species`, boolean examination flags, existing
  `association_notes`, and `material_examined_publications` with reporting provenance.
- On each `character_observations` entry, `evidence_basis`, `publication_evidence`,
  and `specimen_evidence` arrays. Each linked specimen assertion retains its ID,
  values/states, character, specimen reference, basis, observer UID, attribution,
  source publication, notes, and link metadata.

The existing workspace species read also includes interpretation fields on each
description. Competing descriptions and assertions remain separate objects. Keys
continue selecting exact descriptions and filtering only synthesized observations.

Removal rules and errors:

- `DELETE /workspaces/:id` uses the schema's cascades to remove workspace species
  and character memberships, descriptions, observations, observation states,
  and description publication/specimen associations. Global species, characters,
  states, publications, specimens, and keys remain. A key referencing any affected
  description blocks deletion with `409` and rolls back the entire operation.
- `DELETE /species/:id` cascades species membership and descriptions across all
  workspaces, including observations and description evidence associations.
  Workspaces and reusable characters/evidence remain. A key referencing any
  affected description blocks deletion with `409` and rolls back the operation.
  Specimens currently assigned through `specimen_references.species_id` also
  block deletion with `409` and a specific JSON error explaining that specimens
  must be reassigned or deleted first. After that, the usual cascade/key-reference
  rules apply. The API does not clear assignments or delete specimens to force a
  species deletion, and it does not return raw MySQL/MariaDB FK errors.
- `DELETE /characters/:id` cascades character states and workspace character
  memberships. Existing character observations or key character selections
  restrict deletion and return `409`; those references are never removed to
  force deletion.
- `DELETE /descriptions/:id` cascades observations, observation states, and
  publication/specimen associations. Global species, workspace memberships,
  publications and specimens remain. A key selecting the description restricts
  deletion and returns `409`.
- All four resource deletes return `204` with no body on success, `404` when the
  target does not exist, or `400` for an invalid ID. Restricted deletion returns
  a resource-specific JSON `{ "error": "..." }` message with `409`; raw database
  errors are not returned. These routes use the existing database constraints,
  without adding cascades or manually deleting restrictive references.
- Removing species membership deletes that workspace's descriptions and their
  observations/publication/specimen associations through database cascades. The
  global species and other workspaces' descriptions remain. If any description
  is selected by an identification key, removal returns `409` without changes.
- Removing workspace character membership returns `409` while descriptions in
  that workspace have observations for it. Remove those observations first.
  Removing membership does not delete the reusable global character or states.
- Removing a state returns `409` while an observation uses it. Setting the
  categorical states of an observation replaces only that observation's values.
- Missing resources/memberships return `404`. State deletion checks the parent
  character. Wrong observation state ownership, missing workspace character
  membership, and invalid bodies return `400`.
- Duplicate GBIF taxon/occurrence keys, COL XR taxon keys, memberships, and state names within a
  character return `409`. Repeated workspace/species/sex descriptions and repeated
  specimen/character assertions are allowed. Referential conflicts and
  database deadlock/lock timeout errors also return `409`; the edit rolls back.
  Unexpected failures propagate to the application's `500` error handler.

Review of the existing protections against the authoritative SQL schema:

| Protection | Resulting behavior |
| --- | --- |
| Description species membership | Already checked before insertion; missing workspace or membership returns controlled `404` |
| Competing workspace/species/sex descriptions | Allowed with distinct IDs; no unique constraint or matching-combination conflict |
| Observation character membership | Already checked through `workspace_characters`; unassigned character returns `400` |
| Observation type separation | Already checked; categorical/numeric field mixing returns `400` |
| Categorical state ownership | Already checked; another character's state returns `400`, nonexistent state returns `404` |
| Numeric bound order | Already checked; `numeric_min > numeric_max` returns `400` |
| Exact character reorder | Already checked; duplicate, missing, or additional IDs return `400`, valid reorder returns `200` transactionally |
| DELETE relationship conflicts | Already mapped to controlled `409`; resource-specific errors added for the four resource deletes |
| Ownership/attribution | Authenticated creator and default UIDs already present; explicit admin ownership/preparer attribution intentionally retained |

Run `npm test --prefix backend` for the editing and key suites. The isolated SQL
fixtures require Python 3 (editing suite) and the `sqlite3` CLI (key suite). They
exercise actual SQL, foreign keys, and transaction rollback without connecting
to MySQL or Firebase. MySQL-specific locking, concurrency, and deployment
credentials still require live integration verification.
The editing fixture's foreign-key actions are checked against
`db/schema/johnhash_phorid_taxonomy.sql` to detect cascade/restriction drift.
