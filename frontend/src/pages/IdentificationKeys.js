import React, { useState, useMemo } from 'react';
import './IdentificationKeys.css';
import { fetchCharacterData, fetchTaxonData } from '../utils/api';
import { Button, Popover, Col, Row, Carousel } from 'antd';
import mainImage from '../assets/images/taxonomy-girl-at-microscope.png';
import fallbackHabitus from '../assets/images/melaloncha_face_illustration.png'; // fallback if remote missing

const pretty = (s) => s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

/**
 * Character-state image candidates (prioritize spaces + .png, then underscore variants).
 * Character name must be lowercase in filenames.
 */
const buildCharacterImgCandidates = (genus, characterKey, option) => {
  const charWithSpaces = characterKey.replace(/_/g, ' ').toLowerCase(); // lowercase & spaces
  const charWithUnderscores = characterKey.toLowerCase();               // lowercase & underscores
  const optionText = String(option);

  const candidates = [
    `${genus} ${charWithSpaces} ${optionText}.png`,
    `${genus} ${charWithUnderscores} ${optionText}.png`,
    `${genus} ${charWithSpaces}.png`,
    `${genus} ${charWithUnderscores}.png`,
  ];

  return candidates.map(name => `https://johnhash.me/images/${encodeURIComponent(name)}`);
};

const CharacterStatePreview = ({ genus, characterKey, option, maxWidth = 260 }) => {
  const [index, setIndex] = useState(0);
  const candidates = useMemo(
    () => buildCharacterImgCandidates(genus, characterKey, option),
    [genus, characterKey, option]
  );

  const src = candidates[index];
  if (!src) {
    return (
      <div style={{ maxWidth }}>
        {pretty(characterKey)}: <strong>{option}</strong>
      </div>
    );
  }

  return (
    <div style={{ maxWidth }}>
      <img
        src={src}
        alt={`${genus} – ${pretty(characterKey)}: ${option}`}
        style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8 }}
        onError={() => setIndex(i => i + 1)}
      />
      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
        {pretty(characterKey)}: <strong>{option}</strong>
      </div>
    </div>
  );
};

/** NEW: Habitus image loader from your CDN with graceful fallback */
const TaxonHabitusImage = ({ filename, alt }) => {
  const [src, setSrc] = useState(
    filename ? `https://johnhash.me/images/${encodeURIComponent(filename)}` : fallbackHabitus
  );
  return (
    <img
      src={src}
      alt={alt}
      style={{ width: '100%', height: 'auto', display: 'block' }}
      onError={() => setSrc(fallbackHabitus)}
    />
  );
};

