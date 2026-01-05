import React, { useState, useMemo } from "react";
import { Button, Select, Tag, Spin, Table, Progress } from "antd";
import { LinkOutlined } from "@ant-design/icons";


const { Option } = Select;
const MAX_SPECIMENS = 10000;


/* ---------- COUNTRY CODE → NAME MAP ---------- */
const COUNTRIES = {
  AF: "Afghanistan",
  AX: "Åland Islands",
  AL: "Albania",
  DZ: "Algeria",
  AS: "American Samoa",
  AD: "Andorra",
  AO: "Angola",
  AI: "Anguilla",
  AQ: "Antarctica",
  AG: "Antigua and Barbuda",
  AR: "Argentina",
  AM: "Armenia",
  AW: "Aruba",
  AU: "Australia",
  AT: "Austria",
  AZ: "Azerbaijan",
  BS: "Bahamas",
  BH: "Bahrain",
  BD: "Bangladesh",
  BB: "Barbados",
  BY: "Belarus",
  BE: "Belgium",
  BZ: "Belize",
  BJ: "Benin",
  BM: "Bermuda",
  BT: "Bhutan",
  BO: "Bolivia",
  BQ: "Bonaire, Sint Eustatius and Saba",
  BA: "Bosnia and Herzegovina",
  BW: "Botswana",
  BV: "Bouvet Island",
  BR: "Brazil",
  IO: "British Indian Ocean Territory",
  BN: "Brunei",
  BG: "Bulgaria",
  BF: "Burkina Faso",
  BI: "Burundi",
  KH: "Cambodia",
  CM: "Cameroon",
  CA: "Canada",
  CV: "Cape Verde",
  KY: "Cayman Islands",
  CF: "Central African Republic",
  TD: "Chad",
  CL: "Chile",
  CN: "China",
  CX: "Christmas Island",
  CC: "Cocos (Keeling) Islands",
  CO: "Colombia",
  KM: "Comoros",
  CD: "Congo (DRC)",
  CG: "Congo",
  CK: "Cook Islands",
  CR: "Costa Rica",
  CI: "Côte d’Ivoire",
  HR: "Croatia",
  CU: "Cuba",
  CW: "Curaçao",
  CY: "Cyprus",
  CZ: "Czechia",
  DK: "Denmark",
  DJ: "Djibouti",
  DM: "Dominica",
  DO: "Dominican Republic",
  EC: "Ecuador",
  EG: "Egypt",
  SV: "El Salvador",
  GQ: "Equatorial Guinea",
  ER: "Eritrea",
  EE: "Estonia",
  ET: "Ethiopia",
  FK: "Falkland Islands",
  FO: "Faroe Islands",
  FJ: "Fiji",
  FI: "Finland",
  FR: "France",
  GF: "French Guiana",
  PF: "French Polynesia",
  TF: "French Southern Territories",
  GA: "Gabon",
  GM: "Gambia",
  GE: "Georgia",
  DE: "Germany",
  GH: "Ghana",
  GI: "Gibraltar",
  GR: "Greece",
  GL: "Greenland",
  GD: "Grenada",
  GP: "Guadeloupe",
  GU: "Guam",
  GT: "Guatemala",
  GG: "Guernsey",
  GN: "Guinea",
  GW: "Guinea-Bissau",
  GY: "Guyana",
  HT: "Haiti",
  HM: "Heard Island and McDonald Islands",
  VA: "Vatican City",
  HN: "Honduras",
  HK: "Hong Kong",
  HU: "Hungary",
  IS: "Iceland",
  IN: "India",
  ID: "Indonesia",
  IR: "Iran",
  IQ: "Iraq",
  IE: "Ireland",
  IM: "Isle of Man",
  IL: "Israel",
  IT: "Italy",
  JM: "Jamaica",
  JP: "Japan",
  JE: "Jersey",
  JO: "Jordan",
  KZ: "Kazakhstan",
  KE: "Kenya",
  KI: "Kiribati",
  KP: "North Korea",
  KR: "South Korea",
  KW: "Kuwait",
  KG: "Kyrgyzstan",
  LA: "Laos",
  LV: "Latvia",
  LB: "Lebanon",
  LS: "Lesotho",
  LR: "Liberia",
  LY: "Libya",
  LI: "Liechtenstein",
  LT: "Lithuania",
  LU: "Luxembourg",
  MO: "Macau",
  MK: "North Macedonia",
  MG: "Madagascar",
  MW: "Malawi",
  MY: "Malaysia",
  MV: "Maldives",
  ML: "Mali",
  MT: "Malta",
  MH: "Marshall Islands",
  MQ: "Martinique",
  MR: "Mauritania",
  MU: "Mauritius",
  YT: "Mayotte",
  MX: "Mexico",
  FM: "Micronesia",
  MD: "Moldova",
  MC: "Monaco",
  MN: "Mongolia",
  ME: "Montenegro",
  MS: "Montserrat",
  MA: "Morocco",
  MZ: "Mozambique",
  MM: "Myanmar",
  NA: "Namibia",
  NR: "Nauru",
  NP: "Nepal",
  NL: "Netherlands",
  NC: "New Caledonia",
  NZ: "New Zealand",
  NI: "Nicaragua",
  NE: "Niger",
  NG: "Nigeria",
  NU: "Niue",
  NF: "Norfolk Island",
  MP: "Northern Mariana Islands",
  NO: "Norway",
  OM: "Oman",
  PK: "Pakistan",
  PW: "Palau",
  PS: "Palestine",
  PA: "Panama",
  PG: "Papua New Guinea",
  PY: "Paraguay",
  PE: "Peru",
  PH: "Philippines",
  PN: "Pitcairn Islands",
  PL: "Poland",
  PT: "Portugal",
  PR: "Puerto Rico",
  QA: "Qatar",
  RE: "Réunion",
  RO: "Romania",
  RU: "Russia",
  RW: "Rwanda",
  BL: "Saint Barthélemy",
  SH: "Saint Helena",
  KN: "Saint Kitts and Nevis",
  LC: "Saint Lucia",
  MF: "Saint Martin",
  PM: "Saint Pierre and Miquelon",
  VC: "Saint Vincent and the Grenadines",
  WS: "Samoa",
  SM: "San Marino",
  ST: "São Tomé and Príncipe",
  SA: "Saudi Arabia",
  SN: "Senegal",
  RS: "Serbia",
  SC: "Seychelles",
  SL: "Sierra Leone",
  SG: "Singapore",
  SX: "Sint Maarten",
  SK: "Slovakia",
  SI: "Slovenia",
  SB: "Solomon Islands",
  SO: "Somalia",
  ZA: "South Africa",
  GS: "South Georgia and the South Sandwich Islands",
  SS: "South Sudan",
  ES: "Spain",
  LK: "Sri Lanka",
  SD: "Sudan",
  SR: "Suriname",
  SJ: "Svalbard and Jan Mayen",
  SZ: "Eswatini",
  SE: "Sweden",
  CH: "Switzerland",
  SY: "Syria",
  TW: "Taiwan",
  TJ: "Tajikistan",
  TZ: "Tanzania",
  TH: "Thailand",
  TL: "Timor-Leste",
  TG: "Togo",
  TK: "Tokelau",
  TO: "Tonga",
  TT: "Trinidad and Tobago",
  TN: "Tunisia",
  TR: "Turkey",
  TM: "Turkmenistan",
  TC: "Turks and Caicos Islands",
  TV: "Tuvalu",
  UG: "Uganda",
  UA: "Ukraine",
  AE: "United Arab Emirates",
  GB: "United Kingdom",
  US: "United States",
  UM: "U.S. Minor Outlying Islands",
  UY: "Uruguay",
  UZ: "Uzbekistan",
  VU: "Vanuatu",
  VE: "Venezuela",
  VN: "Vietnam",
  VG: "British Virgin Islands",
  VI: "U.S. Virgin Islands",
  WF: "Wallis and Futuna",
  EH: "Western Sahara",
  YE: "Yemen",
  ZM: "Zambia",
  ZW: "Zimbabwe",
  AA: "Unknown (AA)",
  XK: "Kosovo",
  XZ: "Unknown (XZ)",
  ZZ: "Unknown (ZZ)",
};

