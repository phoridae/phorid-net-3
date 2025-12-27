import React from 'react';
import { Card, Row, Col } from 'antd';
import { Typography } from 'antd';

import { Link } from 'react-router-dom';
import '../App.css';
import Carousel from '../components/Carousel';

import automatex  from '../assets/images/automatex.png';
import pcat from '../assets/images/pcat.png';
import photoGallery from '../assets/images/photoGallery.png';
import myrioImage from '../assets/images/Myriophora_lucigaster.png';
import phoridNewsletters from '../assets/images/phoridNewsletters.png';
import keys from '../assets/images/keys.png';
import melaImage from '../assets/images/melaloncha_annicae.png';
import apoImage from '../assets/images/apo_wallaceorum_lateral.jpg';
import dohrImage from '../assets/images/Dohrniphora_apharea.jpg';
import megaImage from '../assets/images/megaselia_mithridates.png';
import mLongaImage from '../assets/images/LACM_ENT_068159_longa_habitus.png';

import phorid1 from '../assets/images/megaselia_mithridates.png';
import phorid2 from '../assets/images/apo_wallaceorum_lateral.jpg';
import phorid3 from '../assets/images/Dohrniphora_apharea.jpg';


const { Paragraph, Title } = Typography;
const resources = [
  {
    title: 'Automated Material Examined',
    img: automatex,
    external: true,
    href: 'http://example.com/page2',
  },
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
];

const gbifTaxa = [
  { title: 'Phoridae', img: mLongaImage, href: 'https://www.gbif.org/occurrence/charts?taxon_key=9502' },
  { title: 'Megaselia', img: megaImage, href: 'https://www.gbif.org/occurrence/charts?taxon_key=1546413' },
  { title: 'Apocephalus', img: apoImage, href: 'https://www.gbif.org/occurrence/charts?taxon_key=1545388' },
  { title: 'Dohrniphora', img: dohrImage, href: 'https://www.gbif.org/occurrence/charts?taxon_key=1548850' },
  { title: 'Melaloncha', img: melaImage, href: 'https://www.gbif.org/occurrence/charts?taxon_key=1550009' },
  { title: 'Myriophora', img: myrioImage, href: 'https://www.gbif.org/occurrence/charts?taxon_key=4575472' },
];

const HomePage = () => {
  return (
    <div className="App" style={{ padding: '24px' }}>
      <Carousel />  

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
      <Row gutter={[24, 24]}>
        {resources.map((item) => (
          <Col xs={24} sm={12} md={8} lg={6} key={item.title}>
            {item.internal ? (
              <Link to={item.to}>
                <Card hoverable cover={<img alt={item.title} src={item.img} />}>
                  <Card.Meta title={item.title} />
                </Card>
              </Link>
            ) : (
              <a href={item.href} target="_blank" rel="noreferrer">
                <Card hoverable cover={<img alt={item.title} src={item.img} />}>
                  <Card.Meta title={item.title} />
                </Card>
              </a>
            )}
          </Col>
        ))}
      </Row>

      {/* GBIF */}
      <h2 className="SectionHeader" style={{ marginTop: 40 }}>
        Featured Taxa
      </h2>
      <Row gutter={[24, 24]}>
        {gbifTaxa.map((item) => (
          <Col xs={24} sm={12} md={8} lg={6} key={item.title}>
            <a href={item.href} target="_blank" rel="noreferrer">
              <Card hoverable cover={<img alt={item.title} src={item.img} />}>
                <Card.Meta title={item.title} />
              </Card>
            </a>
          </Col>
        ))}
      </Row>

    </div>
  );
}

export default HomePage;