const IdentificationKeys = () => {
  const [selectedButton, setSelectedButton] = useState(null); // genus
  const [characterData, setCharacterData] = useState({});
  const [selectedValues, setSelectedValues] = useState({});
  const [taxonData, setTaxonData] = useState([]);
  const [filteredTaxonData, setFilteredTaxonData] = useState([]);
  const [selectedTaxa, setSelectedTaxa] = useState([]); // up to 3 ids
  const [hoveredKey, setHoveredKey] = useState(null);

  const handleButtonClick = async (buttonLabel) => {
    setSelectedButton(buttonLabel);
    const characters = await fetchCharacterData(buttonLabel);
    setCharacterData(characters || {});

    const taxonResponse = await fetchTaxonData();
    setTaxonData(taxonResponse || []);

    const initialSelectedValues = {};
    Object.keys(characters || {}).forEach(key => {
      initialSelectedValues[key] = 'all';
    });
    setSelectedValues(initialSelectedValues);

    setFilteredTaxonData(taxonResponse || []);
  };

  const handleRadioChange = (characterKey, value) => {
    setSelectedValues(prev => {
      const newSelectedValues = { ...prev, [characterKey]: value };

      const filteredData = (taxonData || []).filter(taxon =>
        Object.keys(newSelectedValues).every(key =>
          newSelectedValues[key] === 'all' || taxon[key] === newSelectedValues[key]
        )
      );

      setFilteredTaxonData(filteredData);
      return newSelectedValues;
    });
  };

  const handleTaxonClick = (taxonId) => {
    setSelectedTaxa(prev => {
      const next = [taxonId, ...prev.filter(id => id !== taxonId)];
      return next.slice(0, 3);
    });
  };

  const renderTaxonData = (taxonId) => {
    const taxon = taxonData.find(t => t.id === taxonId);

    if (!taxon) {
      return (
        <Col span={8} key={taxonId}>
          <p>Taxon not found</p>
        </Col>
      );
    }

    const excludedFields = [
      "id","species_id","family","genus","specific_epithet","year",
      "diagnosis","habitus_image","terminalia_lateral_image","terminalia_dorsal_image"
    ];

    return (
      <Col span={8} key={taxonId}>
        <div>
          <h2>{taxon.specific_epithet}</h2>

          <Carousel draggable>
            <div>
              {/* Use CDN filename from taxon.habitus_image */}
              <TaxonHabitusImage
                filename={taxon.habitus_image}
                alt={`${taxon.genus} ${taxon.specific_epithet} – habitus`}
              />
            </div>
            {/* Duplicate slides for now; later you can add terminalia images, etc. */}
            <div>
              <TaxonHabitusImage
                filename={taxon.habitus_image}
                alt={`${taxon.genus} ${taxon.specific_epithet} – habitus`}
              />
            </div>
            <div>
              <TaxonHabitusImage
                filename={taxon.habitus_image}
                alt={`${taxon.genus} ${taxon.specific_epithet} – habitus`}
              />
            </div>
          </Carousel>

          <h4>Diagnosis</h4>
          <div>{taxon.diagnosis || "No diagnosis available"}</div>
          <ul>
            {Object.entries(taxon)
              .filter(([key, value]) => !excludedFields.includes(key) && value)
              .map(([key, value]) => (
                <li
                  key={key}
                  className={hoveredKey === key ? "hovered" : ""}
                  onMouseEnter={() => setHoveredKey(key)}
                  onMouseLeave={() => setHoveredKey(null)}
                >
                  <strong>{pretty(key)}:</strong> {String(value)}
                </li>
              ))}
          </ul>
        </div>
      </Col>
    );
  };

  return (
    <div>
      <div className="jumbotron">
        <img src={mainImage} alt="Identification Keys" />
        <h1>Identification Keys</h1>
      </div>

      <div className="content">
        <p>1. Select a genus</p>
        <p>2. Toggle the characters</p>
        <p>3. Compare photos and descriptions of up to three taxa</p>

        <div className="button-container">
          <button onClick={() => handleButtonClick('Myriophora')}>Myriophora</button>
          <button onClick={() => handleButtonClick('Bus')}>Bus</button>
          <button onClick={() => handleButtonClick('Cus')}>Cus</button>
        </div>

        <div className="data-columns">
          {selectedButton && Object.entries(characterData).map(([key, options]) => (
            <div key={key} className="character-group">
              <h4>{pretty(key)}</h4>
              {options.map(option => (
                <label key={option}>
                  <Popover
                    placement="right"
                    title={`${pretty(key)}: ${option}`}
                    content={
                      <CharacterStatePreview
                        genus={selectedButton}
                        characterKey={key}
                        option={option}
                      />
                    }
                  >
                    <input
                      type="radio"
                      name={key}
                      value={option}
                      checked={selectedValues[key] === option}
                      onChange={() => handleRadioChange(key, option)}
                    />
                    {option}
                  </Popover>
                </label>
              ))}
              <label>
                <input
                  type="radio"
                  name={key}
                  value="all"
                  checked={selectedValues[key] === 'all'}
                  onChange={() => handleRadioChange(key, 'all')}
                />
                All
              </label>
            </div>
          ))}
        </div>

        <div className="taxon-list">
          <h3>Matching Taxa</h3>
          <ul>
            {filteredTaxonData.map(taxon => (
              <li key={taxon.id}>
                <Button type="primary" onClick={() => handleTaxonClick(taxon.id)}>
                  {taxon.specific_epithet}
                </Button>
              </li>
            ))}
          </ul>
        </div>

        <div className="results-comparator">
          <h3>Taxon Comparator</h3>
          <Row gutter={16}>
            {selectedTaxa.map(taxonId => renderTaxonData(taxonId))}
          </Row>
        </div>
      </div>
    </div>
  );
};

export default IdentificationKeys;
