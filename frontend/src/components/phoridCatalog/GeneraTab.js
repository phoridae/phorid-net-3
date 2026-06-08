import React, { useEffect, useState } from "react";
import { Table, Spin, Tag } from "antd";
import { LinkOutlined } from "@ant-design/icons";
import generaData from "../../data/generaListDetails.json";

const GeneraTab = ({ onSelectGenus }) => {
  const [loading, setLoading] = useState(false);
  const [genera, setGenera] = useState([]);
  const [filteredGenera, setFilteredGenera] = useState([]);
  const [statusFilters, setStatusFilters] = useState([]);

  useEffect(() => {
    loadGenera();
  }, []);

  const loadGenera = () => {
    setLoading(true);

    try {
      const mapped = (generaData.Genera || [])
        .filter((r) => r.rank === "GENUS")
        .map((r) => ({
          key: r.key,
          genus: r.genus,
          authorship: r.authorship,
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

      setGenera(mapped);
      setFilteredGenera(mapped);
      setStatusFilters(statusFilterItems);
    } catch (err) {
      console.error("Failed to load genera JSON", err);
    } finally {
      setLoading(false);
    }
  };

  const handleTableChange = (_, __, ___, extra) => {
    setFilteredGenera(extra.currentDataSource);
  };

  /* ---------- SUMMARY (derived from filtered view) ---------- */
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
      sorter: (a, b) => (a.genus || "").localeCompare(b.genus || ""),
      width: 180,
    },
    {
      title: "Author / Year",
      dataIndex: "authorship",
      key: "authorship",
    },
    {
      title: "Status",
      dataIndex: "taxonomicStatus",
      filters: statusFilters,
      onFilter: (value, record) => record.taxonomicStatus === value,
      width: 160,
    },
    {
      title: "Published In",
      dataIndex: "publishedIn",
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
    },
  ];

  if (loading) return <Spin />;

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Tag color="blue">Data source: GBIF</Tag>
        <div style={{ marginTop: 4, color: "#666" }}>
          <div>Number of total genera showing: {totalGenera}</div>
          <div>Number of accepted genera showing: {acceptedGenera}</div>
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