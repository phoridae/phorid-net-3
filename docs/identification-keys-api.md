The identification key endpoints are mounted at `/api/taxonomy/keys`. All require
a Firebase bearer token with `admin: true`. No create, update, or delete endpoints
are implemented. They use the taxonomy database, independently of the legacy
`/flies` endpoints.

- `GET /keys`: all draft and published keys, ordered by name and ID.
- `GET /keys/:id`: key metadata.
- `GET /keys/:id/characters`: selected characters in display order, including
  their ordered `states` arrays and key association metadata.
- `GET /keys/:id/candidates`: selected descriptions with workspace and species
  information. Each row's `id` is the description ID; `species_id` and
  `workspace_id` identify its source. Multiple descriptions of one species stay
  separate. Draft keys include work-in-progress species; published keys return
  only published species.
- `POST /keys/:id/filter`: the same candidate shape after filtering. This is a
  read operation and does not modify observations or key membership.

IDs are serialized as strings to preserve BIGINT precision. Invalid IDs and
invalid filter bodies return 400; nonexistent keys return 404. Existing keys
with no characters or candidates return empty arrays.

Example body for `POST /api/taxonomy/keys/1/filter` (IDs must belong to that key):

```json
{
  "filters": [
    { "character_id": "1", "state_ids": ["1", "2"] },
    { "character_id": "2", "min": 1.6, "max": 1.8 }
  ]
}
```

Categorical filters require a nonempty array of state IDs belonging to the
character. States within a character are alternatives (OR); different characters
use AND. A character may occur only once in the request. Numeric filters accept
finite JSON numbers for `min`, `max`, or both, and match inclusive overlapping
ranges. Null or omitted bounds are open; at least one bound is required.
`{"filters": []}` returns all candidates.

Unscored descriptions remain possible candidates: missing observations, empty
categorical observations, and unknown numeric bounds are not evidence of
incompatibility. An explicit categorical state such as “bare” is scored normally.
All criteria apply to the same description, without merging observations across
workspaces or sex scopes. Unsupported fields, unknown characters, and states
belonging to other characters return 400.

Run the isolated route and SQL tests with
`node --test backend/tests/keys.test.js`. The fixture uses the `sqlite3` CLI and
does not connect to MySQL or Firebase. A live MySQL integration check still
requires the application's configured taxonomy database.
