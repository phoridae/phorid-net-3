import React from "react";
import { Typography, List } from "antd";
import { Link } from "react-router-dom";

const { Title, Paragraph } = Typography;

const projectsAndNews = [
  {
    title: "Crisis in Neotropical Dipterology",
    description:
      "An analysis of Malaise trap samples and the implications for taxonomic capacity and biodiversity knowledge in the Neotropics.",
    to: "/phoridae/crisis",
  },
  // Future items go here
];

const ProjectsAndNews = () => {
  return (
    <div
      style={{
        padding: "48px 24px",
        maxWidth: 900,
        margin: "0 auto",
      }}
    >
      <Title level={2}>Projects & News</Title>

      <Paragraph style={{ color: "#555", marginBottom: 24 }}>
        Ongoing projects, publications, and updates related to phorid research
        and the broader study of Diptera.
      </Paragraph>

      <List
        itemLayout="vertical"
        dataSource={projectsAndNews}
        renderItem={(item) => (
          <List.Item>
            <List.Item.Meta
              title={
                <Link to={item.to} style={{ fontSize: 16 }}>
                  {item.title}
                </Link>
              }
              description={item.description}
            />
          </List.Item>
        )}
      />
    </div>
  );
};

export default ProjectsAndNews;
