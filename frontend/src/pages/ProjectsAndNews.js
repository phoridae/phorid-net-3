import React from "react";
import { List } from "antd";
import { Link } from "react-router-dom";
import "./ProjectsAndNews.css";

const projectsAndNews = [
  {
    title: "Crisis in Neotropical Dipterology",
    description:
      "An analysis of Malaise trap samples and the implications for taxonomic capacity and biodiversity knowledge in the Neotropics.",
    to: "/phoridae/crisis",
  },
  // future items go here
];

const ProjectsAndNews = () => {
  return (
    <div className="projectsWrapper">
      <h1>Projects & News</h1>

      <p>
        Ongoing projects, publications, and updates related to phorid research
        and the broader study of Diptera.
      </p>

      <div className="listWrapper">
        <List
          itemLayout="horizontal"
          dataSource={projectsAndNews}
          renderItem={(item) => (
            <List.Item>
              <List.Item.Meta
                title={<Link to={item.to}>{item.title}</Link>}
                description={item.description}
              />
            </List.Item>
          )}
        />
      </div>
    </div>
  );
};

export default ProjectsAndNews;
