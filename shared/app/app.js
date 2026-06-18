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
    backToTopBtn.style.display = window.scrollY > 420 ? "flex" : "none";

    if (!siteFooter) {
      return;
    }

    const footerRect = siteFooter.getBoundingClientRect();
    const footerOverlap = Math.max(0, window.innerHeight - footerRect.top);
    const clearance = Math.min(Math.max(footerOverlap + 18, 18), Math.round(window.innerHeight * 0.35));
    const footerCrowdingMobile = window.innerWidth <= 780 && footerOverlap > 140;
    backToTopBtn.style.bottom = `${clearance}px`;
    backToTopBtn.style.opacity = footerCrowdingMobile ? "0" : "1";
    backToTopBtn.style.pointerEvents = footerCrowdingMobile ? "none" : "auto";
    if (floatingChatToggle) {
      floatingChatToggle.style.bottom = `${clearance}px`;
      floatingChatToggle.style.opacity = footerCrowdingMobile ? "0" : "1";
      floatingChatToggle.style.pointerEvents = footerCrowdingMobile ? "none" : "auto";
    }
  }

  window.addEventListener("scroll", syncBackToTopState, { passive: true });
  window.addEventListener("resize", syncBackToTopState);
  syncBackToTopState();

  backToTopBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}
