CREATE TABLE IF NOT EXISTS gbif_import_run (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,

  snapshot_date DATE NOT NULL,
  source_uri TEXT NOT NULL,

  filter_family VARCHAR(255) NOT NULL DEFAULT 'Phoridae',
  filter_genus VARCHAR(255) NULL,
  row_limit INT NULL,

  mode VARCHAR(64) NOT NULL DEFAULT 'production',
  status VARCHAR(64) NOT NULL DEFAULT 'started',

  record_count BIGINT UNSIGNED NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,

  error_message TEXT NULL,
  notes TEXT NULL,

  INDEX idx_snapshot_date (snapshot_date),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;


CREATE TABLE IF NOT EXISTS gbif_import_file (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,

  import_run_id BIGINT UNSIGNED NULL,
  snapshot_date DATE NOT NULL,

  file_key VARCHAR(64) NOT NULL,
  file_uri TEXT NOT NULL,

  status VARCHAR(64) NOT NULL DEFAULT 'pending',
  attempt_count INT NOT NULL DEFAULT 0,
  extracted_count BIGINT UNSIGNED NULL,

  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  error_message TEXT NULL,

  UNIQUE KEY uniq_snapshot_file (snapshot_date, file_key),
  INDEX idx_snapshot_status (snapshot_date, status),
  INDEX idx_status (status),

  CONSTRAINT fk_gbif_import_file_run
    FOREIGN KEY (import_run_id)
    REFERENCES gbif_import_run(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;


CREATE TABLE IF NOT EXISTS gbif_occurrence_phoridae (
  gbifid BIGINT UNSIGNED NOT NULL PRIMARY KEY,

  snapshot_date DATE NOT NULL,

  dataset_key CHAR(36) NULL,
  publishing_org_key CHAR(36) NULL,
  occurrence_id VARCHAR(512) NULL,

  basis_of_record VARCHAR(128) NULL,
  occurrence_status VARCHAR(128) NULL,
  sex VARCHAR(64) NULL,

  taxon_key BIGINT UNSIGNED NULL,
  species_key BIGINT UNSIGNED NULL,
  accepted_taxon_key BIGINT UNSIGNED NULL,

  kingdom VARCHAR(128) NULL,
  phylum VARCHAR(128) NULL,
  class_name VARCHAR(128) NULL,
  order_name VARCHAR(128) NULL,
  family VARCHAR(128) NULL,
  genus VARCHAR(255) NULL,
  species VARCHAR(512) NULL,

  generic_name VARCHAR(255) NULL,
  specific_epithet VARCHAR(255) NULL,
  infraspecific_epithet VARCHAR(255) NULL,

  taxon_rank VARCHAR(128) NULL,
  taxonomic_status VARCHAR(128) NULL,

  scientific_name VARCHAR(512) NULL,
  scientific_name_authorship VARCHAR(255) NULL,
  accepted_scientific_name VARCHAR(512) NULL,

  decimal_latitude DOUBLE NULL,
  decimal_longitude DOUBLE NULL,
  coordinate_uncertainty_in_meters DOUBLE NULL,
  coordinate_precision DOUBLE NULL,
  geodetic_datum VARCHAR(64) NULL,

  elevation DOUBLE NULL,
  elevation_accuracy DOUBLE NULL,
  verbatim_elevation VARCHAR(128) NULL,

  continent VARCHAR(128) NULL,
  country_code VARCHAR(16) NULL,
  country VARCHAR(255) NULL,
  state_province VARCHAR(255) NULL,
  higher_geography VARCHAR(512) NULL,

  locality TEXT NULL,
  verbatim_locality TEXT NULL,

  year INT NULL,
  month INT NULL,
  day INT NULL,
  event_date VARCHAR(128) NULL,
  verbatim_event_date VARCHAR(255) NULL,
  start_day_of_year INT NULL,
  end_day_of_year INT NULL,

  recorded_by TEXT NULL,
  identified_by TEXT NULL,
  sampling_protocol VARCHAR(255) NULL,

  institution_code VARCHAR(255) NULL,
  collection_code VARCHAR(255) NULL,
  catalog_number VARCHAR(255) NULL,
  owner_institution_code VARCHAR(255) NULL,
  record_number VARCHAR(255) NULL,

  type VARCHAR(128) NULL,
  typestatus TEXT NULL,

  license TEXT NULL,
  access_rights TEXT NULL,
  language VARCHAR(64) NULL,

  establishment_means VARCHAR(255) NULL,
  last_interpreted DATETIME NULL,

  gbif_region VARCHAR(128) NULL,
  published_by_gbif_region VARCHAR(128) NULL,

  is_in_cluster TINYINT(1) NULL,
  has_media TINYINT(1) NULL,
  media_type TEXT NULL,
  issue TEXT NULL,

  imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_snapshot_date (snapshot_date),
  INDEX idx_family_genus (family, genus),
  INDEX idx_genus (genus),
  INDEX idx_species_key (species_key),
  INDEX idx_taxon_key (taxon_key),
  INDEX idx_scientific_name (scientific_name),
  INDEX idx_country_year (country_code, year),
  INDEX idx_coordinates (decimal_latitude, decimal_longitude),
  INDEX idx_catalog (institution_code, collection_code, catalog_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;