import React from 'react';
import { Typography, Carousel, Row, Col } from 'antd';
import './PhotoGallery.css';
import { fetchPhotoGallery } from '../utils/api';

const { Title } = Typography;



const fallbackImage = 'https://via.placeholder.com/300x200?text=No+Image';
const generaData =  await fetchPhotoGallery();
  

const PhotoGallery = () => {
  return (
    <div style={{ padding: "48px 24px", margin: "0 auto" }}>
      <Title level={2}>Photo Gallery of Phorid Genera</Title>
      <div className="grid-wrapper">
        <Row gutter={[16, 16]}>
          {generaData.map(({ genus, images }, idx) => (
            <Col key={idx} xs={24} sm={12} md={8} lg={6} xl={4}>
              <div className="carousel-card">
                <Carousel draggable autoplay dots={false}>
                  {(images.length ? images : [fallbackImage]).map((img, i) => (
                    <div key={i}>
                      <img src={img} alt={`${genus} ${i}`} className="carousel-image" />
                    </div>
                  ))}
                </Carousel>
                <div className="carousel-caption">
                  <span>{genus}</span>
                </div>
              </div>
            </Col>
          ))}
        </Row>
      </div>
    </div>
  );
};

export default PhotoGallery;
