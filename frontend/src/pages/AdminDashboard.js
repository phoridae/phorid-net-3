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
            <Card hoverable title="Literature">
              Manage PDFs, references, and extracted metadata.
            </Card>
          </Col>

          <Col xs={24} sm={12} md={12} lg={6}>
            <Card hoverable title="PCAT">
              Phorid Catalog tools and taxonomic data management.
            </Card>
          </Col>

          <Col xs={24} sm={12} md={12} lg={6}>
            <Card hoverable title="Coming Soon">
              Additional administrative tools will appear here.
            </Card>
          </Col>
        </Row>
      </div>
    </div>
  );
};

export default AdminDashboard;