/* ---------- STATIC FILTER OPTIONS ---------- */
const GENERA = [
  { key: 1549256, genus: "Abaristophora" },
  { key: 1545214, genus: "Acanthophorides" },
  { key: 1549774, genus: "Achaetophora" },
  { key: 1546306, genus: "Acontistoptera" },
  { key: 1550236, genus: "Adelopteromyia" },
  { key: 1546232, genus: "Adenophora" },
  { key: 1550314, genus: "Aemulophora" },
  { key: 1546157, genus: "Aenictacantha" },
  { key: 1549469, genus: "Aenictomyia" },
  { key: 1549974, genus: "Aenigmaphora" },
  { key: 1545107, genus: "Aenigmatias" },
  { key: 1548826, genus: "Aenigmatistes" },
  { key: 1546338, genus: "Aenigmatopoeus" },
  { key: 1546193, genus: "Agaphora" },
  { key: 1546237, genus: "Alamira" },
  { key: 1549963, genus: "Allochaeta" },
  { key: 1546121, genus: "Anaclinusa" },
  { key: 1545908, genus: "Anevrina" },
  { key: 1549792, genus: "Anticofimbria" },
  { key: 4789666, genus: "Antipodiphora" },
  { key: 1545065, genus: "Aphiochaeta" },
  { key: 1549162, genus: "Aphiura" },
  { key: 1545388, genus: "Apocephalus" },
  { key: 1545332, genus: "Apodicrania" },
  { key: 1549151, genus: "Apopteromyia" },
  { key: 1548818, genus: "Apterella" },
  { key: 4789622, genus: "Apteronilla" },
  { key: 1549741, genus: "Apteronina" },
  { key: 1550224, genus: "Apterophora" },
  { key: 1545824, genus: "Aptinandria" },
  { key: 1550257, genus: "Arabiphora" },
  { key: 6006904, genus: "Archiphora" },
  { key: 4789580, genus: "Archisciada" },
  { key: 1550183, genus: "Aristocerina" },
  { key: 3264304, genus: "Aristopsis" },
  { key: 1545995, genus: "Arrenaptenus" },
  { key: 1546051, genus: "Assmutherium" },
  { key: 1545743, genus: "Attamyia" },
  { key: 11517389, genus: "Aurisetiphora" },
  { key: 1545721, genus: "Auxanommatidia" },
  { key: 1548649, genus: "Bactropalpus" },
  { key: 1545086, genus: "Beckerina" },
  { key: 4794850, genus: "Beyermyia" },
  { key: 1545383, genus: "Billotia" },
  { key: 1550196, genus: "Bolsiusia" },
  { key: 4795155, genus: "Borgmeieria" },
  { key: 1545813, genus: "Borgmeieriphora" },
  { key: 1549329, genus: "Borophaga" },
  { key: 1546360, genus: "Bothroprosopa" },
  { key: 1546132, genus: "Brachycephaloptera" },
  { key: 1546173, genus: "Brachycosta" },
  { key: 1545777, genus: "Brachyphlebina" },
  { key: 1546324, genus: "Brachyselia" },
  { key: 1549807, genus: "Brevrostrophora" },
  { key: 1546123, genus: "Brownphora" },
  { key: 1545941, genus: "Burmophora" },
  { key: 1549825, genus: "Byrsophrys" },
  { key: 1549402, genus: "Calamiscus" },
  { key: 9489229, genus: "Caledophora" },
  { key: 1549425, genus: "Capraephora" },
  { key: 1546165, genus: "Cataclinusa" },
  { key: 1546115, genus: "Ceratoconus" },
  { key: 1546206, genus: "Ceratophoromyia" },
  { key: 7236508, genus: "Ceratoplatus" },
  { key: 1549426, genus: "Ceratusa" },
  { key: 1549569, genus: "Ceylonoxenia" },
  { key: 1545211, genus: "Chaetaspidia" },
  { key: 4789630, genus: "Chaetocnemistoptera" },
  { key: 1549149, genus: "Chaetogodavaria" },
  { key: 1545343, genus: "Chaetopleurophora" },
  { key: 1545324, genus: "Cheiloxenia" },
  { key: 1546280, genus: "Chelidophora" },
  { key: 1545134, genus: "Chonocephalus" },
  { key: 1546214, genus: "Clitelloxenia" },
  { key: 1546349, genus: "Commoptera" },
  { key: 1546004, genus: "Conicera" },
  { key: 1545951, genus: "Coniceromyia" },
  { key: 1549454, genus: "Contopteryx" },
  { key: 1545372, genus: "Coridophora" },
  { key: 1546413, genus: "Megaselia" },
  { key: 4575472, genus: "Myriophora" },
  { key: 1548850, genus: "Dohrniphora" },
  { key: 1549881, genus: "Phalacrotophora" },
  { key: 1549173, genus: "Pseudacteon" },
  { key: 1487293, genus: "Phora" },
  { key: 1548658, genus: "Puliciphora" },
  { key: 1549828, genus: "Rhopica" },
  { key: 7584460, genus: "Spiniphora" },
  { key: 1549589, genus: "Triphleba" },
  { key: 1545052, genus: "Veruanus" },
  { key: 1549766, genus: "Wandolleckia" },
  { key: 1549840, genus: "Xanionotum" },
  { key: 1550250, genus: "Zikania" },
];

