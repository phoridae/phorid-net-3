import React from "react";
import { Carousel } from "antd";
import "./CarouselSmall.css";

const CarouselSmall = ({
  items,
  infinite = false,
  slidesToShow = 6,
  draggable = true,
  autoplay = false,
  onSelect,
  selectedKey, // <-- NEW: lets us highlight active person
}) => {
  return (
    <div className="carousel-small-container">
      <Carousel
        dots
        arrows
        infinite={infinite}
        draggable={draggable}
        autoplay={autoplay}
        slidesToShow={slidesToShow}
        slidesToScroll={1}
        className="carousel-small"
      >
        {items.map((item, index) => {
          const active = selectedKey && item.key === selectedKey;

          return (
            <div key={item.key ?? `slide-${index}`}>
              <button
                type="button"
                className={`carousel-small-slide ${active ? "active" : ""}`}
                onClick={() => onSelect?.(item)}
              >
                <img src={item.src} alt={item.alt} />
                {item.text && <div className="carousel-small-text">{item.text}</div>}
              </button>
            </div>
          );
        })}
      </Carousel>
    </div>
  );
};

export default CarouselSmall;
