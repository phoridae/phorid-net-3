import React, { useEffect, useState } from "react";
import { Alert, Button, Card, Empty, Select, Spin, Tabs, Tag, Typography } from "antd";
import { Outlet, useMatch, useNavigate } from "react-router-dom";
import { taxonomySections } from "../components/taxonomy/TaxonomySection";
import { useAuth } from "../auth/AuthContext";
import { fetchTaxonomyWorkspaces } from "../utils/api/taxonomy";

const { Title, Paragraph } = Typography;

export default function TaxonomyWorkbench() {
  const navigate = useNavigate();
  const sectionMatch = useMatch("/admin/taxonomy/:section/*");
  const activeSection = sectionMatch?.params.section || "species";
  const { user, authLoading } = useAuth();
  const uid = user?.uid;
  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setWorkspaces([]);
    setSelectedWorkspaceId(null);
    setError("");
    setLoading(true);

    if (authLoading) return () => controller.abort();
    if (!uid) {
      setError("You must be signed in.");
      setLoading(false);
      return () => controller.abort();
    }

    async function loadWorkspaces() {
      try {
        const available = await fetchTaxonomyWorkspaces({ signal: controller.signal });
        if (!active) return;
        setWorkspaces(available);
        try {
          const savedId = sessionStorage.getItem(`taxonomy-workspace:${uid}`);
          if (available.some((workspace) => workspace.id === savedId)) {
            setSelectedWorkspaceId(savedId);
          } else {
            sessionStorage.removeItem(`taxonomy-workspace:${uid}`);
          }
        } catch {
          // Page state still works when browser storage is unavailable.
        }
      } catch (err) {
        if (active && err.name !== "AbortError") setError(err.message || "Could not load taxonomy workspaces.");
      } finally {
        if (active) setLoading(false);
      }
    }
    loadWorkspaces();
    return () => {
      active = false;
      controller.abort();
    };
  }, [uid, authLoading, reload]);

  function selectWorkspace(workspaceId) {
    setSelectedWorkspaceId(workspaceId);
    try {
      sessionStorage.setItem(`taxonomy-workspace:${uid}`, workspaceId);
    } catch {
      // Selection does not depend on persistence being available.
    }
  }

  const currentWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId);

  return (
    <div
      style={{
        backgroundColor: "#f6f6f6",
        minHeight: "100vh",
        padding: "48px 24px",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <Title level={2}>Taxonomy Workbench</Title>
        <Paragraph style={{ marginBottom: 32 }}>
          Curate taxonomic data, specimen evidence, characters, species descriptions, and identification resources.
        </Paragraph>
        <Paragraph type="secondary">Global scientific data, workspace-controlled curation.</Paragraph>
        <Card>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            <label htmlFor="taxonomy-workspace" style={{ fontWeight: 600 }}>Workspace:</label>
            <Select
              id="taxonomy-workspace"
              style={{ width: "100%", maxWidth: 420 }}
              placeholder="Select a workspace"
              value={currentWorkspace?.id}
              onChange={selectWorkspace}
              loading={loading}
              disabled={loading || !!error || workspaces.length === 0}
              showSearch
              optionFilterProp="label"
              options={workspaces.map((workspace) => ({ value: workspace.id, label: workspace.name }))}
            />
          </div>

          {loading ? (
            <div role="status"><Spin size="small" /> Loading workspaces…</div>
          ) : error ? (
            <Alert
              type="error"
              showIcon
              message="Unable to load workspaces"
              description={error}
              action={<Button onClick={() => setReload((value) => value + 1)}>Retry</Button>}
            />
          ) : workspaces.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No taxonomy workspaces are available yet." />
          ) : currentWorkspace ? (
            <div aria-label="Current workspace">
              <Title level={4}>{currentWorkspace.name}</Title>
              <Paragraph>{currentWorkspace.description || "No workspace description provided."}</Paragraph>
              <Paragraph>Visibility: <Tag>{currentWorkspace.visibility}</Tag></Paragraph>
            </div>
          ) : (
            <Paragraph>Select a workspace to begin working with taxonomy data.</Paragraph>
          )}
        </Card>
        {currentWorkspace ? (
          <Tabs
            type="card"
            style={{ marginTop: 24 }}
            activeKey={activeSection}
            onChange={(section) => navigate(`/admin/taxonomy/${section}`)}
            items={taxonomySections.map(({ key, label }) => ({
              key, label,
              children: key === activeSection ? <Outlet context={{ currentWorkspace }} /> : null,
            }))}
          />
        ) : (
          <Outlet context={{ currentWorkspace: null }} />
        )}
      </div>
    </div>
  );
}
