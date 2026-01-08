import React from "react";
import { Card, Row, Col, Typography } from "antd";
import { useNavigate } from "react-router-dom";

const { Title } = Typography;

const AdminDashboard = () => {
  const navigate = useNavigate();

  return (
    <div
      style={{
        backgroundColor: "#f6f6f6",
        minHeight: "100vh",
        padding: "48px 24px"
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <Title level={2} style={{ marginBottom: 32 }}>
          Phorid Admin Tools
        </Title>

        <Row gutter={[24, 24]}>
          <Col xs={24} sm={12} md={12} lg={6}>
            <Card
              hoverable
              title="Morphometrics"
              onClick={() => navigate("/phoridae/morphometrics")}
            >
              Landmark annotation, wing analysis, and morphometric tools.
            </Card>
          </Col>

          <Col xs={24} sm={12} md={12} lg={6}>
            <Card 
              hoverable 
              title="Literature"
              onClick={() => navigate("/phoridae/literature")}
            >
              Manage PDFs, references, and extracted metadata.
            </Card>
          </Col>

          <Col xs={24} sm={12} md={12} lg={6}>
            <Card hoverable title="PCAT">
              Phorid Catalog tools and taxonomic data management.
            </Card>
          </Col>

          <Col xs={24} sm={12} md={12} lg={6}>
            <Card hoverable title="Describer">
              Describe specimens and generate descriptions.
            </Card>
          </Col>
        </Row>
      </div>
      <div>
        <h2>Vision for Catalog</h2>
        <p>
          The Catalog will exist in two parts - public and private.
        </p>
        <p>
          The public Catalog is connected to GBIF and supports discovery, browsing,
          and general access to occurrence and taxonomic data. This is the only
          Catalog available during the initial website rollout.
        </p>
        <p>
          A private Catalog, connected to the internal research database, will support
          phorid-specific research workflows and data management tasks and will be
          enabled in later phases.
        </p>

        <h2>Vision for Admin Page</h2>
        <p>
          The Admin page serves as a workspace for building and operating research
          tools over time and only available to researchers with credentials.
        </p>
        <p>
          Tools will be added incrementally. The initial focus is a morphometrics
          tool for fast capture of wing landmarks, with support for exporting
          landmark coordinate sets.
        </p>
        <p>
          Later phases will introduce versioning, multiple landmark schemas, and
          tools for efficient import and export of images and landmark datasets.
          Analytical tools will be added once data capture workflows are stable.
        </p>

        <h2>Vision for Literature</h2>
        <p>
          At rollout, the Literature tool provides a simple search over a shared
          bucket containing all PDFs, with the ability to download papers.
        </p>
        <p>
          Future phases will include indexed full-text search, snippet extraction,
          self-service uploads, AI summary and analysis, and full citation management and formatting.
        </p>

        <h2>Vision for Taxonomic Keys</h2>
        <p>
          Infrastructure for taxonomic keys is already in place and connected to the
          research database.
        </p>
        <p>
          When researchers are ready to add keys, a defined workflow (in design) will support
          production and integration of required materials.
        </p>
      </div>

    </div>
  );
};

export default AdminDashboard;
