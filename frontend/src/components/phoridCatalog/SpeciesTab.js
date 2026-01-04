import React, { useEffect, useState } from "react";
import { Table, Spin, Tag } from "antd";
import { LinkOutlined } from "@ant-design/icons";

const GBIF_FAMILY_KEY = 9502; // Phoridae
const CACHE_KEY = "gbif_phoridae_species";
const PAGE_LIMIT = 1000;

const SpeciesTab = ({ selectedGenus }) => {
  const [loading, setLoading] = useState(false);
  const [species, setSpecies] = useState([]);
  const [filteredSpecies, setFilteredSpecies] = useState([]);
  const [statusFilters, setStatusFilters] = useState([]);
  const [genusFilters, setGenusFilters] = useState([]);
  const [activeGenusFilters, setActiveGenusFilters] = useState([]);

  // -------- Fetch once (cache-aware) --------
  useEffect(() => {
    fetchSpecies();
  }, []);

  // -------- Sync genus from Genera tab --------
  useEffect(() => {
    if (selectedGenus) {
      setActiveGenusFilters([selectedGenus]);
    }
  }, [selectedGenus]);

    useEffect(() => {
        if (activeGenusFilters.length > 0) {
            const filtered = species.filter((s) =>
            activeGenusFilters.includes(s.genus)
            );
            setFilteredSpecies(filtered);
        } else {
            setFilteredSpecies(species);
        }
    }, [activeGenusFilters, species]);


  // -------- Fetch species --------
  const fetchSpecies = async () => {
    setLoading(true);

    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      setSpecies(parsed.data);
      setFilteredSpecies(parsed.data);
      setStatusFilters(parsed.statusFilters);
      setGenusFilters(parsed.genusFilters);
      setLoading(false);
      return;
    }

    try {
      let allResults = [];
      let offset = 0;
      let endOfRecords = false;

      while (!endOfRecords) {
        const res = await fetch(
          `https://api.gbif.org/v1/species/search` +
            `?higherTaxonKey=${GBIF_FAMILY_KEY}` +
            `&rank=SPECIES` +
            `&limit=${PAGE_LIMIT}` +
            `&offset=${offset}`
        );

        const json = await res.json();
        allResults = allResults.concat(json.results || []);
        endOfRecords = json.endOfRecords;
        offset += PAGE_LIMIT;
      }

      const mapped = allResults.map((r) => ({
        key: r.key,
        genus: r.genus,
        scientificName: r.scientificName,
        taxonomicStatus: r.taxonomicStatus,
        publishedIn: r.publishedIn,
      }));

      const uniqueStatuses = Array.from(
        new Set(mapped.map((r) => r.taxonomicStatus).filter(Boolean))
      ).sort();

      const uniqueGenera = Array.from(
        new Set(mapped.map((r) => r.genus).filter(Boolean))
      ).sort();

      const statusFilterItems = uniqueStatuses.map((s) => ({
        text: s,
        value: s,
      }));

      const genusFilterItems = uniqueGenera.map((g) => ({
        text: g,
        value: g,
      }));

      sessionStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          data: mapped,
          statusFilters: statusFilterItems,
          genusFilters: genusFilterItems,
        })
      );

      setSpecies(mapped);
      setFilteredSpecies(mapped);
      setStatusFilters(statusFilterItems);
      setGenusFilters(genusFilterItems);
    } catch (err) {
      console.error("Failed to fetch species from GBIF", err);
    } finally {
      setLoading(false);
    }
  };

  // -------- Table change handler --------
  const handleTableChange = (pagination, filters, sorter, extra) => {
    setFilteredSpecies(extra.currentDataSource);

    if (filters.genus && filters.genus.length > 0) {
      setActiveGenusFilters(filters.genus);
    } else {
      setActiveGenusFilters([]);
    }
  };

  // -------- Summary (always reflects table state) --------
  const summarySource =
    filteredSpecies.length > 0 ? filteredSpecies : species;

  const totalSpecies = summarySource.length;

  const acceptedSpecies = summarySource.filter(
    (s) => s.taxonomicStatus === "ACCEPTED"
  ).length;

  const uniqueGeneraCount = new Set(
    summarySource.map((s) => s.genus).filter(Boolean)
  ).size;

  // -------- Columns --------
  const columns = [
    {
      title: "GBIF Key",
      dataIndex: "key",
      key: "key",
      width: 140,
      render: (value) => (
        <a
          href={`https://www.gbif.org/species/${value}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {value} <LinkOutlined />
        </a>
      ),
    },
    {
      title: "Genus",
      dataIndex: "genus",
      key: "genus",
      filters: genusFilters,
      filteredValue:
        activeGenusFilters.length > 0 ? activeGenusFilters : null,
      onFilter: (value, record) => record.genus === value,
      sorter: (a, b) => (a.genus || "").localeCompare(b.genus || ""),
      width: 180,
    },
    {
      title: "Scientific Name",
      dataIndex: "scientificName",
      key: "scientificName",
    },
    {
      title: "Status",
      dataIndex: "taxonomicStatus",
      key: "taxonomicStatus",
      filters: statusFilters,
      onFilter: (value, record) => record.taxonomicStatus === value,
      width: 160,
    },
    {
      title: "Published In",
      dataIndex: "publishedIn",
      key: "publishedIn",
      ellipsis: true,
    },
  ];

  if (loading) return <Spin />;

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Tag color="blue">Data source: GBIF</Tag>
        <div style={{ marginTop: 4, color: "#666" }}>
          <div>Number of genera: {uniqueGeneraCount}</div>
          <div>Number of species: {totalSpecies}</div>
          <div>Number of accepted species: {acceptedSpecies}</div>
        </div>
      </div>

      {activeGenusFilters.length > 0 && (
        <div style={{ marginBottom: 8, color: "#666" }}>
          Filtered to genus:{" "}
          <strong>{activeGenusFilters.join(", ")}</strong>
        </div>
      )}

      <Table
        columns={columns}
        dataSource={species}
        rowKey="key"
        onChange={handleTableChange}
        pagination={{
          pageSize: 100,
          showSizeChanger: false,
        }}
      />
    </>
  );
};

export default SpeciesTab;
