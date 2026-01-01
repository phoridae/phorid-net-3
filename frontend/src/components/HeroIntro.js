import React, { useEffect, useState } from "react";
import "./HeroIntro.css";
import myrioFeeding from "../assets/images/myriophora_feeding.mp4";

const HeroIntro = () => {
  const [showVideo, setShowVideo] = useState(false);

  useEffect(() => {
    // Delay before video fades in
    const timer = setTimeout(() => {
      setShowVideo(true);
    }, 2500); // adjust timing as desired

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="hero-container">
      {/* VIDEO BACKGROUND */}
      <video
        className={`hero-video ${showVideo ? "visible" : ""}`}
        src={myrioFeeding}
        autoPlay
        loop
        muted
        playsInline
      />

      {/* OVERLAY TEXT */}
      <div className="hero-overlay">
        <div className="hero-title">Welcome to phorid.net</div>
        <div className="hero-subtitle">
          Dedicated to the most diverse family of insects
        </div>
      </div>
    </div>
  );
};

export default HeroIntro;
