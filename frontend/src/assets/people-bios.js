const peopleBios = [
  {
    id: "brown",
    name: "Brian V. Brown",
    title: "Curator of Entomology",
    affiliation: "Natural History Museum of Los Angeles County",
    bio: `
Brian V. Brown is a specialist on scuttle flies (Diptera: Phoridae) and one of the
leading authorities on the family. He has described hundreds of species from
around the world and has worked extensively on phorid taxonomy, systematics,
behavior, and biodiversity, with a particular emphasis on the Neotropical Region.
    `.trim(),
    image: `${process.env.PUBLIC_URL}/images/people/Brian-Brown-5.webp`,
    links: [
      { label: "Blog", url: "https://flyobsession.net/" },
      { label: "Google Scholar", url: "https://scholar.google.com/citations?hl=en&user=VOfWJhIAAAAJ&view_op=list_works&sortby=pubdate" },
    ],
  },

  {
    id: "hartop",
    name: "Emily Anne Hartop",
    title: "Associate Professor & Biodiversity Scientist",
    affiliation: "NTNU University Museum, Norway",
    bio: `
Emily Hartop is a biodiversity scientist specializing in scuttle flies (Diptera:
Phoridae) and other hyperdiverse insect groups. Her research integrates molecular
and morphological approaches to taxonomy, species discovery, and natural history,
including work on large-scale biodiversity projects such as BioSCAN.
    `.trim(),
    image: `${process.env.PUBLIC_URL}/images/people/eahartop.jpg`,
    links: [
      { label: "NTNU Profile", url: "https://www.ntnu.edu/employees/emily.hartop" },
      { label: "Google Scholar", url: "https://scholar.google.com/citations?hl=en&user=X0SmxVkAAAAJ&view_op=list_works&sortby=pubdate"}
    ],
  },

  {
    id: "ament",
    name: "Danilo César Ament",
    title: "Researcher in Diptera Systematics",
    affiliation: "University of São Paulo, Brazil",
    bio: `
Danilo César Ament is a researcher whose work focuses on the taxonomy,
systematics, and biodiversity of Phoridae (Diptera), with an emphasis on Brazilian
fauna and patterns of diversity and distribution within the family.
    `.trim(),
    image: `${process.env.PUBLIC_URL}/images/people/melaloncha_face_illustration.png`,
    links: [
      { label: "Google Scholar", url: "https://scholar.google.com/citations?hl=pt-BR&user=CVBbKQsAAAAJ&view_op=list_works&sortby=pubdate"}
    ],
  },

  {
    id: "pereira",
    name: "Thalles Pereira",
    title: "Diptera Researcher",
    affiliation: "Brazil",
    bio: `
Thalles Pereira is a researcher involved in studies on the diversity and
distribution of Brazilian Phoridae (Diptera), including co-authorship on work
addressing taxonomic knowledge and biodiversity of the group.
    `.trim(),
    image: `${process.env.PUBLIC_URL}/images/people/melaloncha_face_illustration.png`,
    links: [
      { label: "Google Scholar", url: "https://scholar.google.co.uk/citations?hl=en&user=lK4o1jQAAAAJ&view_op=list_works&sortby=pubdate"}
    ],
  },

  {
    id: "hash",
    name: "John M Hash",
    title: "Project Developer & Research Collaborator",
    affiliation: "Phorid.net",
    bio: `
John Hash is a developer and research collaborator contributing to the technical
infrastructure, data systems, and tools that support phorid research, data
integration, and public-facing resources on Phoridae.
    `.trim(),
    image: `${process.env.PUBLIC_URL}/images/people/JohnHashUCprofile.jpg`,
    links: [
      { label: "Website", url: "https://www.johnhash.me" },
      { label: "Google Scholar", url: "https://scholar.google.com/citations?hl=en&user=L3eJEPwAAAAJ&view_op=list_works&sortby=pubdate"}
    ],
  },
];

export default peopleBios;
