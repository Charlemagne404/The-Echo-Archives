import { DEFAULT_SOCIAL_IMAGE } from "../constants.js";
import { setChatOpen } from "../chat-open.js";
import { loadArchiveStats } from "../data.js";
import { formatDate, updateDocumentMetadata } from "../utils.js";
import { initializeAccordionList } from "./accordion.js";

export async function initializeForCreatorsPage() {
  const stats = await loadArchiveStats();

  updateDocumentMetadata({
    title: "For Creators - The Echo Archives",
    description:
      "How creators can submit shows, correct metadata, request verification, and understand the standards behind The Echo Archives.",
    path: "/for-creators",
    image: DEFAULT_SOCIAL_IMAGE,
  });

  applyCreatorStats(stats);
  initializeCreatorFaq();
  initializeCreatorChatLaunchers();
}

export function initializeCreatorStandardsPage() {
  updateDocumentMetadata({
    title: "Creator Standards - The Echo Archives",
    description:
      "The standards and trust rules The Echo Archives uses when handling creator submissions, verification, and metadata updates.",
    path: "/creator-standards",
    image: DEFAULT_SOCIAL_IMAGE,
  });

  initializeCreatorChatLaunchers();
  initializeCreatorStandardsRail();
}

function applyCreatorStats(stats) {
  setText("creatorsCreatorCount", formatInteger(stats.creatorCount));
  setText("creatorsShowCount", formatInteger(stats.showCount));
  setText("creatorsMetadataCount", formatInteger(stats.metadataCheckedCount));
  setText("creatorsMetadataContext", buildMetadataContext(stats));
  setText("creatorsReviewCount", formatInteger(stats.fullReviewCount));
  setText("creatorsLastUpdated", stats.latestUpdatedAt ? formatDate(stats.latestUpdatedAt) : "Unknown");
}

function formatInteger(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function buildMetadataContext(stats) {
  if (stats.showCount === 0) {
    return "No published records yet.";
  }

  if (stats.metadataCheckedCount === stats.showCount) {
    return "All published records currently have sourced metadata.";
  }

  return `${formatInteger(stats.metadataCheckedCount)} of ${formatInteger(stats.showCount)} published records currently have sourced metadata.`;
}

function initializeCreatorFaq() {
  initializeAccordionList({
    itemSelector: ".creator-faq-item",
    buttonSelector: ".creator-faq-toggle",
  });
}

function initializeCreatorChatLaunchers() {
  document.querySelectorAll("[data-open-chat]").forEach((button) => {
    if (!(button instanceof HTMLButtonElement || button instanceof HTMLAnchorElement)) {
      return;
    }

    button.addEventListener("click", (event) => {
      event.preventDefault();
      setChatOpen(true);
    });
  });
}

function initializeCreatorStandardsRail() {
  const rail = document.querySelector(".creator-standards-page .info-page-rail");
  if (!(rail instanceof HTMLElement)) {
    return;
  }

  const links = Array.from(rail.querySelectorAll('.info-rail-links a[href^="#"]')).filter(
    (link) => link instanceof HTMLAnchorElement,
  );

  if (links.length === 0) {
    return;
  }

  const sections = links
    .map((link) => {
      const id = link.getAttribute("href")?.slice(1);
      if (!id) {
        return null;
      }

      const section = document.getElementById(id);
      if (!(section instanceof HTMLElement)) {
        return null;
      }

      return { link, section };
    })
    .filter(Boolean);

  if (sections.length === 0) {
    return;
  }

  const setActiveLink = (activeId) => {
    sections.forEach(({ link, section }) => {
      const isActive = section.id === activeId;
      link.classList.toggle("is-active", isActive);

      if (isActive) {
        link.setAttribute("aria-current", "true");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  };

  const syncFromHash = () => {
    const hashId = window.location.hash.replace(/^#/, "");
    const matchedSection = sections.find(({ section }) => section.id === hashId);
    setActiveLink(matchedSection ? matchedSection.section.id : sections[0].section.id);
  };

  sections.forEach(({ link, section }) => {
    link.addEventListener("click", () => {
      setActiveLink(section.id);
    });
  });

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio);

        if (visibleEntries.length > 0) {
          setActiveLink(visibleEntries[0].target.id);
        }
      },
      {
        rootMargin: "-18% 0px -56% 0px",
        threshold: [0.2, 0.35, 0.55],
      },
    );

    sections.forEach(({ section }) => observer.observe(section));
  }

  window.addEventListener("hashchange", syncFromHash);
  syncFromHash();
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) {
    node.textContent = value;
  }
}
