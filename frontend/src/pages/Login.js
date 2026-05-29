// src/pages/Login.js

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth } from "../firebase";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/admin");
    } catch (err) {
      console.error(err);
      setMessage("Sign in failed. Check your email and password.");
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      setMessage("Enter your email first, then click forgot password.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      await sendPasswordResetEmail(auth, email);
      setMessage("Password reset email sent.");
    } catch (err) {
      console.error(err);
      setMessage("Could not send password reset email.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: "60px auto" }}>
      <h2>Phorid.net Admin Sign In</h2>

      <form onSubmit={handleSubmit}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          type="email"
          autoComplete="email"
          required
          style={{ width: "100%", padding: 8, marginBottom: 12 }}
        />

        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          type="password"
          autoComplete="current-password"
          required
          style={{ width: "100%", padding: 8, marginBottom: 12 }}
        />

        <button type="submit" disabled={busy} style={{ width: "100%" }}>
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <button
        type="button"
        onClick={handlePasswordReset}
        disabled={busy}
        style={{
          width: "100%",
          marginTop: 12,
          background: "none",
          border: "none",
          textDecoration: "underline",
          cursor: "pointer",
        }}
      >
        Forgot password?
      </button>

      {message && (
        <p style={{ marginTop: 16 }}>
          {message}
        </p>
      )}

      <p style={{ marginTop: 24, color: "#666", fontSize: 14 }}>
        Admin access is limited to approved Phorid.net contributors.
      </p>
    </div>
  );
}

export default Login;