All routes below are relative to `/api/taxonomy`. They require a Firebase bearer
token with `admin: true` and use the taxonomy database. Each mutation runs in a
transaction and responds only after commit. Existing read routes remain available.

| Method | Route | Body |
| --- | --- | --- |
| POST | `/workspaces` | `name` required; `description`, `owner_uid`, `visibility` optional |
| PATCH | `/workspaces/:id` | Any workspace fields above |
| DELETE | `/workspaces/:id` | None |
| POST | `/species` | `genus` required; `gbif_taxon_key`, `specific_epithet`, `species_status`, `working_name`, `notes` optional |
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
| PATCH | `/descriptions/:id` | Description fields: `sex_scope`, `basis`, `diagnosis`, `remarks`, `prepared_by_uid` |
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
- Characters default to `categorical`; the other type is `numeric_range`.
  Only categorical characters have states; only numeric characters have units.
  A character's type cannot change while it has states or observations. Units
  cannot change while observations exist, to avoid silently reinterpreting data.
- Descriptions default to `sex_scope: "general"`; `female` and `male` are also
  accepted. `basis` accepts `publication`, `new_observations`, `mixed`, or null.
  The species must already belong to the workspace. A workspace/species/sex
  combination is unique. PATCH cannot move a description between species or
  workspaces.
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

{"state_ids":["1","2"],"notes":"Both states observed"}
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
- Duplicate GBIF taxon keys, memberships, state names within a character, and
  workspace/species/sex descriptions return `409`. Referential conflicts and
  database deadlock/lock timeout errors also return `409`; the edit rolls back.
  Unexpected failures propagate to the application's `500` error handler.

Review of the existing protections against the authoritative SQL schema:

| Protection | Resulting behavior |
| --- | --- |
| Description species membership | Already checked before insertion; missing workspace or membership returns controlled `404` |
| Unique workspace/species/sex description | Already enforced by the database unique key; duplicate create or PATCH returns `409` |
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
