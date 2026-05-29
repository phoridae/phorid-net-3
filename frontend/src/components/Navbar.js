import React from "react";
import { NavLink } from "react-router-dom";
import "./Navbar.css";
import logoImage from "../assets/images/Megaselia_logo.jpg";
import { FaUser } from "react-icons/fa";
import { useAuth } from "../auth/AuthContext";
import { Popconfirm, message } from "antd";

function Navbar() {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
      message.success("Signed out");
    } catch (err) {
      console.error(err);
      message.error("Sign out failed");
    }
  };

  const userLabel = user?.displayName || user?.email || "Admin";

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <NavLink to="/" className="logo">
          <img src={logoImage} alt="Phoridae logo" />
        </NavLink>
      </div>

      <div className="navbar-center">
        <a
          href="https://phorid.net/pcat"
          className="nav-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          PCAT
        </a>

        <NavLink to="/phoridae/photo-gallery" className="nav-link">
          Gallery
        </NavLink>

        <NavLink to="/phoridae/identification-keys" className="nav-link">
          Keys
        </NavLink>

        <NavLink to="/phoridae/more-resources" className="nav-link">
          Projects
        </NavLink>

        <NavLink to="/phoridae/people" className="nav-link">
          People
        </NavLink>

        <NavLink to="/phoridae/about" className="nav-link">
          About
        </NavLink>

        {user && (
          <NavLink to="/admin" className="nav-link">
            Admin
          </NavLink>
        )}
      </div>

      <div className="navbar-right">
        {user ? (
          <>
            <span className="username-label">Signed in as {userLabel}</span>

            <Popconfirm
              title="Sign out?"
              description="Are you sure you want to sign out?"
              onConfirm={handleLogout}
              okText="Sign out"
              cancelText="Cancel"
              placement="bottomRight"
              okButtonProps={{ danger: true }}
            >
              <button
                className="user-icon-button"
                title="Sign out"
                type="button"
              >
                <FaUser size={18} />
                <span>Sign out</span>
              </button>
            </Popconfirm>
          </>
        ) : (
          <NavLink
            to="/login"
            className="user-icon-button"
            title="Sign in"
          >
            <FaUser size={18} />
            <span>Sign in</span>
          </NavLink>
        )}
      </div>
    </nav>
  );
}

export default Navbar;