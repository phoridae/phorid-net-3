const DROPBOX_API = "https://api.dropboxapi.com/2";
const DROPBOX_SEARCH_PATH = process.env.DROPBOX_SEARCH_PATH || "";

async function dropboxFetch(endpoint, body) {
  if (!process.env.DROPBOX_TOKEN) {
    throw new Error("Missing DROPBOX_TOKEN");
  }

  const response = await fetch(`${DROPBOX_API}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.DROPBOX_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Dropbox API error ${response.status}: ${text}`);
  }

  return response.json();
}

async function searchDropbox(query, path = DROPBOX_SEARCH_PATH) {
  const data = await dropboxFetch("/files/search_v2", {
    query,
    options: {
      path,
      file_extensions: ["pdf"],
      max_results: 50,
    },
  });

  return (data.matches || [])
    .map((m) => {
      const metadata = m.metadata?.metadata;

      if (!metadata || metadata[".tag"] !== "file") {
        return null;
      }

      return {
        id: metadata.id,
        name: metadata.name,
        path: metadata.path_display,
        snippet: m.context?.text || "",
      };
    })
    .filter(Boolean);
}

async function getTemporaryLink(dropboxPath) {
  const data = await dropboxFetch("/files/get_temporary_link", {
    path: dropboxPath,
  });

  return data.link;
}

module.exports = {
  searchDropbox,
  getTemporaryLink,
};