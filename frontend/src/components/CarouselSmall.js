import React from "react";
import { Carousel } from "antd";
import "./CarouselSmall.css";

const CarouselSmall = ({
  items,
  infinite = false,
  slidesToShow = 4,
  draggable = true,
  autoplay = false,
  onSelect,           
}) => {
  return (
    <div className="carousel-small-container">
      <Carousel
        dots
        infinite={infinite}
        slidesToShow={slidesToShow}
        slidesToScroll={1}
        className="full-width-carousel-small"
        draggable={draggable}
        autoplay={autoplay}
        arrows
      >
        {items.map((item, index) => (
          <div
            className="carousel-small-slide"
            key={`slide-${index}`}
            onClick={() => onSelect?.(item)} 
            role="button"
            tabIndex={0}
          >
            <img src={item.src} alt={item.alt} />
            {item.text && (
              <div className="carousel-small-text">
                {item.text}
              </div>
            )}
          </div>
        ))}
      </Carousel>
    </div>
  );
};

export default CarouselSmall;

