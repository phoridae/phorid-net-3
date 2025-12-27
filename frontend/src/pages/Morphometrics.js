import React, { useEffect, useRef, useState } from "react";
import wing from "../assets/images/MH1_1_M_globipyga_wing.jpg";

/**
 * Morphometrics – Simplified (no zoom/pan) // dummy commit
 * Click to add landmarks, drag to move, undo/redo, save/export/import.
 */

const SCHEME = { name: "Megaselia-16pt", version: 1, num_points: 32 };
const CODE = "MHS-TEST-0001";
const STORAGE_KEY = `lm:${CODE}:${SCHEME.name}@v${SCHEME.version}`;

const lineRules = {
  14: [4, 8],
  15: [4, 9],
  16: [4, 10],
  20: [2, 10],
  23: [1, 7],
  24: [1, 8],
  25: [1, 9],
  29: [7, 9],
  30: [7, 10],
};

async function apiLoad() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}
async function apiSave(points) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(points));
}

export default function Morphometrics() {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);

  const [imgSize, setImgSize] = useState({ w: 697, h: 522 });
  const [points, setPoints] = useState([]);
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const drag = useRef({ index: null });

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const onLoad = () => setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    if (img.complete) onLoad(); else img.onload = onLoad;
  }, []);

  useEffect(() => {
    (async () => {
      const saved = await apiLoad();
      if (saved) setPoints(saved);
    })();
  }, []);

  useEffect(() => { redraw(); }, [points, imgSize]);

  function pushUndo(snapshot) {
    const snap = snapshot ? JSON.parse(JSON.stringify(snapshot)) : JSON.parse(JSON.stringify(points));
    undoStack.current.push(snap);
    redoStack.current = [];
  }

  function redraw() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const img = imgRef.current;
    if (!canvas || !ctx || !img) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1;
    Object.entries(lineRules).forEach(([trigger, pair]) => {
      const t = parseInt(trigger, 10);
      if (points.length > t) {
        const [aIdx, bIdx] = pair;
        const a = points[aIdx];
        const b = points[bIdx];
        if (a && b) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    });

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      ctx.beginPath();
      ctx.fillStyle = "#ff2626";
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "12px Arial";
      ctx.fillStyle = "black";
      ctx.fillText(String(i + 1), p.x + 6, p.y - 6);
    }
  }

  function onMouseDown(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const idx = points.findIndex(p => Math.hypot(p.x - x, p.y - y) < 6);
    if (idx !== -1) {
      drag.current.index = idx;
      pushUndo();
    } else {
      const next = { i: points.length + 1, x, y };
      pushUndo();
      setPoints(prev => [...prev, next]);
    }
  }

  function onMouseMove(e) {
    if (drag.current.index == null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setPoints(prev => {
      const copy = prev.slice();
      copy[drag.current.index] = { ...copy[drag.current.index], x, y };
      return copy;
    });
  }

  function onMouseUp() { drag.current.index = null; }

  useEffect(() => {
    function onKey(e) {
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && e.key.toLowerCase() === "z" && !e.shiftKey) {
        const snap = undoStack.current.pop();
        if (snap) { redoStack.current.push(points); setPoints(snap); }
      } else if (cmd && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        const snap = redoStack.current.pop();
        if (snap) { undoStack.current.push(points); setPoints(snap); }
      } else if (e.key === "Backspace" || e.key === "Delete") {
        pushUndo();
        setPoints(prev => prev.slice(0, -1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [points]);

  function handleUndo() { const snap = undoStack.current.pop(); if (snap) { redoStack.current.push(points); setPoints(snap); } }
  function handleRedo() { const snap = redoStack.current.pop(); if (snap) { undoStack.current.push(points); setPoints(snap); } }
  function handleClear() { pushUndo(); setPoints([]); }
  async function handleSave() { await apiSave(points); alert("Saved locally (swap for DB later)"); }

  function handleExportJSON() {
    const payload = { code: CODE, scheme: SCHEME.name, points };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${CODE}_landmarks.json`; a.click(); URL.revokeObjectURL(url);
  }

  function handleImportJSON(e) {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result));
        if (Array.isArray(obj.points)) setPoints(obj.points);
      } catch { alert("Failed to parse JSON"); }
    };
    reader.readAsText(file);
  }

  const btn = { marginRight: 8, padding: "6px 12px", background: "#0077cc", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" };

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "2rem", padding: "1rem" }}>
      <div>
        <div style={{ marginBottom: 12 }}>
          <button onClick={handleUndo} style={btn}>Undo</button>
          <button onClick={handleRedo} style={btn}>Redo</button>
          <button onClick={handleClear} style={btn}>Clear</button>
          <button onClick={handleSave} style={btn}>Save</button>
          <button onClick={handleExportJSON} style={btn}>Export JSON</button>
          <label style={{ ...btn, display: "inline-block" }}>
            Import JSON
            <input type="file" accept="application/json" onChange={handleImportJSON} style={{ display: "none" }} />
          </label>
        </div>

        <canvas
          ref={canvasRef}
          width={imgSize.w}
          height={imgSize.h}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          style={{ border: "1px solid #c3c3c3", cursor: drag.current.index != null ? "grabbing" : "crosshair" }}
        />
        <img ref={imgRef} src={wing} alt="wing" style={{ display: "none" }} />
      </div>

      <div style={{ fontFamily: "monospace", maxHeight: imgSize.h, overflow: "auto" }}>
        <div>
          <strong>{CODE}</strong> – {SCHEME.name}@v{SCHEME.version}
        </div>
        {points.map((p, i) => (
          <div key={i}>{i + 1}: ({p.x.toFixed(2)}, {p.y.toFixed(2)})</div>
        ))}
      </div>
    </div>
  );
}
