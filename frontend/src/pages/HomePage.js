import React from 'react';
import { Card, Row, Col, List } from 'antd';
import { Typography } from 'antd';
import { ExportOutlined } from "@ant-design/icons";


import { Link } from 'react-router-dom';
import '../App.css';
import HeroIntro from '../components/HeroIntro';

import automatex  from '../assets/images/automatex.png';
import pcat from '../assets/images/pcat.png';
import bioscan from '../assets/images/bioscan-dummy.png'
import photoGallery from '../assets/images/photoGallery.png';
import myrioImage from '../assets/images/Myriophora_lucigaster.png';
import phoridNewsletters from '../assets/images/phoridNewsletters.png';
import keys from '../assets/images/keys.png';
import crisis from '../assets/images/crisis-dummy.png'
import melaImage from '../assets/images/melaloncha_annicae.png';
import apoImage from '../assets/images/apo_wallaceorum_lateral.jpg';
import dohrImage from '../assets/images/Dohrniphora_apharea.jpg';
import megaImage from '../assets/images/megaselia_mithridates.png';
import mLongaImage from '../assets/images/LACM_ENT_068159_longa_habitus.png';
import coniceroImage from '../assets/images/Coniceromyia.jpg'

import phorid1 from '../assets/images/megaselia_mithridates.png';
import phorid2 from '../assets/images/apo_wallaceorum_lateral.jpg';
import phorid3 from '../assets/images/Dohrniphora_apharea.jpg';


const { Paragraph, Title } = Typography;
const resources = [
  {
    title: 'Phorid Catalog',
    img: pcat,
    external: true,
    href: 'http://example.com/page2',
  },
  {
    title: 'Photo Gallery',
    img: photoGallery,
    internal: true,
    to: '/phoridae/photoGallery',
  },
  {
    title: 'BioSCAN',
    img: bioscan,
    internal: true,
    to: '/phoridae/bioscan',
  },
  {
    title: 'Phorid Newsletters',
    img: phoridNewsletters,
    internal: true,
    to: '/phoridae/newsletters',
  },
  {
    title: 'Identification Keys',
    img: keys,
    internal: true,
    to: '/phoridae/identificationKeys',
  },
  {
    title: 'Automated Material Examined',
    img: automatex,
    external: true,
    href: 'http://example.com/page2',
  },
  {
    title: 'Crisis in Neotropical Dipterology',
    img: crisis,
    internal: true,
    to: '/phoridae/crisis',
  },
];  // this this grows beyond three smaller rows on the right, let's make the last row have a more link to a resources page

const gbifTaxa = [
  { title: 'Phoridae', img: mLongaImage, href: 'https://www.gbif.org/occurrence/charts?taxon_key=9502' },
  { title: 'Megaselia', img: megaImage, href: 'https://www.gbif.org/occurrence/charts?taxon_key=1546413' },
  { title: 'Coniceromyia', img: coniceroImage, href: 'https://www.gbif.org/occurrence/charts?taxon_key=1545951' },
  { title: 'Apocephalus', img: apoImage, href: 'https://www.gbif.org/occurrence/charts?taxon_key=1545388' },
  { title: 'Dohrniphora', img: dohrImage, href: 'https://www.gbif.org/occurrence/charts?taxon_key=1548850' },
  { title: 'Melaloncha', img: melaImage, href: 'https://www.gbif.org/occurrence/charts?taxon_key=1550009' },
  { title: 'Myriophora', img: myrioImage, href: 'https://www.gbif.org/occurrence/charts?taxon_key=4575472' },
];

