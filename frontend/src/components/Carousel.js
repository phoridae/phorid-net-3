import React from 'react';
import { Carousel, Button } from 'antd';
import './Carousel.css'; // Custom styles to achieve the preview effect
import slide1  from '../assets/images/900x600.png';
import myrioFeeding from '../assets/images/myriophora_feeding.mp4';
import malaiseTrap from '../assets/images/malaise_trap.jpg';
import people from '../assets/images/stock_dummy_people_photo.png';
import vestigipoda from '../assets/images/vestigipoda.png';


const CustomCarousel = () => {
  return (
    <div className="carousel-container">
      <Carousel
        dots={true}
        infinite={false}  // Turn off the infinite loop feature
        slidesToShow={1.05}
        slidesToScroll={1}
        className="full-width-carousel"
        draggable
        arrows
      >
        <div className="carousel-slide" key="slide-1">
          <img src={slide1} alt="Slide 1" />

          <div className="carousel-text">Welcome to phorid.net</div>
          <div className="carousel-text-two">Dedicated to the most diverse family of insects</div>

        </div>
        <div className="carousel-slide" key="slide-2">
          {/* <img src={slide2} alt="Slide 2" /> */}
          <video src={myrioFeeding} autoPlay loop muted/>
          <div className="carousel-text white-title">Featured Taxon Pages</div>
          <div className='carousel-button'>
            <Button 
              type="default"
              variant="outlined"
              size="large"
            >
              Apocephalus
            </Button>
            <Button 
              type="default"
              variant="outlined"
              size="large"

            >
              Dohrniphora
            </Button>
            <Button 
              type="default"
              variant="outlined"
              size="large"

            >
              Megaselia
            </Button>
            <Button 
              type="default"
              variant="outlined"
              size="large"

            >
              Melaloncha
            </Button>
            <Button 
              type="default"
              variant="outlined"
              size="large"

            >
              Myriophora
            </Button>
            <Button 
              type="default"
              variant="outlined"
              size="large"

            >
              Coniceromyia
            </Button>
          </div>
        </div>
        <div className="carousel-slide" key="slide-3">
          <img src={malaiseTrap}alt="Slide 3" />
          <div className="carousel-text">Projects</div>
        </div>
        <div className="carousel-slide" key="slide-4">
          <img src={people} alt="Slide 4" />
          <div className="carousel-text">People</div>
        </div>
        <div className="carousel-slide" key="slide-5">
          <img src={vestigipoda} alt="Slide 5" />
          <div className="carousel-text">Is that really a fly?</div>
        </div>
      </Carousel>
    </div>
  );
};

export default CustomCarousel;
