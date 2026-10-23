import React from "react";
import { Card, Typography } from "antd";

const { Title, Paragraph } = Typography;

export default function TaxonomyWorkbench() {
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
        <Card>Select a workspace to begin working with taxonomy data.</Card>
      </div>
    </div>
  );
}
