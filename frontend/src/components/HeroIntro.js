import React, { useEffect, useState } from "react";
import "./HeroIntro.css";
import myrioFeeding from "../assets/images/myriophora_feeding.mp4";

const HeroIntro = () => {
  const [showVideo, setShowVideo] = useState(false);
  const [lightText, setLightText] = useState(false);

  useEffect(() => {
    // When the video fades in
    const videoTimer = setTimeout(() => {
      setShowVideo(true);
    }, 2500);

    // Slightly after video begins fading, switch text to white
    const textTimer = setTimeout(() => {
      setLightText(true);
    }, 3000);

    return () => {
      clearTimeout(videoTimer);
      clearTimeout(textTimer);
    };
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
        <div className={`hero-title ${lightText ? "light" : ""}`}>
          Welcome to phorid.net
        </div>
        <div className={`hero-subtitle ${lightText ? "light" : ""}`}>
          Dedicated to the most diverse family of insects
        </div>
      </div>
    </div>
  );
};

export default HeroIntro;
