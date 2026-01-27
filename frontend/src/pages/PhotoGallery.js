// PhotoGallery.js (full drop-in)
// - Keeps AntD Image preview viewer ("View enlarged")
// - Adds "Hide missing photos" switch
// - Adds tag switches (AND logic: must match ALL toggled tags)
// - Places all toggles directly under the page title

import React, { useMemo, useState } from "react";
import { Typography, Carousel, Row, Col, Switch, Image } from "antd";
import "./PhotoGallery.css";
import { fetchPhotoGallery } from "../utils/api";

const { Title } = Typography;

const fallbackImage = `${process.env.PUBLIC_URL}/images/people/melaloncha_face_illustration.png`;
const generaData = await fetchPhotoGallery();

const PhotoGallery = () => {
  const [hideMissingPhotos, setHideMissingPhotos] = useState(false);
  const [tagToggles, setTagToggles] = useState({}); // { [tag: string]: boolean }

  // Collect unique tags present in the dataset (handles missing tags safely)
  const allTags = useMemo(() => {
    const set = new Set();
    (generaData || []).forEach((g) => {
      (g.tags || []).forEach((t) => {
        if (t) set.add(String(t).trim());
      });
    });
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, []);

  const filtered = useMemo(() => {
    const activeTags = Object.entries(tagToggles)
      .filter(([, on]) => on)
      .map(([tag]) => tag);

    return (generaData || []).filter((g) => {
      const images = Array.isArray(g.images) ? g.images : [];
      const tags = Array.isArray(g.tags) ? g.tags : [];

      // Toggle: hide missing photos
      if (hideMissingPhotos && images.length === 0) return false;

      // Tag toggles: AND logic (must have ALL active tags)
      if (activeTags.length > 0) {
        const tagSet = new Set(tags);
        const hasAll = activeTags.every((t) => tagSet.has(t));
        if (!hasAll) return false;
      }

      return true;
    });
  }, [hideMissingPhotos, tagToggles]);

  return (
    <div style={{ padding: "48px 24px", margin: "0 auto" }}>
      <Title level={2}>Photo Gallery of Phorid Genera</Title>

      {/* === FILTER CONTROLS (under title) === */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        {/* Missing photos toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Switch checked={hideMissingPhotos} onChange={setHideMissingPhotos} />
          <span>Hide missing photos</span>
        </div>

        {/* Tag toggles */}
        {allTags.map((tag) => (
          <div key={tag} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Switch
              checked={!!tagToggles[tag]}
              onChange={(checked) =>
                setTagToggles((prev) => ({ ...prev, [tag]: checked }))
              }
            />
            <span>{tag}</span>
          </div>
        ))}

        {/* Count */}
        <div style={{ marginLeft: "auto", opacity: 0.6 }}>
          Showing {filtered.length} / {generaData.length}
        </div>
      </div>

      <Row gutter={[16, 16]}>
        {filtered.map(({ genus, images }, idx) => (
          <Col key={`${genus}-${idx}`} xs={24} sm={12} md={8} lg={6} xl={4}>
            <div className="carousel-card">
              <Image.PreviewGroup>
                <Carousel draggable autoplay dots={false}>
                  {(images?.length ? images : [fallbackImage]).map((img, i) => (
                    <div key={i}>
                      <Image
                        src={img}
                        alt={`${genus} ${i}`}
                        className="carousel-image"
                        fallback={fallbackImage}
                        preview={{ mask: "View enlarged" }}
                      />
                    </div>
                  ))}
                </Carousel>
              </Image.PreviewGroup>

              <div className="carousel-caption">
                <span>{genus}</span>
              </div>
            </div>
          </Col>
        ))}
      </Row>
    </div>
  );
};

export default PhotoGallery;
