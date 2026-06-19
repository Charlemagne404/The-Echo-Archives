import { backToTopBtn, toggleBtn } from "./constants.js";
import { initializeSharedChat } from "./chat.js";
import { initializeAboutPage } from "./pages/about.js";
import { initializeCollectionPage } from "./pages/collection.js";
import { initializeCollectionsPage } from "./pages/collections.js";
import { initializeCreatorStandardsPage, initializeForCreatorsPage } from "./pages/creators.js";
import { initializeHomePage } from "./pages/home.js";
import { initializeShowPage } from "./pages/show.js";
import { initializeSubmitPage } from "./pages/submit.js?v=6";

export async function initializeApp() {
  initializeSharedChat();
  initializeBackToTop();

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

  if (document.body.classList.contains("submit-page")) {
    await initializeSubmitPage();
  }

  if (document.body.classList.contains("for-creators-page")) {
    await initializeForCreatorsPage();
  }

  if (document.body.classList.contains("creator-standards-page")) {
    initializeCreatorStandardsPage();
  }
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
      floatingChatToggle.style.opacity = hideFloatingControls ? "0" : "1";
      floatingChatToggle.style.pointerEvents = hideFloatingControls ? "none" : "auto";
      floatingChatToggle.style.visibility = hideFloatingControls ? "hidden" : "visible";
    }
  }

  window.addEventListener("scroll", syncBackToTopState, { passive: true });
  window.addEventListener("resize", syncBackToTopState);
  syncBackToTopState();

  backToTopBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}
