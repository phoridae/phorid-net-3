const express = require("express");
const router = express.Router();
const gbifPool = require("../dbGbif");
const requireAdmin = require("../middleware/requireAdmin");

const SORT_COLUMNS = {
  gbifId: "`gbifid`",
  snapshotDate: "`snapshot_date`",

  datasetKey: "`dataset_key`",
  publishingOrgKey: "`publishing_org_key`",
  occurrenceId: "`occurrence_id`",

  basisOfRecord: "`basis_of_record`",
  occurrenceStatus: "`occurrence_status`",
  sex: "`sex`",

  taxonKey: "`taxon_key`",
  speciesKey: "`species_key`",
  acceptedTaxonKey: "`accepted_taxon_key`",

  family: "`family`",
  genus: "`genus`",
  species: "`species`",
  genericName: "`generic_name`",
  specificEpithet: "`specific_epithet`",
  taxonRank: "`taxon_rank`",
  taxonomicStatus: "`taxonomic_status`",

  scientificName: "`scientific_name`",
  acceptedScientificName: "`accepted_scientific_name`",

  decimalLatitude: "`decimal_latitude`",
  decimalLongitude: "`decimal_longitude`",
  coordinateUncertaintyInMeters: "`coordinate_uncertainty_in_meters`",

  continent: "`continent`",
  countryCode: "`country_code`",
  country: "`country`",
  stateProvince: "`state_province`",

  year: "`year`",
  month: "`month`",
  day: "`day`",
  eventDate: "`event_date`",

  institutionCode: "`institution_code`",
  collectionCode: "`collection_code`",
  catalogNumber: "`catalog_number`",

  type: "`type`",
  typestatus: "`typestatus`",

  lastInterpreted: "`last_interpreted`",
  hasMedia: "`has_media`",
  importedAt: "`imported_at`",
  updatedAt: "`updated_at`",
};

const FILTER_COLUMNS = {
  snapshotDate: "`snapshot_date`",
  basisOfRecord: "`basis_of_record`",
  occurrenceStatus: "`occurrence_status`",
  sex: "`sex`",
  family: "`family`",
  genus: "`genus`",
  species: "`species`",
  specificEpithet: "`specific_epithet`",
  taxonRank: "`taxon_rank`",
  taxonomicStatus: "`taxonomic_status`",
  countryCode: "`country_code`",
  country: "`country`",
  stateProvince: "`state_province`",
  institutionCode: "`institution_code`",
  collectionCode: "`collection_code`",
  type: "`type`",
  hasMedia: "`has_media`",
};

