import React, { useEffect, useState } from "react";
import { Table, Spin, Tag } from "antd";
import { LinkOutlined } from "@ant-design/icons";

const GBIF_FAMILY_KEY = 9502; // Phoridae
const CACHE_KEY = "gbif_phoridae_genera";

const GeneraTab = ({ onSelectGenus }) => {
  const [loading, setLoading] = useState(false);
  const [genera, setGenera] = useState([]);
  const [filteredGenera, setFilteredGenera] = useState([]);
  const [statusFilters, setStatusFilters] = useState([]);

  useEffect(() => {
    fetchGenera();
  }, []);

  const fetchGenera = async () => {
    setLoading(true);

    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      setGenera(parsed.data);
      setFilteredGenera(parsed.data); // IMPORTANT
      setStatusFilters(parsed.statusFilters);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(
        `https://api.gbif.org/v1/species/${GBIF_FAMILY_KEY}/children?limit=450`
      );
      const json = await res.json();

      const mapped = (json.results || [])
        .filter((r) => r.rank === "GENUS")
        .map((r) => ({
          key: r.key,
          genus: r.genus,
          scientificName: r.scientificName,
          taxonomicStatus: r.taxonomicStatus,
          publishedIn: r.publishedIn,
        }));

      const uniqueStatuses = Array.from(
        new Set(mapped.map((g) => g.taxonomicStatus).filter(Boolean))
      ).sort();

      const statusFilterItems = uniqueStatuses.map((status) => ({
        text: status,
        value: status,
      }));

      sessionStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          data: mapped,
          statusFilters: statusFilterItems,
        })
      );

      setGenera(mapped);
      setFilteredGenera(mapped);
      setStatusFilters(statusFilterItems);
    } catch (err) {
      console.error("Failed to fetch genera from GBIF", err);
    } finally {
      setLoading(false);
    }
  };

  const handleTableChange = (pagination, filters, sorter, extra) => {
    setFilteredGenera(extra.currentDataSource);
  };

  // ---- SUMMARY (derived from filtered view) ----
  const summarySource =
    filteredGenera.length > 0 ? filteredGenera : genera;

  const totalGenera = summarySource.length;

  const acceptedGenera = summarySource.filter(
    (g) => g.taxonomicStatus === "ACCEPTED"
  ).length;

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
    {
        title: "Species",
        key: "species",
        width: 140,
        render: (_, record) => (
            <a
                onClick={() => onSelectGenus(record.genus)}
                style={{ cursor: "pointer" }}
            >
            View species →
            </a>
        ),
        }
  ];

  if (loading) return <Spin />;

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Tag color="blue">Data source: GBIF</Tag>
        <div style={{ marginTop: 4, color: "#666" }}>
          <div>Number of genera: {totalGenera}</div>
          <div>Number of accepted genera: {acceptedGenera}</div>
        </div>
      </div>

      <Table
        columns={columns}
        dataSource={genera}
        rowKey="key"
        onChange={handleTableChange}
        pagination={{
          pageSize: 50,
          showSizeChanger: false,
        }}
      />
    </>
  );
};

export default GeneraTab;
