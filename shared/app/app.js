import { initializeArchivistLauncher } from "./archivist-launcher.js";
import { initializeManagedImages } from "./images.js";
import { initializeMobileNav } from "./mobile-nav.js";
import { initializeServiceWorker } from "./service-worker.js";
import { showToast } from "./toast.js";
import { initializeViewportMetrics } from "./viewport-metrics.js";

export async function initializeApp() {
  initializeViewportMetrics();
  initializeServiceWorker();
  initializeMobileNav();
  initializeArchivistLauncher();
  initializeBackToTop();
  initializeHistoryBackLinks();
  initializeManagedImages();
  initializeLazySharedChatLauncher();

  if (document.body.classList.contains("home-page") && document.getElementById("podcast-grid")) {
    const { initializeHomePage } = await import("./pages/home.js");
    await initializeHomePage();
  }

  if (document.body.classList.contains("show-page")) {
    const { initializeShowPage } = await import("./pages/show.js");
    await initializeShowPage();
  }

  if (document.body.classList.contains("collections-page")) {
    const { initializeCollectionsPage } = await import("./pages/collections.js");
    await initializeCollectionsPage();
  }

  if (document.body.classList.contains("collection-page")) {
    const { initializeCollectionPage } = await import("./pages/collection.js");
    await initializeCollectionPage();
  }

  if (document.body.classList.contains("about-page")) {
    const { initializeAboutPage } = await import("./pages/about.js");
    await initializeAboutPage();
  }

  if (document.body.classList.contains("help-center-page")) {
    const { initializeHelpCenterPage } = await import("./pages/help-center.js");
    initializeHelpCenterPage();
  }

  if (document.body.classList.contains("submit-page")) {
    const { initializeSubmitPage } = await import("./pages/submit.js");
    await initializeSubmitPage();
  }

  if (document.body.classList.contains("maintainer-page")) {
    const { initializeMaintainerPage } = await import("./pages/maintainer.js");
    await initializeMaintainerPage();
  }

  if (document.body.classList.contains("maintainer-import-page")) {
    const { initializeMaintainerImportsPage } = await import("./pages/maintainer-imports.js");
    await initializeMaintainerImportsPage();
  }

  if (document.body.classList.contains("maintainer-collection-page")) {
    const { initializeMaintainerCollectionsPage } = await import("./pages/maintainer-collections.js");
    await initializeMaintainerCollectionsPage();
  }

  if (document.body.classList.contains("for-creators-page")) {
    const { initializeForCreatorsPage } = await import("./pages/creators.js");
    await initializeForCreatorsPage();
  }

  if (document.body.classList.contains("creator-standards-page")) {
    const { initializeCreatorStandardsPage } = await import("./pages/creators.js");
    initializeCreatorStandardsPage();
  }

}

