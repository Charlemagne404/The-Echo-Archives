export const creatorVerificationModeConfig = {
  heroDescription: "Listeners and creators help keep The Echo Archives accurate and complete. Submit shows, suggest corrections, share listener reviews, or request creator verification.",
  cardTitle: "Creator verification",
  cardDescription: "Confirm association or official facts.",
  cardIcon: "mode-creator",
  introTitle: "Creator verification",
  introDescription: "Choose the strongest proof path and describe the factual details to confirm or update.",
  introIcon: "shield",
  submitLabel: "Request creator verification",
  footerNote: "Next: association evidence is checked; follow-up may be needed.",
  steps: [
    { title: "Request", body: "Select the show, your role, and a proof method." },
    { title: "Verify", body: "We check association and may follow up for clarification." },
    { title: "Update", body: "Accepted factual metadata is updated manually." },
  ],
  railCards: [
    {
      title: "After you submit",
      icon: "clock",
      accent: true,
      items: [
        { title: "Verify", description: "We check your association using the selected proof method.", icon: "shield", accent: true },
        { title: "Follow up", description: "We may contact you if the evidence needs clarification.", icon: "team" },
        { title: "Update", description: "Accepted factual metadata is applied manually.", icon: "document" },
      ],
    },
    {
      title: "Verification boundaries",
      icon: "info",
      description: "Verification means factual association was checked.",
      items: [
        { title: "Use the strongest official channel", description: "Official-domain email, websites, profiles, and press kits are preferred.", icon: "link", accent: true },
        { title: "Official links are optional", description: "Add them only when they should be confirmed or updated.", icon: "check" },
        { title: "Ratings stay independent", description: "Verification does not imply endorsement or editorial control.", icon: "archive" },
      ],
      buttonLabel: "Ask the Archivist",
    },
  ],
};