const HomePage = () => {
  return (
    <div className="App" style={{ padding: '24px' }}>
      <HeroIntro />  

      {/* Phoridae intro section */}
      <div style={{ padding: '48px 24px', maxWidth: 1100, margin: '0 auto' }}>

        {/* Row 1: Text – Image */}
        <Row gutter={[32, 32]} align="middle">
          <Col xs={24} md={12}>
            <Title level={3}>What are Phoridae?</Title>
            <Paragraph>
              Phoridae are a large group of thousands of species of small flies. They are one of the
              most spectacular groups of flies in terms of diversity of body types and variety of
              life histories. They range in size from about 6 mm in length down to 0.4 mm, the
              world’s smallest fly.
            </Paragraph>
          </Col>
          <Col xs={24} md={12}>
            <img src={phorid1} alt="Phorid fly" style={{ width: '100%', borderRadius: 6 }} />
          </Col>
        </Row>

        {/* Row 2: Image – Text */}
        <Row gutter={[32, 32]} align="middle" style={{ marginTop: 48 }}>
          <Col xs={24} md={12}>
            <img src={phorid2} alt="Phorid diversity" style={{ width: '100%', borderRadius: 6 }} />
          </Col>
          <Col xs={24} md={12}>
            <Title level={3}>Life histories</Title>
            <Paragraph>
              Phorid life histories are classified mostly by the way the larva feeds. These include
              scavengers, plant feeders, fungus feeders, predators, parasitoids, and true parasites.
              Most phorid flies studied so far are parasitoids, often laying eggs in ants, bees,
              or millipedes.
            </Paragraph>
            <Paragraph>
              The vast majority of phorids, however, have never been studied, and their life
              histories remain completely unknown.
            </Paragraph>
          </Col>
        </Row>

        {/* Row 3: Text – Image */}
        <Row gutter={[32, 32]} align="middle" style={{ marginTop: 48 }}>
          <Col xs={24} md={12}>
            <Title level={3}>Global diversity</Title>
            <Paragraph>
              Phorids occur worldwide, from Arctic tundra to tropical rainforests, grasslands,
              and deserts — nearly everywhere except the most barren environments. Although
              about 4,000 species are currently described, this is likely only a small fraction
              of the true diversity.
            </Paragraph>
            <Paragraph>
              Megaselia alone contains over 1,400 described species, but careful morphological
              and molecular studies indicate that many more species remain undiscovered.
            </Paragraph>
          </Col>
          <Col xs={24} md={12}>
            <img src={phorid3} alt="Phorid genera" style={{ width: '100%', borderRadius: 6 }} />
          </Col>
        </Row>
      </div>

      {/* News & Resources */}
      <h2 className="SectionHeader">News and Resources</h2>

      {(() => {
        const featuredResource = resources.find(
          (r) => r.title === "Identification Keys"
        );

        const otherResources = resources.filter(
          (r) => r !== featuredResource
        );

        return (
          <Row gutter={[32, 32]}>
            {/* FEATURED CARD */}
            <Col xs={24} md={12} lg={8}>
              <Link to={featuredResource.to}>
                <Card
                  hoverable
                  style={{ height: "100%" }}
                  cover={
                    <img
                      alt={featuredResource.title}
                      src={featuredResource.img}
                      style={{
                        height: 300,
                        objectFit: "cover",
                      }}
                    />
                  }
                >
                  <Card.Meta
                    title={
                      <Title level={4} style={{ marginBottom: 0 }}>
                        {featuredResource.title}
                      </Title>
                    }
                    description={
                      <Paragraph style={{ marginTop: 8 }}>
                        Explore interactive and illustrated identification keys for Phoridae,
                        designed to support accurate identification and comparative
                        research.
                      </Paragraph>
                    }
                  />
                </Card>
              </Link>
            </Col>

            {/* SUPPORTING GRID */}
            <Col xs={24} md={12} lg={16}>
              <Row gutter={[24, 24]}>
                {otherResources.map((item) => (
                  <Col xs={24} sm={12} lg={8} key={item.title}>
                    {item.internal ? (
                      <Link to={item.to}>
                        <Card
                          hoverable
                          cover={<img alt={item.title} src={item.img} />}
                        >
                          <Card.Meta title={item.title} />
                        </Card>
                      </Link>
                    ) : (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Card
                          hoverable
                          cover={<img alt={item.title} src={item.img} />}
                        >
                          <Card.Meta title={item.title} />
                        </Card>
                      </a>
                    )}
                  </Col>
                ))}
              </Row>
            </Col>
          </Row>
        );
      })()}


      {/* Featured Taxa */}
      <h2 className="SectionHeader" style={{ marginTop: 40 }}>
        Featured Taxa
      </h2>

      {(() => {
        const featuredTaxon = gbifTaxa.find(
          (t) => t.title === "Phoridae"
        );

        const otherTaxa = gbifTaxa.filter(
          (t) => t !== featuredTaxon
        );

        return (
          <Row gutter={[32, 32]}>

            {/* LEFT: TAXA GRID */}
            <Col xs={24} md={16}>
              <Row gutter={[24, 24]}>
                {otherTaxa.map((item) => (
                  <Col xs={24} sm={12} lg={8} key={item.title}>
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${item.title} on GBIF (opens in new tab)`}
                    >
                      <Card
                        hoverable
                        cover={<img alt={item.title} src={item.img} />}
                      >
                        <Card.Meta
                          title={
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              {item.title}
                              <ExportOutlined
                                className="gbif-title-icon"
                                style={{ color: "#4CAF50" }}
                              />
                            </span>
                          }
                        />
                      </Card>
                    </a>
                  </Col>
                ))}
              </Row>
            </Col>

            {/* RIGHT: FEATURED TAXON */}
            <Col xs={24} md={8}>
              <a
                href={featuredTaxon.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Card
                  hoverable
                  style={{ height: "100%" }}
                  cover={
                    <img
                      alt={featuredTaxon.title}
                      src={featuredTaxon.img}
                      style={{
                        height: 300,
                        objectFit: "cover",
                      }}
                    />
                  }
                >
                  <Card.Meta
                    title={
                      <Title level={4} style={{ marginBottom: 0 }}>
                        {featuredTaxon.title}
                      </Title>
                    }
                    description={
                      <Paragraph style={{ marginTop: 8 }}>
                        Explore occurrence data, distribution patterns, and temporal
                        trends using GBIF records.
                      </Paragraph>
                    }
                  />
                </Card>
              </a>
            </Col>

          </Row>
        );
      })()}

      
      <h2 className="SectionHeader" style={{ marginTop: 40 }}>
        Links We Love
      </h2>
      <div
        style={{
          backgroundColor: "#f6f6f6",
          minHeight: "auto",
          paddingTop: 48,
          paddingLeft: 24,
          paddingRight: 24,
          paddingBottom: 0,
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <Row gutter={[24, 24]}>

            {/* LACM Entomology */}
            <Col xs={24} sm={12} md={12} lg={6}>
              <a
                href="https://nhm.org/research-collections/departments/entomology"
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "none" }}
              >
                <Card hoverable title="LACM Entomology">
                  Website of the Entomology Section of the Natural History Museum of Los
                  Angeles County
                </Card>
              </a>
            </Col>

            {/* Fly Obsession */}
            <Col xs={24} sm={12} md={12} lg={6}>
              <a
                href="https://flyobsession.net/"
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "none" }}
              >
                <Card hoverable title="Fly Obsession">
                  A Diptera blog hosted by former LACM Entomology Curator, Brian V. Brown
                </Card>
              </a>
            </Col>

            {/* Fly School */}
            <Col xs={24} sm={12} md={12} lg={6}>
              <a
                href="https://dipteracourse.com/"
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "none" }}
              >
                <Card hoverable title="Fly School">
                  Fly School is course dedicated to fieldwork, natural history, and systematics of Diptera
                </Card>
              </a>
            </Col>

            {/* Dipterists Society */}
            <Col xs={24} sm={12} md={12} lg={6}>
              <a
                href="https://dipterists.org/"
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "none" }}
              >
                <Card hoverable title="Dipterists Society">
                  An international society dedicated the insect order Diptera, or true flies
                </Card>
              </a>
            </Col>

          </Row>
        </div>
      </div>


    </div>
  );
}

export default HomePage;

