import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';
import logo from '../assets/images/melaloncha_face_illustration.png';

const Footer = () => {
  return (
    <footer className="footer">
      
      {/* Top navigation links */}
      <nav className="footer-links">
        <a
          href="https://phorid.net/pcat"
          className="nav-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          PCAT
        </a>
        <Link to="/phoridae/photo-gallery">Gallery</Link>
        <Link to="/phoridae/identification-keys">Keys</Link>
        <Link to="/phoridae/more-resources">Projects</Link>
        <Link to="/phoridae/people">People</Link>
        <Link to="phoridae/about">About</Link>
      </nav>

      {/* Center logo */}
      <div className="footer-logo">
        <img src={logo} alt="Melaloncha illustration" />
      </div>

      {/* Bottom bar */}
      <div className="footer-bottom">
        <div className="footer-text">
          © 2026 <strong>phorid.net</strong>
        </div>

        <div className="social-links">
          <a href="https://github.com/phoridae/phorid-net-3" target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