const INSTITUTIONS = ["LACM", "NMNHUK", "AMNH", "NMSA"];

const SpecimensPage = () => {
  const [filters, setFilters] = useState({
    genus: null,
    institution: null,
    country: null,
  });

  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [tested, setTested] = useState(false);
  const [count, setCount] = useState(null);

  const [records, setRecords] = useState([]);
  const [progress, setProgress] = useState({
    fetched: 0,
    total: 0,
  });

  /* ---------- TEST QUERY ---------- */
  const testQuery = async () => {
    setLoading(true);
    setTested(false);
    setCount(null);

    const params = new URLSearchParams({ limit: "1" });
    if (filters.genus) params.append("taxonKey", filters.genus);
    if (filters.institution) params.append("institutionCode", filters.institution);
    if (filters.country) params.append("country", filters.country);

    try {
      const res = await fetch(
        `https://api.gbif.org/v1/occurrence/search?${params.toString()}`
      );
      const json = await res.json();
      setCount(json.count);
      setTested(true);
    } catch (err) {
      console.error("GBIF test query failed", err);
    } finally {
      setLoading(false);
    }
  };

  /* ---------- PROCESS FULL QUERY ---------- */
  const processQuery = async () => {
    setProcessing(true);
    setRecords([]);
    setProgress({ fetched: 0, total: count });

    const paramsBase = new URLSearchParams();
    if (filters.genus) paramsBase.append("taxonKey", filters.genus);
    if (filters.institution)
      paramsBase.append("institutionCode", filters.institution);
    if (filters.country) paramsBase.append("country", filters.country);

    const LIMIT = 300;
    const HARD_LIMIT = Math.min(count, MAX_SPECIMENS);

    let offset = 0;
    let all = [];
    let endOfRecords = false;

    try {
      while (!endOfRecords && all.length < HARD_LIMIT) {
        const params = new URLSearchParams(paramsBase);
        params.append("limit", LIMIT);
        params.append("offset", offset);

        const res = await fetch(
          `https://api.gbif.org/v1/occurrence/search?${params.toString()}`
        );
        const json = await res.json();

        const batch = (json.results || []).map((r) => ({
          key: r.key,
          gbifId: r.key,
          taxonKey: r.taxonKey,
          institutionCode: r.institutionCode,
          species: r.scientificName,
          epithet:
            r.specificEpithet ||
            (r.scientificName ? r.scientificName.split(" ").slice(1, 2)[0] : null),
          country: r.country,
          eventDate: r.eventDate,
          locality: r.locality,
        }));

        all = all.concat(batch).slice(0, HARD_LIMIT);

        setProgress({
          fetched: all.length,
          total: HARD_LIMIT,
        });
      }

      setRecords(all);
    } catch (err) {
      console.error("GBIF occurrence fetch failed", err);
    } finally {
      setProcessing(false);
    }
  };

  const canProcess = tested && count !== null;

  const epithetFilters = useMemo(() => {
    return Array.from(
      new Set(
        records
          .map((r) => r.epithet)
          .filter((e) => typeof e === "string" && e.trim() !== "")
          .map((e) => e.toLowerCase())
      )
    )
      .sort()
      .map((e) => ({
        text: e,
        value: e,
      }));
  }, [records]);

  /* ---------- TABLE COLUMNS ---------- */
  const columns = [
    {
      title: "GBIF ID",
      dataIndex: "gbifId",
      width: 140,
      render: (v) => (
        <a
          href={`https://www.gbif.org/occurrence/${v}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {v} <LinkOutlined />
        </a>
      ),
    },
    { title: "Taxon Key", dataIndex: "taxonKey", width: 120 },
    { title: "Institution", dataIndex: "institutionCode", width: 120 },
    { title: "Species", dataIndex: "species", width: 120 },

    {
      title: "Specific Epithet",
      dataIndex: "epithet",
      key: "epithet",
      width: 220,

      sorter: (a, b) =>
        (a.epithet || "").localeCompare(b.epithet || "", undefined, {
          sensitivity: "base",
        }),

      filters: epithetFilters,

      onFilter: (value, record) =>
        (record.epithet || "").toLowerCase() === value,

      render: (v) => v || <span style={{ color: "#999" }}>—</span>,
    },


    { title: "Country", dataIndex: "country", width: 120 },
    { title: "Event Date", dataIndex: "eventDate", width: 160 },
    { title: "Locality", dataIndex: "locality", ellipsis: true },
  ];

  return (
    <>
      {/* ---------- QUERY BUILDER ---------- */}
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
          padding: "48px 24px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "center",
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          <Select
            placeholder="Genus"
            style={{ width: 180 }}
            allowClear
            showSearch
            optionFilterProp="children"
            filterOption={(input, option) =>
              option.children
                .toLowerCase()
                .includes(input.toLowerCase())
            }
            onChange={(v) => setFilters((f) => ({ ...f, genus: v }))}
          >
            {GENERA.map((g) => (
              <Option key={g.key} value={g.key}>
                {g.genus}
              </Option>
            ))}
          </Select>
          <Select
            placeholder="Institution"
            style={{ width: 200 }}
            allowClear
            showSearch
            onChange={(v) => setFilters((f) => ({ ...f, institution: v }))}
          >
            {INSTITUTIONS.map((i) => (
              <Option key={i} value={i}>
                {i}
              </Option>
            ))}
          </Select>

          <Select
            placeholder="Country"
            style={{ width: 240 }}
            allowClear
            showSearch
            optionFilterProp="children"
            onChange={(v) => setFilters((f) => ({ ...f, country: v }))}
          >
            {Object.entries(COUNTRIES).map(([code, name]) => (
              <Option key={code} value={code}>
                {name}
              </Option>
            ))}
          </Select>
        </div>

        <Button type="primary" onClick={testQuery}>
          Test Query
        </Button>

        <div style={{ marginTop: 24 }}>
          {loading && <Spin />}

          {tested && count !== null && (
            <>
              <div style={{ marginBottom: 8 }}>
                Matching specimens:{" "}
                <strong>{count.toLocaleString()}</strong>
              </div>

              {count > MAX_SPECIMENS && (
                <div style={{ color: "#d48806" }}>
                  Results exceed the display limit. Only the first{" "}
                  {MAX_SPECIMENS.toLocaleString()} specimens will be processed.
                </div>
              )}

              {count <= MAX_SPECIMENS && (
                <div style={{ color: "#3f8600" }}>
                  Query size is within the display limit.
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ marginTop: 24 }}>
          <Button
            type="primary"
            disabled={!canProcess || processing}
            onClick={processQuery}
          >
            {processing ? "Processing…" : "Process Query"}
          </Button>
        </div>

        {processing && (
          <div style={{ marginTop: 24 }}>
            <Progress
              percent={Math.min(
                Math.round((progress.fetched / progress.total) * 100),
                100
              )}
            />
            <div style={{ marginTop: 8 }}>
              Fetched {progress.fetched.toLocaleString()} of{" "}
              {progress.total.toLocaleString()}
            </div>
          </div>
        )}
      </div>

         {/* ---------- Badge and summary ---------- */}
      <div style={{ padding: "0 24px", marginBottom: 24 }}>
        <Tag color="blue">Data source: GBIF</Tag>
      </div>

      {/* ---------- RESULTS TABLE ---------- */}
      {records.length > 0 && (
        <div style={{ padding: "24px" }}>
          <Table
            columns={columns}
            dataSource={records}
            pagination={{ pageSize: 50, showSizeChanger: false }}
            scroll={{ x: 1100 }}
          />
        </div>
      )}

    </>
  );
};

export default SpecimensPage;