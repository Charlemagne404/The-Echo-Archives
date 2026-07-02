import { backToTopBtn, chatContainer, toggleBtn } from "./constants.js";
import { initializeSharedChat } from "./chat.js";
import { initializeMobileNav } from "./mobile-nav.js";
import { initializeAboutPage } from "./pages/about.js";
import { initializeHelpCenterPage } from "./pages/help-center.js";
import { initializeCollectionPage } from "./pages/collection.js";
import { initializeCollectionsPage } from "./pages/collections.js";
import { initializeCreatorStandardsPage, initializeForCreatorsPage } from "./pages/creators.js";
import { initializeHomePage } from "./pages/home.js";
import { initializeMaintainerPage } from "./pages/maintainer.js";
import { initializeMaintainerImportsPage } from "./pages/maintainer-imports.js";
import { initializeShowPage } from "./pages/show.js";
import { initializeSubmitPage } from "./pages/submit.js";

export async function initializeApp() {
  initializeSharedChat();
  initializeMobileNav();
  initializeBackToTop();
  initializeHistoryBackLinks();

  if (document.body.classList.contains("home-page") && document.getElementById("podcast-grid")) {
    await initializeHomePage();
  }

  if (document.body.classList.contains("show-page")) {
    await initializeShowPage();
  }

  if (document.body.classList.contains("collections-page")) {
    await initializeCollectionsPage();
  }

  if (document.body.classList.contains("collection-page")) {
    await initializeCollectionPage();
  }

  if (document.body.classList.contains("about-page")) {
    await initializeAboutPage();
  }

  if (document.body.classList.contains("help-center-page")) {
    initializeHelpCenterPage();
  }

  if (document.body.classList.contains("submit-page")) {
    await initializeSubmitPage();
  }

  if (document.body.classList.contains("maintainer-page")) {
    await initializeMaintainerPage();
  }

  if (document.body.classList.contains("maintainer-import-page")) {
    await initializeMaintainerImportsPage();
  }

  if (document.body.classList.contains("for-creators-page")) {
    await initializeForCreatorsPage();
  }

  if (document.body.classList.contains("creator-standards-page")) {
    initializeCreatorStandardsPage();
  }
}

function initializeHistoryBackLinks() {
  const historyBackLinks = Array.from(document.querySelectorAll("[data-history-back]"));

  if (historyBackLinks.length === 0) {
    return;
  }

  const currentUrl = new URL(window.location.href);
  const safeReferrer = getSafeHistoryReferrer(currentUrl);

  historyBackLinks.forEach((link) => {
    const labelNode = link.querySelector("[data-history-back-label]");
    const fallbackLabel = link.dataset.fallbackLabel?.trim();

    if (!safeReferrer) {
      if (labelNode && fallbackLabel) {
        labelNode.textContent = fallbackLabel;
      }
      return;
    }

    if (labelNode) {
      labelNode.textContent = "Back to previous page";
    }

    link.addEventListener("click", (event) => {
      event.preventDefault();
      window.history.back();
    });
  });
}

function getSafeHistoryReferrer(currentUrl) {
  if (!document.referrer) {
    return null;
  }

  let referrerUrl;

  try {
    referrerUrl = new URL(document.referrer);
  } catch {
    return null;
  }

  if (referrerUrl.origin !== currentUrl.origin) {
    return null;
  }

  if (referrerUrl.href === currentUrl.href) {
    return null;
  }

  return referrerUrl;
}

function initializeBackToTop() {
  if (!backToTopBtn) {
    return;
  }

  const siteFooter = document.getElementById("site-footer");
  const floatingChatToggle = toggleBtn;

  function syncBackToTopState() {
    const showBackToTop = window.scrollY > 420;
    const baseClearance = window.innerWidth <= 780 ? 16 : 18;
    const topSafeZone = window.innerWidth <= 780 ? 92 : 96;
    const maxFloatingHeight = window.innerWidth <= 780 ? 54 : 56;
    const panelGap = window.innerWidth <= 780 ? 12 : 14;
    let clearance = baseClearance;
    let hideFloatingControls = false;

    if (siteFooter) {
      const footerRect = siteFooter.getBoundingClientRect();

      if (footerRect.top < window.innerHeight) {
        const footerClearance = Math.max(baseClearance, Math.round(window.innerHeight - footerRect.top + baseClearance));
        const maxVisibleClearance = Math.max(baseClearance, window.innerHeight - maxFloatingHeight - topSafeZone);
        clearance = Math.min(footerClearance, maxVisibleClearance);
        hideFloatingControls = window.innerWidth <= 780 && footerClearance > maxVisibleClearance;
      }
    }

    backToTopBtn.style.display = showBackToTop ? "flex" : "none";
    backToTopBtn.style.bottom = `${clearance}px`;
    backToTopBtn.style.opacity = showBackToTop && !hideFloatingControls ? "1" : "0";
    backToTopBtn.style.pointerEvents = showBackToTop && !hideFloatingControls ? "auto" : "none";
    backToTopBtn.style.visibility = showBackToTop && !hideFloatingControls ? "visible" : "hidden";

    if (floatingChatToggle) {
      floatingChatToggle.style.bottom = `${clearance}px`;
      floatingChatToggle.style.opacity = hideFloatingControls ? "0" : "";
      floatingChatToggle.style.pointerEvents = hideFloatingControls ? "none" : "";
      floatingChatToggle.style.visibility = hideFloatingControls ? "hidden" : "";
    }

    if (chatContainer) {
      chatContainer.style.top = "auto";
      chatContainer.style.bottom = `${clearance}px`;

      const panelRect = chatContainer.getBoundingClientRect();
      const maxVisibleRight = Math.max(baseClearance, window.innerWidth - maxFloatingHeight - baseClearance);
      const openRight = Math.min(
        maxVisibleRight,
        Math.max(baseClearance, Math.round(window.innerWidth - panelRect.left + panelGap)),
      );
      backToTopBtn.style.setProperty("--back-to-top-chat-open-right", `${openRight}px`);
    }
  }

  window.addEventListener("scroll", syncBackToTopState, { passive: true });
  window.addEventListener("resize", syncBackToTopState);
  window.addEventListener("echo:chat-open-change", syncBackToTopState);
  syncBackToTopState();

  backToTopBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}
