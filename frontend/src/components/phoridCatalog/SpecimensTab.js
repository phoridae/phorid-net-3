import React, { useState, useMemo } from "react";
import { Button, Select, Tag, Spin, Table, Progress } from "antd";
import { LinkOutlined } from "@ant-design/icons";
import generaData from "../../data/generaListDetails.json";
import countriesData from "../../data/countryCodes.json";
import institutions from "../../data/institutions.json";


const { Option } = Select;
const MAX_SPECIMENS = 10000;

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
          catalogNumber: r.catalogNumber,
          institutionCode: r.institutionCode,
          genus: r.genus,
          epithet:
            r.specificEpithet || ("sp."),
            // (r.scientificName ? r.scientificName.split(" ").slice(1, 2)[0] : null),
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
    { title: "Institution", dataIndex: "institutionCode", width: 120 },
    { title: "Catalog Number", dataIndex: "catalogNumber", width: 120 },
    { title: "Genus", dataIndex: "genus", width: 120 },

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
            {generaData.Genera.map((g) => (
              <Option key={g.key} value={g.key}>
                {g.canonicalName || g.scientificName}
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
            {institutions.institutions.map((i) => (
              <Option key={i.code} value={i.code}>
                {i.code}
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
            {countriesData.countries.map(c => (
              <Option key={c.code} value={c.code}>
                {c.name}
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
                  {MAX_SPECIMENS.toLocaleString()} specimens will be processed. <br></br>
                  If you need larger result sets, see the GBIF API documentation.
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