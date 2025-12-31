import React, { useState } from "react";
import { Typography, Divider } from "antd";
import CarouselSmall from "../components/CarouselSmall";
import people from "../assets/people-bios";


const { Title, Paragraph, Link } = Typography;

function People() {
  const [selected, setSelected] = useState(people[0]);

  const carouselItems = people.map((p) => ({
    src: p.image,
    alt: p.name,
    text: p.name,
    person: p,
  }));

  return (
    <div style={{ padding: "48px 24px", maxWidth: 1100, margin: "0 auto" }}>
      <Title level={2}>People</Title>

      {/* === PERSON SELECTOR === */}
      <CarouselSmall
        items={carouselItems}
        slidesToShow={4}
        onSelect={(item) => setSelected(item.person)}
      />

      <Divider />

      {/* === PERSON DETAILS === */}
      {selected && (
        <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
          <img
            src={selected.image}
            alt={selected.name}
            style={{
              width: 200,
              borderRadius: 4,
            }}
          />

          <div>
            <Title level={4} style={{ marginBottom: 0 }}>
              {selected.name}
            </Title>

            <Paragraph style={{ marginBottom: 4 }}>
              <strong>{selected.title}</strong>
            </Paragraph>

            <Paragraph type="secondary">
              {selected.affiliation}
            </Paragraph>

            <Paragraph>{selected.bio}</Paragraph>

            <Paragraph>
              {selected.links.map((link) => (
                <Link
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  style={{ marginRight: 16 }}
                >
                  {link.label}
                </Link>
              ))}
            </Paragraph>
          </div>
        </div>
      )}
    </div>
  );
}

export default People;