function initializeLazySharedChatLauncher() {
  const toggleBtn = document.getElementById("chat-toggle");
  if (document.body?.dataset.archivistEnabled !== "true") {
    document.querySelectorAll("#chat-toggle, [data-open-chat]").forEach((element) => element.remove());
    return;
  }

  if (!toggleBtn) {
    return;
  }

  const mobileLauncherQuery = window.matchMedia("(max-width: 959px)");
  let sharedChatPromise;
  let sharedChatStylesPromise;

  const loadSharedChatStyles = () => {
    if (sharedChatStylesPromise) {
      return sharedChatStylesPromise;
    }

    const href = document.body.dataset.chatStylesheet?.trim();
    if (!href) {
      sharedChatStylesPromise = Promise.resolve();
      return sharedChatStylesPromise;
    }

    const existing = document.querySelector('link[data-shared-chat-styles="true"]');
    if (existing instanceof HTMLLinkElement && existing.sheet) {
      sharedChatStylesPromise = Promise.resolve();
      return sharedChatStylesPromise;
    }

    sharedChatStylesPromise = new Promise((resolve, reject) => {
      const stylesheet = existing instanceof HTMLLinkElement ? existing : document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = href;
      stylesheet.dataset.sharedChatStyles = "true";
      stylesheet.addEventListener("load", resolve, { once: true });
      stylesheet.addEventListener(
        "error",
        () => {
          stylesheet.remove();
          sharedChatStylesPromise = undefined;
          reject(new Error("Ask the Archivist styles failed to load."));
        },
        { once: true },
      );
      if (!stylesheet.isConnected) {
        document.head.appendChild(stylesheet);
      }
    });
    return sharedChatStylesPromise;
  };

  const syncLauncherVisibility = () => {
    const chatContainer = document.getElementById("chat-container");
    const shouldDelayLauncher =
      mobileLauncherQuery.matches &&
      !chatContainer?.classList.contains("is-open") &&
      window.scrollY < 140;

    toggleBtn.classList.toggle("is-delayed-mobile-toggle", shouldDelayLauncher);
  };

  const openChat = (initialPrompt = "") => {
    if (!sharedChatPromise) {
      sharedChatPromise = Promise.all([loadSharedChatStyles(), import("./chat-loader.js")]).then(
        ([, { mountAndInitializeSharedChat }]) => mountAndInitializeSharedChat(),
      );
    }

    toggleBtn.setAttribute("aria-busy", "true");
    sharedChatPromise
      .then(({ setChatOpen }) => {
        setChatOpen(true);

        if (initialPrompt) {
          const userInput = document.getElementById("userInput");
          if (userInput instanceof HTMLInputElement) {
            userInput.value = initialPrompt;
            userInput.focus();
          }
        }
      })
      .catch((error) => {
        console.error("Failed to load Ask the Archivist.", error);
        showToast({
          message: "Ask the Archivist is unavailable right now. Try again when your connection recovers.",
          tone: "error",
          label: "Archivist unavailable",
        });
        sharedChatPromise = undefined;
      })
      .finally(() => toggleBtn.removeAttribute("aria-busy"));
  };

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const launcher = target.closest("#chat-toggle, [data-open-chat]");
    if (!launcher) {
      return;
    }

    event.preventDefault();
    openChat(launcher.getAttribute("data-chat-initial-prompt")?.trim() || "");
  });

  mobileLauncherQuery.addEventListener("change", syncLauncherVisibility);
  window.addEventListener("scroll", syncLauncherVisibility, { passive: true });
  window.addEventListener("resize", syncLauncherVisibility);
  window.addEventListener("echo:chat-open-change", syncLauncherVisibility);
  syncLauncherVisibility();
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
  const backToTopBtn = document.getElementById("backToTop");
  if (!backToTopBtn) {
    return;
  }

  const siteFooter = document.getElementById("site-footer");
  const floatingChatToggle = document.getElementById("chat-toggle");

  function syncBackToTopState() {
    const showBackToTop = window.scrollY > 420;
    const baseClearance = window.innerWidth <= 959 ? 16 : 18;
    const topSafeZone = window.innerWidth <= 959 ? 92 : 96;
    const maxFloatingHeight = window.innerWidth <= 959 ? 54 : 56;
    const panelGap = window.innerWidth <= 959 ? 12 : 14;
    let clearance = baseClearance;
    let hideFloatingControls = false;

    if (siteFooter) {
      const footerRect = siteFooter.getBoundingClientRect();

      if (footerRect.top < window.innerHeight) {
        const footerClearance = Math.max(baseClearance, Math.round(window.innerHeight - footerRect.top + baseClearance));
        const maxVisibleClearance = Math.max(baseClearance, window.innerHeight - maxFloatingHeight - topSafeZone);
        clearance = Math.min(footerClearance, maxVisibleClearance);
        hideFloatingControls = window.innerWidth <= 959 && footerClearance > maxVisibleClearance;
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

    const activeChatContainer = document.getElementById("chat-container");
    if (activeChatContainer) {
      if (window.innerWidth <= 959) {
        activeChatContainer.style.removeProperty("top");
        activeChatContainer.style.removeProperty("bottom");
      } else {
        activeChatContainer.style.top = "auto";
        activeChatContainer.style.bottom = `${clearance}px`;
      }

      const panelRect = activeChatContainer.getBoundingClientRect();
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
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
  });
}
