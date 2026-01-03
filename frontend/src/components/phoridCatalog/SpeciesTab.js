import React, { useEffect, useState } from "react";
import { Table, Spin, Tag } from "antd";
import { LinkOutlined } from "@ant-design/icons";

const GBIF_FAMILY_KEY = 9502; // Phoridae
const CACHE_KEY = "gbif_phoridae_species";
const PAGE_LIMIT = 1000;

const SpeciesTab = () => {
  const [loading, setLoading] = useState(false);
  const [species, setSpecies] = useState([]);
  const [statusFilters, setStatusFilters] = useState([]);
  const [genusFilters, setGenusFilters] = useState([]);

    const totalSpecies = species.length;
    const acceptedSpecies = species.filter(
        (s) => s.taxonomicStatus === "ACCEPTED"
    ).length;

    const uniqueGeneraCount = new Set(
    species.map((s) => s.genus).filter(Boolean)
    ).size;

  useEffect(() => {
    fetchSpecies();
  }, []);

  // Session cache: cleared when browser/tab closes
  const fetchSpecies = async () => {
    setLoading(true);

    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      setSpecies(parsed.data);
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

      // Build dynamic status filters
      const uniqueStatuses = Array.from(
        new Set(mapped.map((r) => r.taxonomicStatus).filter(Boolean))
      ).sort();

      const statusFilterItems = uniqueStatuses.map((status) => ({
        text: status,
        value: status,
      }));

      // Build dynamic genus filters
      const uniqueGenera = Array.from(
        new Set(mapped.map((r) => r.genus).filter(Boolean))
      ).sort();

      const genusFilterItems = uniqueGenera.map((genus) => ({
        text: genus,
        value: genus,
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
      setStatusFilters(statusFilterItems);
      setGenusFilters(genusFilterItems);
    } catch (err) {
      console.error("Failed to fetch species from GBIF", err);
    } finally {
      setLoading(false);
    }
  };

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

      <Table
        columns={columns}
        dataSource={species}
        rowKey="key"
        pagination={{
          pageSize: 100,
          showSizeChanger: false,
        }}
      />
    </>
  );
};

export default SpeciesTab;
