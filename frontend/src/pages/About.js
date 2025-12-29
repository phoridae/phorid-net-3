import React from "react";
import { Typography } from "antd";

const { Title, Paragraph, Link } = Typography;

function About() {
  return (

    <div style={{ padding: "24px 32px", backgroundColor: "#f9f9f9" }}>
      <Title level={2}>About Phorid.net</Title>

      <Paragraph>
        Phorid.net is a public, research-oriented website dedicated to the study
        of phorid flies (Diptera: Phoridae). The site is intended to serve both
        professional researchers and anyone with an interest in phorid biology,
        taxonomy, and biodiversity.
      </Paragraph>

      <Paragraph>
        Our goal is to provide a centralized set of resources that support the
        discovery, identification, and study of phorid flies, with an emphasis
        on making primary data, tools, and references accessible in a clear and
        practical way.
      </Paragraph>

      <Title level={4}>What you’ll find here</Title>

      <Paragraph>
        Phorid.net brings together a growing collection of:
      </Paragraph>

      <ul>
        <li>Taxonomic and biological information on phorid flies</li>
        <li>Research projects and datasets</li>
        <li>Identification tools and keys</li>
        <li>Image resources and specimen documentation</li>
        <li>Educational material for students and the general public</li>
      </ul>

      <Paragraph>
        The site is actively developed and evolves alongside ongoing research
        efforts.
      </Paragraph>

      <Title level={4}>Audience</Title>

      <Paragraph>
        This site is designed for dipterists, taxonomists, biodiversity
        researchers, students, educators, and anyone interested in phorid flies
        and insect diversity. No specialized background is required to explore
        the site, though some sections are geared toward technical research use.
      </Paragraph>

      <Title level={4}>Development and feedback</Title>

      <Paragraph>
        Phorid.net is an ongoing project, and improvements are made continuously.
        If you encounter errors, broken links, or unexpected behavior, or if you
        have suggestions related to site functionality, please report them
        through the GitHub issue tracker:
      </Paragraph>

      <Paragraph>
        <Link
          href="https://github.com/phoridae/phorid-net-3"
          target="_blank"
          rel="noopener noreferrer"
        >
          https://github.com/phoridae/phorid-net-3
        </Link>
      </Paragraph>

      <Paragraph>
        Bug reports and constructive feedback are welcome and help improve the
        site for everyone.
      </Paragraph>
    </div>
  );
}

export default About;
