import React, { useState } from "react";
import { Typography, Tabs } from "antd";

import GeneraTab from "../components/phoridCatalog/GeneraTab";
import SpeciesTab from "../components/phoridCatalog/SpeciesTab";
import SpecimensTab from "../components/phoridCatalog/SpecimensTab";

const { Title } = Typography;

const PhoridCatalogPublic = () => {
  const [activeTab, setActiveTab] = useState("genera");
  const [selectedGenus, setSelectedGenus] = useState(null);

  const handleGenusSelect = (genus) => {
    setSelectedGenus(genus);
    setActiveTab("species");
  };

  return (
    <div style={{ padding: "48px 24px", margin: "0 auto" }}>
      <Title level={2}>Public Phorid Catalog</Title>

      <Tabs
        activeKey={activeTab}
        type="card"
        onChange={setActiveTab}
        items={[
          {
            label: "Genera",
            key: "genera",
            children: <GeneraTab onSelectGenus={handleGenusSelect} />,
          },
          {
            label: "Species",
            key: "species",
            children: (
              <SpeciesTab selectedGenus={selectedGenus} />
            ),
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
