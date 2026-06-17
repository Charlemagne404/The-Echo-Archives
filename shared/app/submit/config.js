export const MODE_ORDER = ["show", "correction", "listener-review", "creator-verification"];
export const MODES_WITH_EXISTING_SHOW = new Set(["correction", "listener-review", "creator-verification"]);

export const FALLBACK_TAG_OPTIONS = [
  "Horror",
  "Sci-fi",
  "Mystery",
  "Fantasy",
  "Comedy",
  "Thriller",
  "Drama",
  "Adventure",
  "Anthology",
  "Full-cast",
  "Serialized",
  "Character-driven",
];

export const LISTEN_LINK_OPTIONS = ["Spotify", "Apple Podcasts", "RSS Feed", "Official Website", "YouTube", "Other"];

export const CORRECTION_TYPE_OPTIONS = [
  { value: "broken-link", label: "Broken link" },
  { value: "metadata", label: "Metadata error" },
  { value: "status", label: "Status update" },
  { value: "credits", label: "Credit correction" },
  { value: "artwork", label: "Artwork update" },
  { value: "other", label: "Other" },
];

export const COMPLETION_STATUS_OPTIONS = [
  { value: "ongoing", label: "Ongoing" },
  { value: "completed", label: "Completed" },
  { value: "hiatus", label: "On hiatus" },
  { value: "returning", label: "Returning / seasonal" },
  { value: "anthology", label: "Anthology" },
  { value: "unknown", label: "Unknown" },
];

export const SPOILER_LEVEL_OPTIONS = [
  {
    value: "spoiler-free",
    label: "Spoiler-free",
    description: "No plot details",
  },
  {
    value: "light-spoilers",
    label: "Mild spoilers",
    description: "Some details",
  },
  {
    value: "full-spoilers",
    label: "Full spoilers",
    description: "All spoilers",
  },
];

export const REVIEW_CONTEXT_OPTIONS = [
  "Long walks",
  "Headphones on",
  "Slow burn",
  "Serious sci-fi",
  "Horror",
  "Comedy",
  "Commute",
  "Background listening",
  "Relaxing",
  "Family-friendly",
  "Kids",
];

export const REVIEW_STRENGTH_OPTIONS = [
  "Atmosphere",
  "Sound design",
  "World-building",
  "Characters",
  "Story",
  "Acting",
  "Pacing",
  "Originality",
  "Emotional impact",
];

export const ROLE_OPTIONS = [
  { value: "creator", label: "Creator" },
  { value: "producer", label: "Producer" },
  { value: "network-representative", label: "Network representative" },
  { value: "publicist", label: "Publicist" },
  { value: "other", label: "Other" },
];

export const VERIFICATION_METHOD_OPTIONS = [
  {
    value: "official-domain-email",
    label: "Official domain email",
    description: "Best for factual updates",
  },
  {
    value: "website",
    label: "Website",
    description: "Official website proof",
  },
  {
    value: "social-account",
    label: "Social account",
    description: "Verified social proof",
  },
  {
    value: "press-kit",
    label: "Press kit",
    description: "Public press materials",
  },
  {
    value: "other",
    label: "Other",
    description: "Another proof path",
  },
];

export const OFFICIAL_LINK_OPTIONS = ["Website", "RSS Feed", "Spotify", "Apple Podcasts", "Press kit", "YouTube", "X (Twitter)", "Other"];

