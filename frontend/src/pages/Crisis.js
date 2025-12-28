import { Table, Typography } from "antd";
import crisisPDF from "../assets/CrisisNeotrDipt.pdf"

const { Title, Paragraph, Link } = Typography;

/* =========================
   TABLE 1 — ORDERS (TRAPS 1–3)
========================= */

const ordersByTrap = [
  { order: "Diptera", t1: 4082, t2: 734, t3: 680 },
  { order: "Hymenoptera", t1: 380, t2: 45, t3: 260 },
  { order: "Coleoptera", t1: 52, t2: 43, t3: 68 },
  { order: "Collembola", t1: 47, t2: 14, t3: 13 },
  { order: "Homoptera", t1: 35, t2: 35, t3: 29 },
  { order: "Psocoptera", t1: 24, t2: 9, t3: 5 },
  { order: "Hemiptera", t1: 19, t2: 11, t3: 2 },
  { order: "Orthoptera", t1: 4, t2: 10, t3: 5 },
  { order: "Blattodea", t1: 1, t2: 3, t3: 1 },
  { order: "Thysanoptera", t1: 1, t2: null, t3: null },
  { order: "Neuroptera", t1: 1, t2: null, t3: null },
  { order: "Spider", t1: null, t2: 1, t3: 1 },
];

/* =========================
   TABLE 2 — DIPTERA FAMILIES (ALL TRAPS)
========================= */

const dipteraFamiliesByTrap = [
  { family: "Cecidomyiidae", t1: 1588, t2: 306, t3: 189, t4: 559 },
  { family: "Sciaridae", t1: 908, t2: 153, t3: 40, t4: 92 },
  { family: "Ceratopogonidae", t1: 694, t2: 57, t3: 14, t4: 103 },
  { family: "Chironomidae", t1: 351, t2: 30, t3: 5, t4: 74 },
  { family: "Phoridae", t1: 119, t2: 10, t3: 191, t4: 17 },
  { family: "Mycetophilidae", t1: 69, t2: 56, t3: 5, t4: 5 },
  { family: "Culicidae", t1: 63, t2: 14, t3: null, t4: 7 },
  { family: "Psychodidae", t1: 55, t2: 33, t3: 13, t4: 9 },
  { family: "Chloropidae", t1: 53, t2: null, t3: 33, t4: 7 },
  { family: "Dolichopodidae", t1: 45, t2: 3, t3: 15, t4: 24 },
  { family: "Tipulidae", t1: 41, t2: 43, t3: 2, t4: 3 },
  { family: "Sphaeroceridae", t1: 24, t2: 2, t3: 30, t4: 206 },
  { family: "Drosophilidae", t1: 14, t2: 13, t3: 5, t4: 4 },
  { family: "Syrphidae", t1: 12, t2: 2, t3: 3, t4: 2 },
  { family: "Empididae", t1: 7, t2: 1, t3: 4, t4: 16 },
  { family: "Muscidae", t1: 7, t2: 1, t3: 17, t4: null },
  { family: "Pseudopomyzidae", t1: 6, t2: null, t3: null, t4: 1 },
  { family: "Ephydridae", t1: 5, t2: 1, t3: 2, t4: 9 },
  { family: "Milichiidae", t1: 4, t2: 1, t3: 12, t4: 2 },
  { family: "Sarcophagidae", t1: 3, t2: 1, t3: 4, t4: null },
  { family: "Tabanidae", t1: 3, t2: 2, t3: 3, t4: null },
  { family: "Bibionidae", t1: 2, t2: null, t3: null, t4: 1 },
  { family: "Clusiidae", t1: 2, t2: null, t3: 3, t4: null },
  { family: "Tachinidae", t1: 2, t2: 1, t3: 29, t4: 3 },
  { family: "Bombyliidae", t1: 1, t2: null, t3: null, t4: null },
  { family: "Inbiomyiidae", t1: 1, t2: null, t3: null, t4: null },
  { family: "Ulidiidae", t1: 1, t2: null, t3: 6, t4: null },
  { family: "Richardiidae", t1: 1, t2: null, t3: null, t4: 1 },
  { family: "Tephritidae", t1: 1, t2: null, t3: null, t4: 1 },
  { family: "Micropezidae", t1: null, t2: null, t3: 2, t4: null },
  { family: "Lauxaniidae", t1: null, t2: null, t3: 2, t4: null },
  { family: "Pipunculidae", t1: null, t2: null, t3: 2, t4: 1 },
  { family: "Agromyzidae", t1: null, t2: null, t3: 2, t4: 2 },
];

