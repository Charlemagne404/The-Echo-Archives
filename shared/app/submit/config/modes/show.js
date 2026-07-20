export const showModeConfig = {
  heroDescription: "Choose the right path to help keep the archive accurate, useful, and easy to discover.",
  cardTitle: "Submit a new show",
  cardDescription: "Not listed in the archive yet.",
  cardIcon: "mode-show",
  introTitle: "New show",
  introDescription: "Start with the title and one reliable source. The importer can enrich the rest.",
  introIcon: "document",
  submitLabel: "Submit new show",
  footerNote: "Next: archive screening and duplicate review.",
  steps: [
    { title: "Screen", body: "We check scope and possible duplicates." },
    { title: "Enrich", body: "Accepted submissions enter the protected importer for source-backed facts." },
    { title: "Approve", body: "A maintainer separately reviews and approves publication." },
  ],
  railCards: [
    {
      title: "After you submit",
      icon: "clock",
      accent: true,
      items: [
        { title: "Screen", description: "We check archive scope and possible duplicates.", icon: "check", accent: true },
        { title: "Enrich", description: "The protected importer gathers source-backed facts.", icon: "spark" },
        { title: "Approve", description: "A maintainer must separately approve publication.", icon: "shield" },
      ],
    },
    {
      title: "Helpful details",
      icon: "clipboard",
      description: "A title and reliable URL are enough to begin.",
      items: [
        { title: "Prefer an RSS feed or official site", description: "These give the importer the strongest identity evidence.", icon: "link", accent: true },
        { title: "Unknown is valid", description: "Leave optional facts blank instead of guessing.", icon: "info" },
        { title: "Editorial independence", description: "Inclusion never buys or changes an archive rating.", icon: "archive" },
      ],
      buttonLabel: "Ask the Archivist",
    },
  ],
};
