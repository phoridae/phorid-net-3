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
    await logout();
    message.success("Signed out");
  };


  return (
    <nav className="navbar">
      <div className="navbar-left">
        <NavLink to="/" className="logo">
          <img src={logoImage} alt="Phoridae logo" />
        </NavLink>
      </div>

      <div className="navbar-center">
        <NavLink to="/phoridae/people" className="nav-link">
          People
        </NavLink>
        <NavLink to="/phoridae/projects" className="nav-link">
          Projects
        </NavLink>
        <NavLink to="/phoridae/photoGallery" className="nav-link">
          Gallery
        </NavLink>
        <NavLink to="/phoridae/identificationKeys" className="nav-link">
           Keys
        </NavLink>
        <NavLink to="/phoridae/newsletters" className="nav-link">
          Newsletters
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
            <span className="username-label">Hello, {user.username}</span>

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
                <FaUser size={24} />
              </button>
            </Popconfirm>
          </>
        ) : (
          <NavLink
            to="/login"
            className="user-icon-button"
            title="Login"
          >
            <FaUser size={24} />
          </NavLink>
        )}
      </div>
    </nav>
  );
}

export default Navbar;
