import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  ArrowLeftOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import { API_BASE } from "../utils/api/config";

const { Title, Text } = Typography;

const API_ROOT = API_BASE || process.env.REACT_APP_API_ROOT || "";

function facetOptions(items = []) {
  return items.map((item) => ({
    text: `${item.value} (${Number(item.count || 0).toLocaleString()})`,
    value: String(item.value),
  }));
}

function formatDateTime(value) {
  if (!value) return "";
  return String(value).replace("T", " ").replace(".000Z", "");
}

export default function GbifCache() {
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [facetsLoading, setFacetsLoading] = useState(false);
  const [error, setError] = useState("");

  const [facets, setFacets] = useState({
    snapshotDates: [],
    genera: [],
    countries: [],
    basisOfRecords: [],
    occurrenceStatuses: [],
    taxonomicStatuses: [],
    institutions: [],
    collections: [],
    typeStatuses: [],
  });

  const [searchText, setSearchText] = useState("");
  const [activeSearchText, setActiveSearchText] = useState("");

  const [hasCoordinates, setHasCoordinates] = useState("");
  const [hasMedia, setHasMedia] = useState("");
  const [minYear, setMinYear] = useState(null);
  const [maxYear, setMaxYear] = useState(null);

  const [tableState, setTableState] = useState({
    pagination: {
      current: 1,
      pageSize: 50,
    },
    filters: {},
    sorter: {
      field: "gbifId",
      order: "ascend",
    },
  });

  async function getAuthHeaders() {
    const user = auth.currentUser;

    if (!user) {
      throw new Error("You must be signed in.");
    }

    const token = await user.getIdToken();

    return {
      Authorization: `Bearer ${token}`,
    };
  }

  async function fetchFacets() {
    setFacetsLoading(true);

    try {
      const headers = await getAuthHeaders();

      const response = await fetch(
        `${API_ROOT}/api/admin/gbif/occurrences/facets`,
        { headers }
      );

      if (!response.ok) {
        throw new Error(`Facet request failed: HTTP ${response.status}`);
      }

      const data = await response.json();

      setFacets({
        snapshotDates: data.snapshotDates || [],
        genera: data.genera || [],
        countries: data.countries || [],
        basisOfRecords: data.basisOfRecords || [],
        occurrenceStatuses: data.occurrenceStatuses || [],
        taxonomicStatuses: data.taxonomicStatuses || [],
        institutions: data.institutions || [],
        collections: data.collections || [],
        typeStatuses: data.typeStatuses || [],
      });
    } catch (err) {
      console.error("Failed to load GBIF facets:", err);
      setError(err.message || "Failed to load GBIF filter lists.");
    } finally {
      setFacetsLoading(false);
    }
  }

  async function fetchRows() {
    setLoading(true);
    setError("");

    try {
      const headers = await getAuthHeaders();

      const params = new URLSearchParams();

      params.set("page", tableState.pagination.current);
      params.set("pageSize", tableState.pagination.pageSize);

      if (activeSearchText.trim()) {
        params.set("q", activeSearchText.trim());
      }

      if (tableState.sorter?.field) {
        params.set("sortField", tableState.sorter.field);
      }

      if (tableState.sorter?.order) {
        params.set("sortOrder", tableState.sorter.order);
      }

      Object.entries(tableState.filters || {}).forEach(([key, values]) => {
        if (Array.isArray(values)) {
          values.filter(Boolean).forEach((value) => {
            params.append(key, value);
          });
        }
      });

      if (hasCoordinates) {
        params.set("hasCoordinates", hasCoordinates);
      }

      if (hasMedia) {
        params.set("hasMedia", hasMedia);
      }

      if (minYear !== null && minYear !== undefined) {
        params.set("minYear", String(minYear));
      }

      if (maxYear !== null && maxYear !== undefined) {
        params.set("maxYear", String(maxYear));
      }

      const response = await fetch(
        `${API_ROOT}/api/admin/gbif/occurrences?${params.toString()}`,
        { headers }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          body.detail ||
            body.error ||
            `Occurrence request failed: HTTP ${response.status}`
        );
      }

      const data = await response.json();

      setRows(data.rows || []);
      setTotal(Number(data.total || 0));
    } catch (err) {
      console.error("Failed to fetch GBIF occurrence cache:", err);
      setError(err.message || "Failed to fetch GBIF occurrence cache.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchFacets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

    const [hasRunQuery, setHasRunQuery] = useState(false);

  useEffect(() => {
    if (!hasRunQuery) return;

    fetchRows();
        // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [
        hasRunQuery,
        tableState,
        activeSearchText,
        hasCoordinates,
        hasMedia,
        minYear,
        maxYear,
  ]);

  function resetToFirstPage(extra = {}) {
    setTableState((prev) => ({
      ...prev,
      ...extra,
      pagination: {
        ...prev.pagination,
        current: 1,
      },
    }));
  }

  function runSearch() {
    setActiveSearchText(searchText);
    setHasRunQuery(true);
    resetToFirstPage();
  }

  function clearFilters() {
    setSearchText("");
    setActiveSearchText("");
    setHasCoordinates("");
    setHasMedia("");
    setMinYear(null);
    setMaxYear(null);

    setTableState({
      pagination: {
        current: 1,
        pageSize: 50,
      },
      filters: {},
      sorter: {
        field: "gbifId",
        order: "ascend",
      },
    });
  }

  function handleTableChange(pagination, filters, sorter) {
    const normalizedSorter = Array.isArray(sorter) ? sorter[0] : sorter;

    setTableState({
      pagination: {
        current: pagination.current,
        pageSize: pagination.pageSize,
      },
      filters,
      sorter: {
        field: normalizedSorter?.columnKey || "gbifId",
        order: normalizedSorter?.order || "ascend",
      },
    });
  }

  const columns = useMemo(
    () => [
      {
        title: "GBIF ID",
        dataIndex: "gbifId",
        key: "gbifId",
        sorter: true,
        width: 140,
        fixed: "left",
        render: (value) =>
          value ? (
            <a
              href={`https://www.gbif.org/occurrence/${value}`}
              target="_blank"
              rel="noreferrer"
            >
              {value}
            </a>
          ) : (
            ""
          ),
      },
      {
          title: "Scientific name",
          dataIndex: "scientificName",
          key: "scientificName",
          sorter: true,
          width: 280,
          fixed: "left",
        },
        {
            title: "Genus",
            dataIndex: "genus",
            key: "genus",
            sorter: true,
            filters: facetOptions(facets.genera),
            filterSearch: true,
            filteredValue: tableState.filters?.genus || null,
            width: 160,
        },
        {
            title: "Specific epithet",
            dataIndex: "specificEpithet",
            key: "specificEpithet",
            sorter: true,
            width: 180,
        },
        {
            title: "Taxonomic status",
            dataIndex: "taxonomicStatus",
            key: "taxonomicStatus",
            sorter: true,
            filters: facetOptions(facets.taxonomicStatuses),
            filteredValue: tableState.filters?.taxonomicStatus || null,
            width: 180,
            render: (value) => (value ? <Tag>{value}</Tag> : ""),
        },
        {
            title: "Basis",
            dataIndex: "basisOfRecord",
            key: "basisOfRecord",
            sorter: true,
            filters: facetOptions(facets.basisOfRecords),
            filteredValue: tableState.filters?.basisOfRecord || null,
            width: 170,
            render: (value) => (value ? <Tag>{value}</Tag> : ""),
        },
        {
            title: "Occurrence status",
            dataIndex: "occurrenceStatus",
            key: "occurrenceStatus",
            sorter: true,
            filters: facetOptions(facets.occurrenceStatuses),
            filteredValue: tableState.filters?.occurrenceStatus || null,
            width: 180,
        },
        {
            title: "Type status",
            dataIndex: "typestatus",
            key: "typestatus",
            filters: facetOptions(facets.typeStatuses),
            filteredValue: tableState.filters?.typestatus || null,
            width: 180,
            ellipsis: true,
        },
        {
            title: "Institution",
            dataIndex: "institutionCode",
            key: "institutionCode",
            sorter: true,
            filters: facetOptions(facets.institutions),
            filterSearch: true,
            filteredValue: tableState.filters?.institutionCode || null,
            width: 150,
        },
        {
            title: "Collection",
            dataIndex: "collectionCode",
            key: "collectionCode",
            sorter: true,
            filters: facetOptions(facets.collections),
            filterSearch: true,
            filteredValue: tableState.filters?.collectionCode || null,
            width: 150,
        },
        {
            title: "Catalog #",
            dataIndex: "catalogNumber",
            key: "catalogNumber",
            sorter: true,
            width: 170,
        },
        {
            title: "Country",
            dataIndex: "countryCode",
            key: "countryCode",
            sorter: true,
            filters: facetOptions(facets.countries),
            filterSearch: true,
            filteredValue: tableState.filters?.countryCode || null,
            width: 120,
        },
        {
            title: "State/Province",
            dataIndex: "stateProvince",
            key: "stateProvince",
            sorter: true,
            width: 180,
        },
        {
            title: "Locality",
            dataIndex: "locality",
            key: "locality",
            width: 320,
            ellipsis: true,
        },
        {
            title: "Event date",
            dataIndex: "eventDate",
            key: "eventDate",
            sorter: true,
            width: 150,
        },
        {
            title: "Year",
            dataIndex: "year",
            key: "year",
            sorter: true,
            width: 100,
        },
        {
            title: "Lat",
            dataIndex: "decimalLatitude",
            key: "decimalLatitude",
            sorter: true,
            width: 120,
        },
        {
            title: "Lng",
            dataIndex: "decimalLongitude",
            key: "decimalLongitude",
            sorter: true,
            width: 120,
        },
        {
            title: "Recorded by",
            dataIndex: "recordedBy",
            key: "recordedBy",
            width: 260,
            ellipsis: true,
        },
        {
            title: "Identified by",
            dataIndex: "identifiedBy",
            key: "identifiedBy",
            width: 260,
            ellipsis: true,
        },
        {
          title: "Snapshot",
          dataIndex: "snapshotDate",
          key: "snapshotDate",
          sorter: true,
          filters: facetOptions(facets.snapshotDates),
          filteredValue: tableState.filters?.snapshotDate || null,
          width: 130,
        },
    ],
    [facets, tableState.filters]
  );

  return (
    <div
      style={{
        backgroundColor: "#f6f6f6",
        minHeight: "100vh",
        padding: "48px 24px",
      }}
    >
      <div style={{ maxWidth: 1500, margin: "0 auto" }}>
        <Space style={{ marginBottom: 16 }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate("/admin")}
          >
            Admin
          </Button>
        </Space>

        <Title level={2} style={{ marginBottom: 8 }}>
          GBIF Cache
        </Title>

        <Text type="secondary">
          View, search, filter, and sort the local GBIF Phoridae occurrence
          snapshot.
        </Text>

        <Card style={{ marginTop: 24, marginBottom: 24 }}>
          <Space direction="vertical" style={{ width: "100%" }} size="middle">
            {error ? (
              <Alert
                type="error"
                showIcon
                message="GBIF cache query failed"
                description={error}
              />
            ) : null}

            <Space wrap>
              <Input
                allowClear
                placeholder="Search GBIF ID, name, locality, catalog #, collector..."
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                onPressEnter={runSearch}
                style={{ width: 460 }}
                prefix={<SearchOutlined />}
              />

              <Button type="primary" onClick={runSearch}>
                Search
              </Button>

              <Button onClick={clearFilters}>Clear</Button>

              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  fetchFacets();
                  setHasRunQuery(true);
                  fetchRows();
                }}
                loading={loading || facetsLoading}
              >
                Refresh
              </Button>
            </Space>

            <Space wrap>
              <Text>Coordinates:</Text>
              <Select
                value={hasCoordinates}
                onChange={(value) => {
                  setHasCoordinates(value);
                  resetToFirstPage();
                }}
                style={{ width: 170 }}
                options={[
                  { label: "Any", value: "" },
                  { label: "Has coordinates", value: "true" },
                  { label: "Missing coordinates", value: "false" },
                ]}
              />

              <Text>Media:</Text>
              <Select
                value={hasMedia}
                onChange={(value) => {
                  setHasMedia(value);
                  resetToFirstPage();
                }}
                style={{ width: 140 }}
                options={[
                  { label: "Any", value: "" },
                  { label: "Has media", value: "true" },
                  { label: "No media", value: "false" },
                ]}
              />

              <Text>Min year:</Text>
              <InputNumber
                value={minYear}
                onChange={(value) => {
                  setMinYear(value);
                  resetToFirstPage();
                }}
                min={1500}
                max={2100}
                style={{ width: 110 }}
              />

              <Text>Max year:</Text>
              <InputNumber
                value={maxYear}
                onChange={(value) => {
                  setMaxYear(value);
                  resetToFirstPage();
                }}
                min={1500}
                max={2100}
                style={{ width: 110 }}
              />
            </Space>

            <Text type="secondary">
              
              {hasRunQuery ? (
                <Text type="secondary">
                    Total matching records: {total.toLocaleString()}
                </Text>
              ) : (
                <Text type="secondary">
                    Enter a search or click Refresh to query the GBIF cache.
                </Text>
              )}

            </Text>
          </Space>
        </Card>

        <Card>
          <Table
            rowKey={(record) => String(record.gbifId)}
            columns={columns}
            dataSource={rows}
            loading={loading}
            onChange={handleTableChange}
            pagination={{
              current: tableState.pagination.current,
              pageSize: tableState.pagination.pageSize,
              total,
              showSizeChanger: true,
              pageSizeOptions: ["25", "50", "100", "250"],
              showTotal: (value) => `${value.toLocaleString()} occurrences`,
            }}
            scroll={{ x: 3600 }}
            size="small"
          />
        </Card>
      </div>
    </div>
  );
}