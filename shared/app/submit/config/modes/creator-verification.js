export const creatorVerificationModeConfig = {
    heroDescription:
      "Listeners and creators help keep The Echo Archives accurate and complete. Submit shows, suggest corrections, share listener reviews, or request creator verification.",
    cardTitle: "Creator verification",
    cardDescription: "Verify your show or update official details.",
    cardIcon: "mode-creator",
    introTitle: "Creator or official update",
    introDescription: "Provide accurate, verifiable information to confirm or update official details.",
    introIcon: "shield",
    submitLabel: "Send creator update",
    footerNote: "Verification helps confirm factual details. It does not affect archive ratings or recommendations.",
    steps: [
      {
        title: "You submit",
        body: "Send us the details using the form below.",
      },
      {
        title: "We review",
        body: "Our team verifies and adds context as needed.",
      },
      {
        title: "It enters the archive",
        body: "If accepted, it becomes part of the curated collection.",
      },
    ],
    railCards: [
      {
        title: "Verification guidelines",
        icon: "clipboard",
        accent: true,
        items: [
          {
            title: "Use official channels",
            description: "Submit from your official email domain, website, or verified social account.",
            icon: "check",
            accent: true,
          },
          {
            title: "Provide proof of association",
            description: "Include a link or documentation that confirms your role.",
            icon: "check",
            accent: true,
          },
          {
            title: "Factual updates only",
            description: "We update verifiable details like links, bios, status, artwork, and metadata.",
            icon: "check",
            accent: true,
          },
          {
            title: "Response may require follow-up",
            description: "Our team may reach out for clarification before changes are applied.",
            icon: "check",
            accent: true,
          },
        ],
      },
      {
        title: "What verification changes",
        icon: "shield",
        description: "",
        items: [
          {
            title: "Confirms official links",
            description: "We update websites, RSS feeds, and streaming links.",
            icon: "link",
          },
          {
            title: "Updates bios and descriptions",
            description: "Official descriptions and creator details are refreshed.",
            icon: "document",
          },
          {
            title: "Confirms show status",
            description: "We verify ongoing, paused, completed, or relaunch information.",
            icon: "clock",
          },
          {
            title: "Updates artwork",
            description: "Official cover art and banners may be updated.",
            icon: "image",
          },
          {
            title: "Updates official metadata",
            description: "Release dates, networks, and other factual details are confirmed.",
            icon: "spark",
          },
          {
            title: "Does not change ratings",
            description: "Audience ratings and rankings remain untouched by verification.",
            icon: "archive",
          },
        ],
      },
      {
        title: "Questions?",
        icon: "question",
        accent: true,
        description: "Visit our help center or reach out to the Archivist.",
        buttonLabel: "Ask the Archivist",
        footer: "We're here to help.",
      },
    ],
};
