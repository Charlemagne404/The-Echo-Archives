export const correctionModeConfig = {
  heroDescription: "Help keep The Echo Archives accurate and complete. Submit a show, send a correction, share a listener review, or request creator verification.",
  cardTitle: "Suggest a correction",
  cardDescription: "Fix factual data on an existing entry.",
  cardIcon: "mode-correction",
  introTitle: "Correction",
  introDescription: "Choose what is wrong and provide only the evidence that correction needs.",
  introIcon: "document",
  submitLabel: "Submit correction",
  footerNote: "Next: evidence is checked against the current archive entry.",
  steps: [
    { title: "Identify", body: "Select the entry and the exact kind of correction." },
    { title: "Verify", body: "We check the supplied evidence against official sources." },
    { title: "Update", body: "Accepted factual changes are applied manually." },
  ],
  railCards: [
    {
      title: "After you submit",
      icon: "clock",
      accent: true,
      items: [
        { title: "Identify", description: "The selected type sends the right evidence for review.", icon: "check", accent: true },
        { title: "Verify", description: "We compare the report with official sources.", icon: "link" },
        { title: "Update", description: "Accepted factual changes are applied manually.", icon: "document" },
      ],
    },
    {
      title: "Correction guidelines",
      icon: "clipboard",
      description: "Use this form for factual metadata, links, credits, status, or artwork.",
      items: [
        { title: "Be specific", description: "Choose the closest correction type and proposed value.", icon: "pencil", accent: true },
        { title: "Use official sources", description: "Sources are required when the fact cannot be checked directly.", icon: "shield" },
        { title: "Opinions stay separate", description: "Corrections do not change archive or listener ratings.", icon: "archive" },
      ],
      buttonLabel: "Ask the Archivist",
    },
  ],
};
