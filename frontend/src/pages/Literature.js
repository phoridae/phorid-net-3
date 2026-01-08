import { useState } from "react";
import { Table, Button, Input } from "antd";
import { searchDropbox, openDropboxPdf } from "../utils/api/dropbox";

const { Search } = Input;

export default function Literature() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  async function runSearch(query) {
    try {
      setLoading(true);
      const results = await searchDropbox(query);
      setData(results);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function openPdf(id) {
    try {
      const link = await openDropboxPdf(id);
      window.open(link, "_blank", "noopener");
    } catch (err) {
      console.error(err);
    }
  }

  const columns = [
    {
      title: "Paper",
      dataIndex: "name",
      key: "name",
    },
    {
      title: "Action",
      key: "action",
      render: (_, record) => (
        <a onClick={() => openPdf(record.id)}>
          Download PDF
        </a>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2>Literature</h2>

      <Search
        placeholder="Search papers (filename or text)"
        onSearch={runSearch}
        enterButton
        style={{ maxWidth: 500, marginBottom: 16 }}
      />

      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
      />
    </div>
  );
}
