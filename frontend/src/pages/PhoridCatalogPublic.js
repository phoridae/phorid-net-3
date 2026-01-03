import React from "react";
import { Typography, Tabs } from "antd";

import GeneraTab from "../components/phoridCatalog/GeneraTab";
import SpeciesTab from "../components/phoridCatalog/SpeciesTab";
import SpecimensTab from "../components/phoridCatalog/SpecimensTab";

const { Title } = Typography;

const PhoridCatalogPublic = () => {
  return (
    <div style={{ padding: "48px 24px", margin: "0 auto" }}>
      <Title level={2}>Public Phorid Catalog</Title>

      <Tabs
        defaultActiveKey="genera"
        type="card"
        style={{ marginBottom: 32 }}
        items={[
          {
            label: "Genera",
            key: "genera",
            children: <GeneraTab />,
          },
          {
            label: "Species",
            key: "species",
            children: <SpeciesTab />,
          },
          {
            label: "Specimens",
            key: "specimens",
            children: <SpecimensTab />,
          },
        ]}
      />
    </div>
  );
};

export default PhoridCatalogPublic;