function toArray(value) {
  if (value === undefined || value === null || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

function parsePositiveInt(value, fallback, max = null) {
  const parsed = parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  if (max !== null) {
    return Math.min(parsed, max);
  }

  return parsed;
}

function addLikeSearch(where, params, q) {
  if (!q) return;

  const searchableColumns = [
    "CAST(`gbifid` AS CHAR)",
    "`scientific_name`",
    "`accepted_scientific_name`",
    "`genus`",
    "`species`",
    "`specific_epithet`",
    "`catalog_number`",
    "`institution_code`",
    "`collection_code`",
    "`locality`",
    "`verbatim_locality`",
    "`recorded_by`",
    "`identified_by`",
    "`occurrence_id`",
  ];

  const like = `%${q}%`;

  where.push(
    `(${searchableColumns.map((column) => `${column} LIKE ?`).join(" OR ")})`
  );

  searchableColumns.forEach(() => params.push(like));
}

router.get("/occurrences", requireAdmin, async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const pageSize = parsePositiveInt(req.query.pageSize, 50, 250);
    const offset = (page - 1) * pageSize;

    const sortField = req.query.sortField || "gbifId";
    const sortOrder = req.query.sortOrder || "ascend";

    const sortColumn = SORT_COLUMNS[sortField] || SORT_COLUMNS.gbifId;
    const sortDirection = sortOrder === "descend" ? "DESC" : "ASC";

    const where = [];
    const params = [];

    const q = String(req.query.q || "").trim();
    addLikeSearch(where, params, q);

    for (const [queryKey, columnName] of Object.entries(FILTER_COLUMNS)) {
      const selectedValues = toArray(req.query[queryKey]).filter(
        (value) => value !== undefined && value !== null && value !== ""
      );

      if (selectedValues.length > 0) {
        const safeValues = selectedValues.slice(0, 100);
        const placeholders = safeValues.map(() => "?").join(", ");

        where.push(`${columnName} IN (${placeholders})`);
        params.push(...safeValues);
      }
    }

    if (req.query.hasCoordinates === "true") {
      where.push(
        "`decimal_latitude` IS NOT NULL AND `decimal_longitude` IS NOT NULL"
      );
    }

    if (req.query.hasCoordinates === "false") {
      where.push(
        "(`decimal_latitude` IS NULL OR `decimal_longitude` IS NULL)"
      );
    }

    if (req.query.minYear) {
      where.push("`year` >= ?");
      params.push(parseInt(req.query.minYear, 10));
    }

    if (req.query.maxYear) {
      where.push("`year` <= ?");
      params.push(parseInt(req.query.maxYear, 10));
    }

    if (req.query.hasMedia === "true") {
      where.push("`has_media` = 1");
    }

    if (req.query.hasMedia === "false") {
      where.push("(`has_media` = 0 OR `has_media` IS NULL)");
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const countSql = `
      SELECT COUNT(*) AS total
      FROM gbif_occurrence_phoridae
      ${whereSql}
    `;

    const dataSql = `
      SELECT
        gbifid AS gbifId,
        snapshot_date AS snapshotDate,

        dataset_key AS datasetKey,
        publishing_org_key AS publishingOrgKey,
        occurrence_id AS occurrenceId,

        basis_of_record AS basisOfRecord,
        occurrence_status AS occurrenceStatus,
        sex,

        taxon_key AS taxonKey,
        species_key AS speciesKey,
        accepted_taxon_key AS acceptedTaxonKey,

        kingdom,
        phylum,
        class_name AS className,
        order_name AS orderName,
        family,
        genus,
        species,

        generic_name AS genericName,
        specific_epithet AS specificEpithet,
        infraspecific_epithet AS infraspecificEpithet,

        taxon_rank AS taxonRank,
        taxonomic_status AS taxonomicStatus,

        scientific_name AS scientificName,
        scientific_name_authorship AS scientificNameAuthorship,
        accepted_scientific_name AS acceptedScientificName,

        decimal_latitude AS decimalLatitude,
        decimal_longitude AS decimalLongitude,
        coordinate_uncertainty_in_meters AS coordinateUncertaintyInMeters,
        coordinate_precision AS coordinatePrecision,
        geodetic_datum AS geodeticDatum,

        elevation,
        elevation_accuracy AS elevationAccuracy,
        verbatim_elevation AS verbatimElevation,

        continent,
        country_code AS countryCode,
        country,
        state_province AS stateProvince,
        higher_geography AS higherGeography,

        locality,
        verbatim_locality AS verbatimLocality,

        year,
        month,
        day,
        event_date AS eventDate,
        verbatim_event_date AS verbatimEventDate,
        start_day_of_year AS startDayOfYear,
        end_day_of_year AS endDayOfYear,

        recorded_by AS recordedBy,
        identified_by AS identifiedBy,
        sampling_protocol AS samplingProtocol,

        institution_code AS institutionCode,
        collection_code AS collectionCode,
        catalog_number AS catalogNumber,
        owner_institution_code AS ownerInstitutionCode,
        record_number AS recordNumber,

        type,
        typestatus,

        license,
        access_rights AS accessRights,
        language,

        establishment_means AS establishmentMeans,
        last_interpreted AS lastInterpreted,

        gbif_region AS gbifRegion,
        published_by_gbif_region AS publishedByGbifRegion,

        is_in_cluster AS isInCluster,
        has_media AS hasMedia,
        media_type AS mediaType,
        issue,

        imported_at AS importedAt,
        updated_at AS updatedAt
      FROM gbif_occurrence_phoridae
      ${whereSql}
      ORDER BY ${sortColumn} IS NULL ASC, ${sortColumn} ${sortDirection}
      LIMIT ?
      OFFSET ?
    `;

    const dataParams = [...params, pageSize, offset];

    const [[countRows], [dataRows]] = await Promise.all([
      gbifPool.query(countSql, params),
      gbifPool.query(dataSql, dataParams),
    ]);

    res.json({
      rows: dataRows,
      total: Number(countRows[0]?.total || 0),
      page,
      pageSize,
    });
  } catch (error) {
    console.error("Failed to query GBIF occurrence cache:", error);

    res.status(500).json({
      error: "Failed to query GBIF occurrence cache.",
      detail:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

router.get("/occurrences/facets", requireAdmin, async (req, res) => {
  try {
    const facetQuery = async (columnName, limit = 500) => {
      const sql = `
        SELECT ${columnName} AS value, COUNT(*) AS count
        FROM gbif_occurrence_phoridae
        WHERE ${columnName} IS NOT NULL AND ${columnName} <> ''
        GROUP BY ${columnName}
        ORDER BY count DESC, value ASC
        LIMIT ?
      `;

      const [rows] = await gbifPool.query(sql, [limit]);
      return rows;
    };

    const [
      snapshotDates,
      genera,
      countries,
      basisOfRecords,
      occurrenceStatuses,
      taxonomicStatuses,
      institutions,
      collections,
      typeStatuses,
    ] = await Promise.all([
      facetQuery("`snapshot_date`", 100),
      facetQuery("`genus`", 500),
      facetQuery("`country_code`", 300),
      facetQuery("`basis_of_record`", 100),
      facetQuery("`occurrence_status`", 100),
      facetQuery("`taxonomic_status`", 100),
      facetQuery("`institution_code`", 500),
      facetQuery("`collection_code`", 500),
      facetQuery("`typestatus`", 200),
    ]);

    res.json({
      snapshotDates,
      genera,
      countries,
      basisOfRecords,
      occurrenceStatuses,
      taxonomicStatuses,
      institutions,
      collections,
      typeStatuses,
    });
  } catch (error) {
    console.error("Failed to fetch GBIF occurrence facets:", error);

    res.status(500).json({
      error: "Failed to fetch GBIF occurrence facets.",
      detail:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

module.exports = router;