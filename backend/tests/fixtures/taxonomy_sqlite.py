"""Persistent, isolated SQL adapter for taxonomy route tests; never used by the API."""
import json
import sqlite3
import sys

SCHEMA = """
CREATE TABLE workspaces (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT,
 owner_uid TEXT, visibility TEXT DEFAULT 'private', created_at TEXT, updated_at TEXT);
CREATE TABLE species (
 id INTEGER PRIMARY KEY AUTOINCREMENT, gbif_taxon_key TEXT UNIQUE, genus TEXT NOT NULL,
 specific_epithet TEXT, species_status TEXT DEFAULT 'published', working_name TEXT, notes TEXT);
CREATE TABLE workspace_species (
 workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
 species_id INTEGER REFERENCES species(id) ON DELETE CASCADE, display_order INTEGER DEFAULT 0,
 PRIMARY KEY(workspace_id, species_id));
CREATE TABLE characters (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT,
 anatomical_region TEXT, data_type TEXT DEFAULT 'categorical', unit TEXT,
 created_by_uid TEXT, visibility TEXT DEFAULT 'private');
CREATE TABLE character_states (
 id INTEGER PRIMARY KEY AUTOINCREMENT, character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
 name TEXT NOT NULL, description TEXT, display_order INTEGER DEFAULT 0,
 UNIQUE(character_id, name), UNIQUE(id, character_id));
CREATE TABLE workspace_characters (
 workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
 character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
 display_order INTEGER DEFAULT 0, PRIMARY KEY(workspace_id, character_id));
CREATE TABLE species_descriptions (
 id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id INTEGER, species_id INTEGER,
 sex_scope TEXT DEFAULT 'general', basis TEXT, diagnosis TEXT, remarks TEXT, prepared_by_uid TEXT,
 UNIQUE(workspace_id, species_id, sex_scope),
 FOREIGN KEY(workspace_id, species_id) REFERENCES workspace_species(workspace_id, species_id) ON DELETE CASCADE);
CREATE TABLE character_observations (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 description_id INTEGER REFERENCES species_descriptions(id) ON DELETE CASCADE,
 character_id INTEGER REFERENCES characters(id), numeric_min NUMERIC, numeric_max NUMERIC, notes TEXT,
 UNIQUE(description_id, character_id), UNIQUE(id, character_id));
CREATE TABLE observation_states (
 observation_id INTEGER, character_id INTEGER, state_id INTEGER,
 PRIMARY KEY(observation_id, state_id),
 FOREIGN KEY(observation_id, character_id) REFERENCES character_observations(id, character_id) ON DELETE CASCADE,
 FOREIGN KEY(state_id, character_id) REFERENCES character_states(id, character_id));
CREATE TABLE publications (id INTEGER PRIMARY KEY);
CREATE TABLE specimen_references (
 id INTEGER PRIMARY KEY, publication_id INTEGER REFERENCES publications(id) ON DELETE SET NULL);
CREATE TABLE description_publications (
 description_id INTEGER REFERENCES species_descriptions(id) ON DELETE CASCADE,
 publication_id INTEGER REFERENCES publications(id), PRIMARY KEY(description_id, publication_id));
CREATE TABLE description_specimens (
 description_id INTEGER REFERENCES species_descriptions(id) ON DELETE CASCADE,
 specimen_reference_id INTEGER REFERENCES specimen_references(id), PRIMARY KEY(description_id, specimen_reference_id));
CREATE TABLE identification_keys (
 id INTEGER PRIMARY KEY, source_publication_id INTEGER REFERENCES publications(id) ON DELETE SET NULL);
CREATE TABLE key_characters (
 key_id INTEGER REFERENCES identification_keys(id) ON DELETE CASCADE,
 character_id INTEGER REFERENCES characters(id), PRIMARY KEY(key_id, character_id));
CREATE TABLE key_descriptions (
 key_id INTEGER REFERENCES identification_keys(id) ON DELETE CASCADE,
 description_id INTEGER REFERENCES species_descriptions(id),
 PRIMARY KEY(key_id, description_id));
INSERT INTO identification_keys VALUES (1,NULL);
INSERT INTO workspaces(id,name) VALUES (1,'Canada'), (2,'USA');
INSERT INTO species(id,genus,specific_epithet) VALUES (1,'Testphora','alpha');
INSERT INTO workspace_species VALUES (1,1,0), (2,1,0);
INSERT INTO characters(id,name,data_type,unit) VALUES (1,'Setae','categorical',NULL), (2,'Length','numeric_range','mm'), (3,'Color','categorical',NULL);
INSERT INTO character_states(id,character_id,name) VALUES (1,1,'Bare'), (2,1,'Setose'), (3,3,'Yellow');
INSERT INTO workspace_characters VALUES (1,1,0), (1,2,1), (2,1,0);
INSERT INTO species_descriptions(id,workspace_id,species_id,sex_scope) VALUES (1,1,1,'female'), (2,2,1,'female');
"""

connection = None
for line in sys.stdin:
    try:
        request = json.loads(line)
        action = request['action']
        if action == 'reset':
            if connection:
                connection.close()
            connection = sqlite3.connect(':memory:', isolation_level=None)
            connection.row_factory = sqlite3.Row
            connection.execute('PRAGMA foreign_keys = ON')
            connection.executescript(SCHEMA)
            result = None
        elif action in ('begin', 'commit', 'rollback'):
            connection.execute({'begin': 'BEGIN', 'commit': 'COMMIT', 'rollback': 'ROLLBACK'}[action])
            result = None
        else:
            statement = request['sql'].replace(' FOR UPDATE', '').replace('LAST_INSERT_ID()', 'last_insert_rowid()')
            cursor = connection.execute(statement, request.get('params', []))
            result = [dict(row) for row in cursor.fetchall()] if cursor.description else {'affectedRows': cursor.rowcount}
        print(json.dumps({'result': result}), flush=True)
    except Exception as error:
        code = None
        if isinstance(error, sqlite3.IntegrityError):
            code = 'ER_DUP_ENTRY' if 'UNIQUE' in str(error) else 'ER_ROW_IS_REFERENCED_2'
        print(json.dumps({'error': str(error), 'code': code}), flush=True)