/* =========================
   PAGE COMPONENT
========================= */

export default function Crisis() {
  return (
    <div style={{ padding: "24px 32px", maxWidth: 1200 }}>
      <Title level={2}>Crisis in Neotropical Dipterology</Title>

      <Paragraph>
        Diptera are extraordinarily diverse in the Neotropical Region, yet
        remain poorly known. Malaise trap samples from four sites demonstrate
        overwhelming dominance of Diptera, contrasted with extremely low levels
        of taxonomic activity and available expertise.
      </Paragraph>

      <Paragraph>
        <a href={crisisPDF} target="_blank" rel="noReferrer">
          Malaise Trap Catches and the Crisis in Neotropical Dipterology (PDF)
        </a>
      </Paragraph>

      <Title level={4}>Order Composition by Trap</Title>

      <Table
        bordered
        size="small"
        pagination={false}
        dataSource={ordersByTrap}
        rowKey="order"
        columns={[
            {
                title: "Order",
                dataIndex: "order",
                fixed: "left",
                sorter: (a, b) => a.order.localeCompare(b.order),
            },
            {
                title: "Tambopata (Trap 1)",
                dataIndex: "t1",
                align: "right",
                sorter: (a, b) => (a.t1 ?? 0) - (b.t1 ?? 0),
            },
            {
                title: "Tambopata – Suspended (Trap 2)",
                dataIndex: "t2",
                align: "right",
                sorter: (a, b) => (a.t2 ?? 0) - (b.t2 ?? 0),
            },
            {
                title: "Rios Paraisos (Trap 3)",
                dataIndex: "t3",
                align: "right",
                sorter: (a, b) => (a.t3 ?? 0) - (b.t3 ?? 0),
            },
        ]}
      />

      <Paragraph style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
        Order-level composition was recorded for Traps 1–3 only. Trap 4 data
        consist solely of Diptera family-level identifications.
      </Paragraph>

      <Title level={4} style={{ marginTop: 32 }}>
        Diptera Family Composition by Trap
      </Title>

      <Table
        bordered
        size="small"
        pagination={ false }
        dataSource={dipteraFamiliesByTrap}
        rowKey="family"
        columns={[
            {
                title: "Diptera Family",
                dataIndex: "family",
                fixed: "left",
                sorter: (a, b) => a.family.localeCompare(b.family),
            },
            {
                title: "Tambopata (Trap 1)",
                dataIndex: "t1",
                align: "right",
                sorter: (a, b) => (a.t1 ?? 0) - (b.t1 ?? 0),
            },
            {
                title: "Tambopata – Suspended (Trap 2)",
                dataIndex: "t2",
                align: "right",
                sorter: (a, b) => (a.t2 ?? 0) - (b.t2 ?? 0),
            },
            {
                title: "Rios Paraisos (Trap 3)",
                dataIndex: "t3",
                align: "right",
                sorter: (a, b) => (a.t3 ?? 0) - (b.t3 ?? 0),
            },
            {
                title: "Rurrenabaque (Trap 4)",
                dataIndex: "t4",
                align: "right",
                sorter: (a, b) => (a.t4 ?? 0) - (b.t4 ?? 0),
            },
        ]}

      />
    </div>
  );
}
