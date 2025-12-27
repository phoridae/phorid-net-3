import React from 'react';
import { Carousel } from 'antd';
import './CarouselSmall.css'; // Custom styles

const CarouselSmall = ({ items, infinite, slidesToShow, draggable, autoplay }) => {
  return (
    <div className="carousel-small-container">
      <Carousel
        dots={true}
        infinite={infinite}
        slidesToShow={slidesToShow}
        slidesToScroll={1}
        className="full-width-carousel-small"
        draggable={draggable}
        autoplay={autoplay}
        autoplaySpeed={2000}
        arrows
      >
        {items.map((item, index) => (
          <div className="carousel-small-slide" key={`slide-${index}`}>
            <a href={item.href || '#'} target="_blank" rel="noopener noreferrer">
              <img 
                src={item.src} 
                alt={item.alt} 
              />
              {item.text && <div className="carousel-small-text">{item.text}</div>}
            </a>
          </div>
        ))}
      </Carousel>
    </div>
  );
};

export default CarouselSmall;
