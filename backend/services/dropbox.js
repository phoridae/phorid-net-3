const DROPBOX_API = "https://api.dropboxapi.com/2";
const DROPBOX_OAUTH = "https://api.dropboxapi.com/oauth2/token";
const DROPBOX_SEARCH_PATH = process.env.DROPBOX_SEARCH_PATH || "";

let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

async function getDropboxAccessToken() {
  if (
    process.env.DROPBOX_REFRESH_TOKEN &&
    process.env.DROPBOX_APP_KEY &&
    process.env.DROPBOX_APP_SECRET
  ) {
    const now = Date.now();

    if (cachedAccessToken && now < cachedAccessTokenExpiresAt - 60_000) {
      return cachedAccessToken;
    }

    const basicAuth = Buffer.from(
      `${process.env.DROPBOX_APP_KEY}:${process.env.DROPBOX_APP_SECRET}`
    ).toString("base64");

    const response = await fetch(DROPBOX_OAUTH, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: process.env.DROPBOX_REFRESH_TOKEN,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Dropbox token refresh failed ${response.status}: ${text}`);
    }

    const data = await response.json();

    cachedAccessToken = data.access_token;
    cachedAccessTokenExpiresAt = Date.now() + Number(data.expires_in || 14400) * 1000;

    return cachedAccessToken;
  }

  if (!process.env.DROPBOX_TOKEN) {
    throw new Error(
      "Missing Dropbox credentials. Set either DROPBOX_TOKEN or DROPBOX_APP_KEY, DROPBOX_APP_SECRET, and DROPBOX_REFRESH_TOKEN."
    );
  }

  return process.env.DROPBOX_TOKEN;
}

async function dropboxFetch(endpoint, body) {
  const accessToken = await getDropboxAccessToken();

  const response = await fetch(`${DROPBOX_API}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
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