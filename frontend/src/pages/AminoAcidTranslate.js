import React, { useState } from "react";
import { Typography, Card, Input, Checkbox, Button, Space, Divider } from "antd";
import "./AminoAcidTranslate.css";

const { Title, Text } = Typography;
const { TextArea } = Input;

/* ===========================
   Codon Libraries
=========================== */

const CODONS_STANDARD = {
  TTT: 'Phe', TTC: 'Phe', TTA: 'Leu', TTG: 'Leu',
  CTT: 'Leu', CTC: 'Leu', CTA: 'Leu', CTG: 'Leu',
  ATT: 'Ile', ATC: 'Ile', ATA: 'Ile',
  ATG: 'Met',
  GTT: 'Val', GTC: 'Val', GTA: 'Val', GTG: 'Val',
  TCT: 'Ser', TCC: 'Ser', TCA: 'Ser', TCG: 'Ser',
  CCT: 'Pro', CCC: 'Pro', CCA: 'Pro', CCG: 'Pro',
  ACT: 'Thr', ACC: 'Thr', ACA: 'Thr', ACG: 'Thr',
  GCT: 'Ala', GCC: 'Ala', GCA: 'Ala', GCG: 'Ala',
  TAT: 'Tyr', TAC: 'Tyr',
  TAA: 'XXX', TAG: 'XXX',
  CAT: 'His', CAC: 'His',
  CAA: 'Gin', CAG: 'Gin',
  AAT: 'Asn', AAC: 'Asn',
  AAA: 'Lys', AAG: 'Lys',
  GAT: 'Asp', GAC: 'Asp',
  GAA: 'Glu', GAG: 'Glu',
  TGT: 'Cys', TGC: 'Cys',
  TGA: 'XXX',
  TGG: 'Trp',
  CGT: 'Arg', CGC: 'Arg', CGA: 'Arg', CGG: 'Arg',
  AGT: 'Ser', AGC: 'Ser',
  AGA: 'Arg', AGG: 'Arg',
  GGT: 'Gly', GGC: 'Gly', GGA: 'Gly', GGG: 'Gly'
};

const CODONS_INVERT_MITO = {
  ...CODONS_STANDARD,
  ATA: 'Met',
  TGA: 'Trp',
  AGA: 'Ser',
  AGG: 'Ser'
};

/* ===========================
   Helpers
=========================== */

const splitCodons = (seq, frame) => {
  const codons = [];
  for (let i = frame; i + 2 < seq.length; i += 3) {
    codons.push(seq.substring(i, i + 3));
  }
  return codons;
};

const translateFrame = (seq, frame, table) =>
  splitCodons(seq, frame)
    .map(c => table[c] || "---")
    .join(" ");

/* ===========================
   Component
=========================== */

export default function AminoAcidTranslate() {
  const [dna, setDna] = useState("");
  const [invertMito, setInvertMito] = useState(false);
  const [results, setResults] = useState(null);

  const handleTranslate = () => {
    const cleanSeq = dna.toUpperCase().replace(/[^ATCG]/g, "");
    const table = invertMito ? CODONS_INVERT_MITO : CODONS_STANDARD;

    setResults({
      frame1: translateFrame(cleanSeq, 0, table),
      frame2: translateFrame(cleanSeq, 1, table),
      frame3: translateFrame(cleanSeq, 2, table)
    });
  };

  return (
    <div className="amino-page">
      <Title level={2}>Amino Acid Translate Tool</Title>

      <Card>
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <TextArea
            rows={6}
            value={dna}
            onChange={(e) => setDna(e.target.value)}
            placeholder="Enter DNA sequence here (A, T, C, G)"
          />

          <Space>
            <Checkbox
              checked={invertMito}
              onChange={(e) => setInvertMito(e.target.checked)}
            >
              Invertebrate mitochondrial code
            </Checkbox>

            <Button type="primary" onClick={handleTranslate}>
              Translate
            </Button>
          </Space>
        </Space>
      </Card>

      {results && (
        <Card style={{ marginTop: 24 }}>
          <Title level={4}>Results</Title>

          <Divider />

          <Text strong>Frame 1</Text>
          <div className="frame-output">{results.frame1}</div>

          <Text strong>Frame 2</Text>
          <div className="frame-output">{results.frame2}</div>

          <Text strong>Frame 3</Text>
          <div className="frame-output">{results.frame3}</div>
        </Card>
      )}

      <Text type="secondary" style={{ display: "block", marginTop: 24 }}>
        Multiple sequence submission coming soon.
      </Text>
    </div>
  );
}
