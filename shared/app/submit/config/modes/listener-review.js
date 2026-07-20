export const listenerReviewModeConfig = {
  heroDescription: "Choose the right path to help keep the archive accurate, useful, and easy to discover.",
  cardTitle: "Submit a listener review",
  cardDescription: "Share your take with other listeners.",
  cardIcon: "mode-review",
  introTitle: "Listener review",
  introDescription: "Share a useful, respectful review. Detailed category ratings are optional.",
  introIcon: "review",
  submitLabel: "Submit listener review",
  footerNote: "Next: moderation before any publication decision.",
  steps: [
    { title: "Submit", body: "Share your rating, spoiler level, and review." },
    { title: "Moderate", body: "We review and may edit for clarity, length, and respect." },
    { title: "Publish", body: "Accepted reviews require a separate publication action." },
  ],
  railCards: [
    {
      title: "After you submit",
      icon: "clock",
      accent: true,
      items: [
        { title: "Moderate", description: "We read submissions and may edit for clarity or length.", icon: "review", accent: true },
        { title: "Publish", description: "Accepted reviews still require an explicit publication action.", icon: "check" },
        { title: "Aggregate", description: "Only published scores affect public category averages.", icon: "team" },
      ],
    },
    {
      title: "Review guidelines",
      icon: "star-badge",
      description: "Help another listener decide whether this show is for them.",
      items: [
        { title: "Tag spoilers accurately", description: "Do not leave major reveals unmarked.", icon: "tag", accent: true },
        { title: "Stay respectful", description: "Critique the work without harassing creators or listeners.", icon: "team" },
        { title: "Archive ratings stay editorial", description: "Listener reviews add community context, not editorial control.", icon: "archive" },
      ],
      buttonLabel: "Ask the Archivist",
    },
  ],
};
