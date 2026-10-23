"""Persistent, isolated SQL adapter for taxonomy route tests; never used by the API."""
import json
import sqlite3
import sys

# Read only DDL from the authoritative schema; never load production dump data.
# SQLite adapts types/locking but preserves actual columns, enums, defaults,
# composite unique keys, and FK actions (including competing interpretations).
import re
from pathlib import Path

source = (Path(__file__).resolve().parents[3] / 'db/schema/johnhash_phorid_taxonomy.sql').read_text()
statements = []
for table, definition in re.findall(r'CREATE TABLE `(\w+)` \(\n([\s\S]*?)\n\)', source):
    alters = '\n'.join(re.findall(r'ALTER TABLE `' + table + r'`\s+([\s\S]*?);', source))
    auto_id = bool(re.search(r'MODIFY `id`[^;]*AUTO_INCREMENT', alters))
    columns = []
    for line in definition.strip().splitlines():
        column = line.strip().rstrip(',')
        name = re.match(r'`(\w+)`', column).group(1)
        enum = re.search(r"enum\(([^)]+)\)", column)
        column = re.sub(r'enum\([^)]+\)', 'TEXT', column)
        column = re.sub(r'bigint\(\d+\) UNSIGNED', 'INTEGER', column)
        column = re.sub(r'(?:tinyint|int)\(\d+\)(?: UNSIGNED)?', 'INTEGER', column)
        column = re.sub(r'decimal\(\d+,\d+\)', 'NUMERIC', column)
        column = re.sub(r'varchar\(\d+\)|\btimestamp\b', 'TEXT', column)
        column = column.replace(' ON UPDATE current_timestamp()', '').replace('current_timestamp()', 'CURRENT_TIMESTAMP')
        if name == 'id' and auto_id:
            column = '`id` INTEGER PRIMARY KEY AUTOINCREMENT'
        if enum:
            column += ' CHECK (`' + name + '` IN (' + enum.group(1) + '))'
        columns.append(column)
    for primary in re.findall(r'ADD PRIMARY KEY (\([^)]+\))', alters):
        if not auto_id:
            columns.append('PRIMARY KEY ' + primary)
    for unique in re.findall(r'ADD UNIQUE KEY `[^`]+` (\([^)]+\))', alters):
        columns.append('UNIQUE ' + unique)
    for foreign in re.findall(r'FOREIGN KEY \([^)]+\) REFERENCES `[^`]+` \([^)]+\)(?: ON DELETE (?:CASCADE|SET NULL))?', alters):
        columns.append(foreign)
    statements.append('CREATE TABLE `' + table + '` (' + ',\n'.join(columns) + ');')

SCHEMA = '\n'.join(statements) + """
INSERT INTO identification_keys(id,name) VALUES (1,'Fixture key');
INSERT INTO workspaces(id,name) VALUES (1,'Canada'), (2,'USA');
INSERT INTO species(id,genus,specific_epithet) VALUES (1,'Testphora','alpha');
INSERT INTO workspace_species(workspace_id,species_id,display_order) VALUES (1,1,0), (2,1,0);
INSERT INTO characters(id,name,data_type,unit) VALUES (1,'Setae','categorical',NULL), (2,'Length','numeric_range','mm'), (3,'Color','categorical',NULL);
INSERT INTO character_states(id,character_id,name) VALUES (1,1,'Bare'), (2,1,'Setose'), (3,3,'Yellow');
INSERT INTO workspace_characters(workspace_id,character_id,display_order) VALUES (1,1,0), (1,2,1), (2,1,0);
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
