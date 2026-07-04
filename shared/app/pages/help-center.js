import { DEFAULT_SOCIAL_IMAGE } from "../constants.js";
import { updateDocumentMetadata } from "../utils.js";
import { initializeAccordionList } from "./accordion.js";

export function initializeHelpCenterPage() {
  updateDocumentMetadata({
    title: "Help Center - The Echo Archives",
    description: "Practical help for broken links, missing shows, corrections, ratings, and browser behavior in The Echo Archives.",
    path: "/help-center",
    image: DEFAULT_SOCIAL_IMAGE,
  });

  initializeAccordionList({
    itemSelector: ".creator-faq-item",
    buttonSelector: ".creator-faq-toggle",
  });
}
