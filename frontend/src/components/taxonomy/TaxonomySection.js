import React from "react";
import { Card, Typography } from "antd";
import { useOutletContext } from "react-router-dom";

const { Title, Paragraph } = Typography;

export const taxonomySections = [
  {
    key: "species", label: "Species",
    description: "Explore global species records and select species in this workspace.",
    workflows: ["Search global taxonomy species records and look up GBIF-backed species.", "Add species to workspace.", "Create work-in-progress or code-name taxa."],
  },
  {
    key: "specimens", label: "Specimens",
    description: "Explore global specimen records. Specimens do not belong to a workspace.",
    workflows: ["Search global specimens and look up GBIF occurrences.", "Create local specimen records.", "Review specimen metadata and update current species assignments."],
  },
  {
    key: "characters", label: "Characters",
    description: "Curate global reusable characters and states, and choose characters for this workspace.",
    workflows: ["Search shared character and state definitions.", "Add shared characters to workspace.", "Create a new character or state interpretation when needed."],
  },
  {
    key: "data-entry", label: "Data Entry",
    description: "Score and digitize scientific observations with their evidence and attribution.",
    workflows: ["Score individual specimens.", "Digitize structured species-description data from literature."],
  },
  {
    key: "descriptions", label: "Descriptions",
    description: "Explore globally discoverable taxonomic interpretations. Each description has an originating/editing workspace and remains discoverable across workspaces.",
    workflows: ["Review species descriptions and alternative interpretations.", "Connect interpretations to specimen and publication evidence."],
  },
  {
    key: "keys", label: "Keys",
    description: "Assemble identification keys from exact species descriptions, including descriptions originating in different workspaces.",
    workflows: ["Choose exact descriptions for a key.", "Organize identification resources around synthesized character observations."],
  },
];

export default function TaxonomySection({ sectionKey }) {
  const { currentWorkspace } = useOutletContext();
  if (!currentWorkspace) return null;
  const section = taxonomySections.find((item) => item.key === sectionKey);

  return (
    <Card>
      <Title level={3}>{section.label}</Title>
      <Paragraph>{section.description}</Paragraph>
      <Paragraph>Planned workflows:</Paragraph>
      <ul>
        {section.workflows.map((workflow) => <li key={workflow}>{workflow}</li>)}
      </ul>
      <Paragraph type="secondary">Tools for this section will be added next.</Paragraph>
    </Card>
  );
}
