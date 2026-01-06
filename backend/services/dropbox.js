async function searchDropbox(query, path = "") {
  const response = await fetch(
    "https://api.dropboxapi.com/2/files/search_v2",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DROPBOX_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        options: {
          path,
          file_extensions: ["pdf"],
          max_results: 50,
        },
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }

  const data = await response.json();

  return (data.matches || []).map(m => ({
    id: m.metadata.metadata.id,
    name: m.metadata.metadata.name,
    path: m.metadata.metadata.path_display,
    snippet: m.context?.text || "",
  }));
}

async function getTemporaryLink(dropboxPath) {
  const response = await fetch(
    "https://api.dropboxapi.com/2/files/get_temporary_link",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DROPBOX_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path: dropboxPath }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }

  const data = await response.json();
  return data.link;
}

module.exports = {
  searchDropbox,
  getTemporaryLink
};
