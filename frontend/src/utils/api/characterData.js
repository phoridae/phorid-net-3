export async function fetchCharacterData(label) {
    try {
      const response = await fetch(`https://johnhash.me/flies/keyCharacters?selectedGenus=${label}`);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Failed to fetch character data:", error);
    }
}

//mock data for now
// const data = {
//     "pairs_of_supraantennals": [
//         "0",
//         "1"
//     ],
//     "eye_size": [
//         "normal",
//         "reduced"
//     ],
//     "costal_vein": [
//         "slightly inflated",
//         "normal"
//     ],
//     "vein_sc": [
//         "fades before R1",
//         "reaches R1"
//     ],
//     "baz": [
//         "yellow",
//         "brown"
//     ],
//     "foo": [
//         "yellow",
//         "brown"
//     ]
// }