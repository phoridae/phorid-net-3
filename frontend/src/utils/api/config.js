const API_ROOT =
  process.env.REACT_APP_API_ROOT ||
  (process.env.NODE_ENV === "development"
    ? "http://localhost:8080"
    : "https://api.phorid.net");

export const API_BASE = API_ROOT.replace(/\/$/, "");

export function apiUrl(path) {
  const cleanPath = String(path).replace(/^\//, "");
  return `${API_BASE}/${cleanPath}`;
}