export const MODE_CONFIG = {
  show: {
    heroDescription:
      "Listeners and creators help keep The Echo Archives accurate and complete. Submit shows, suggest corrections, share listener reviews, or request creator verification.",
    cardTitle: "Submit a new show",
    cardDescription: "Add a show that should be considered for the archive.",
    cardIcon: "mode-show",
    introTitle: "Submission details",
    introDescription: "Provide accurate, verifiable information to help us review your submission.",
    introIcon: "document",
    submitLabel: "Send to archive review",
    footerNote: "All submissions are manually reviewed.",
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
        title: "Submission guidelines",
        icon: "clipboard",
        accent: true,
        items: [
          {
            title: "Provide accurate, verifiable information.",
            description: "",
            icon: "check",
            accent: true,
          },
          {
            title: "Include at least one official listen link.",
            description: "",
            icon: "check",
            accent: true,
          },
          {
            title: "Keep descriptions spoiler-safe and factual.",
            description: "",
            icon: "check",
            accent: true,
          },
          {
            title: "Edits may be made for clarity and consistency.",
            description: "",
            icon: "check",
            accent: true,
          },
        ],
      },
      {
        title: "Good to know",
        icon: "info",
        items: [
          {
            title: "Nothing auto-publishes",
            description: "Every submission is manually reviewed before it enters the archive.",
            icon: "info",
          },
          {
            title: "Editorial stance stays independent",
            description: "Creator or listener input improves metadata, not archive ratings or reviews.",
            icon: "archive",
          },
          {
            title: "Creator corrections update facts",
            description: "Verification improves metadata quality and provenance only.",
            icon: "shield",
          },
          {
            title: "Response time",
            description: "Most submissions receive a response within 7-14 days.",
            icon: "clock",
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
  },
  correction: {
    heroDescription:
      "Help keep The Echo Archives accurate and complete. Choose the best path below and share verifiable information so we can make the archive stronger—together.",
    cardTitle: "Suggest a correction",
    cardDescription: "Fix factual data or update existing information.",
    cardIcon: "mode-correction",
    introTitle: "Correction details",
    introDescription: "Provide accurate, verifiable information to help us fix or update the archive.",
    introIcon: "document",
    submitLabel: "Send correction",
    footerNote: "Corrections are reviewed before they update the archive.",
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
        title: "Correction guidelines",
        icon: "clipboard",
        accent: true,
        items: [
          {
            title: "Provide accurate, verifiable information.",
            description: "",
            icon: "check",
            accent: true,
          },
          {
            title: "Link to an official source when possible.",
            description: "",
            icon: "check",
            accent: true,
          },
          {
            title: "Keep notes specific and factual.",
            description: "",
            icon: "check",
            accent: true,
          },
          {
            title: "Suggest factual updates, not opinions or ratings.",
            description: "",
            icon: "check",
            accent: true,
          },
        ],
      },
      {
        title: "Good to know",
        icon: "info",
        items: [
          {
            title: "Corrections update facts, not opinions.",
            description: "We do not change reviews or ratings submitted by listeners.",
            icon: "document",
          },
          {
            title: "Manual review before publication.",
            description: "Every correction is verified by our team for accuracy.",
            icon: "team",
          },
          {
            title: "Broken links are prioritized.",
            description: "We aim to fix dead or incorrect links as quickly as possible.",
            icon: "link",
          },
          {
            title: "Response time",
            description: "Most corrections receive a response within 7-14 days.",
            icon: "clock",
          },
        ],
      },
      {
        title: "Need help?",
        icon: "question",
        accent: true,
        description: "Visit our help center or reach out to the Archivist.",
        buttonLabel: "Ask the Archivist",
        footer: "We're here to help.",
      },
    ],
  },
  "listener-review": {
    heroDescription:
      "Listeners and creators help keep The Echo Archives accurate and complete. Submit shows, suggest corrections, share listener reviews, or request creator verification.",
    cardTitle: "Submit a listener review",
    cardDescription: "Share your take to help other listeners discover.",
    cardIcon: "mode-review",
    introTitle: "Listener review",
    introDescription: "Tell other listeners what to expect and why this show matters.",
    introIcon: "review",
    submitLabel: "Send listener review",
    footerNote: "Listener reviews may be summarized or quoted, but archive ratings stay editorially independent.",
    steps: [
      {
        title: "You submit",
        body: "Send us your review using the form below.",
      },
      {
        title: "We review",
        body: "Our team reads and edits for clarity and respect.",
      },
      {
        title: "It enters the archive",
        body: "If accepted, it becomes part of the curated collection.",
      },
    ],
    railCards: [
      {
        title: "Review guidelines",
        icon: "star-badge",
        accent: true,
        description: "Help keep the archive useful and respectful.",
        items: [
          {
            title: "Keep it spoiler-tagged",
            description: "Choose the right spoiler level and do not drop untagged major reveals.",
            icon: "tag",
            accent: true,
          },
          {
            title: "Stay respectful",
            description: "Be kind to creators and other listeners. No harassment or hate.",
            icon: "team",
          },
          {
            title: "Focus on what listeners should know",
            description: "Highlight tone, themes, strengths, and who this show is for.",
            icon: "review",
            accent: true,
          },
          {
            title: "Edits may be made for clarity",
            description: "We may edit for length, grammar, and consistency.",
            icon: "pencil",
          },
        ],
      },
      {
        title: "How reviews are used",
        icon: "info",
        description: "Listener reviews help others decide what to listen to next.",
        items: [
          {
            title: "Community voice",
            description: "Reviews reflect real listener experiences and perspectives.",
            icon: "team",
          },
          {
            title: "Discovery support",
            description: "Helpful reviews appear on show pages and in collections.",
            icon: "spark",
          },
          {
            title: "Editorial independence",
            description: "Reviews inform discovery, but our ratings remain editorially independent.",
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
  },
  "creator-verification": {
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
  },
};
