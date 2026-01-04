import React, { useState } from "react";
import { Button, Select, Tag, Spin } from "antd";

const SpecimensPage = () => {
  const [loading, setLoading] = useState(false);
  const [tested, setTested] = useState(false);
  const [count, setCount] = useState(null);

  const testQuery = async () => {
    setLoading(true);
    setTested(false);

    // TODO: replace with real GBIF count query
    setTimeout(() => {
      const fakeCount = Math.floor(Math.random() * 150000);
      setCount(fakeCount);
      setTested(true);
      setLoading(false);
    }, 800);
  };

  const canProcess = tested && count !== null && count <= 100000;

  return (
    <>
      {/* ---------- CENTERED QUERY BUILDER ---------- */}
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
          <Select placeholder="Genus" style={{ width: 180 }} allowClear />
          <Select placeholder="Species" style={{ width: 220 }} allowClear />
          <Select placeholder="Institution" style={{ width: 220 }} allowClear />
          <Select placeholder="Country" style={{ width: 180 }} allowClear />
        </div>

        <Button type="primary" onClick={testQuery}>
          Test Query
        </Button>

        <div style={{ marginTop: 24 }}>
          {loading && <Spin />}

          {tested && !loading && count !== null && (
            <>
              <div style={{ marginBottom: 8 }}>
                Matching specimens:{" "}
                <strong>{count.toLocaleString()}</strong>
              </div>

              {count > 100000 && (
                <div style={{ color: "#c00" }}>
                  Too many results. Please apply additional filters.
                </div>
              )}

              {count <= 100000 && (
                <div style={{ color: "#3f8600" }}>
                  Query size is within GBIF limits.
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ marginTop: 24 }}>
          <Button type="primary" disabled={!canProcess}>
            Process Query
          </Button>
        </div>
      </div>

      {/* ---------- LEFT-ALIGNED DATA SOURCE + SUMMARY ---------- */}
      <div style={{ padding: "0 24px", marginTop: 24 }}>
        <Tag color="blue">Data source: GBIF</Tag>
        <div style={{ marginTop: 4, color: "#666" }}>
          <em>Summary metrics will appear here.</em>
        </div>
      </div>
    </>
  );
};

export default SpecimensPage;
