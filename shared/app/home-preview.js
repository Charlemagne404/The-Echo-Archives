import {
  SHOW_CARD_PREVIEW_CLOSE_DELAY_MS,
  SHOW_CARD_PREVIEW_CLOSE_TRANSITION_MS,
  SHOW_CARD_PREVIEW_DELAY_MS,
  SHOW_CARD_PREVIEW_SCROLL_IDLE_MS,
} from "./constants.js";
import { getShellPreviewPanel } from "./render-cards.js";

export function initializeHomePreviewController({ archiveGrid, archiveSection }) {
  const coarsePointerQuery = window.matchMedia("(pointer: coarse)");
  const hoverlessPointerQuery = window.matchMedia("(hover: none)");
  const state = {
    activeShell: null,
    pendingShell: null,
    openTimer: 0,
    closeTimer: 0,
    hideTimer: 0,
    scrollStopTimer: 0,
    hoverShell: null,
    focusShell: null,
    isUserScrolling: false,
    lastPointerType: "mouse",
  };

  function getPreviewShell(target) {
    if (!(target instanceof Element)) {
      return null;
    }

    return target.closest('.podcast-card-shell[data-preview-card="true"]');
  }

  function clearOpenTimer() {
    if (state.openTimer) {
      window.clearTimeout(state.openTimer);
      state.openTimer = 0;
    }

    state.pendingShell = null;
  }

  function clearCloseTimer() {
    if (state.closeTimer) {
      window.clearTimeout(state.closeTimer);
      state.closeTimer = 0;
    }
  }

  function clearHideTimer() {
    if (state.hideTimer) {
      window.clearTimeout(state.hideTimer);
      state.hideTimer = 0;
    }
  }

  function clearScrollStopTimer() {
    if (state.scrollStopTimer) {
      window.clearTimeout(state.scrollStopTimer);
      state.scrollStopTimer = 0;
    }
  }

  function getSourceCard(shell) {
    if (!shell) {
      return null;
    }

    return shell.querySelector(".podcast-card-primary");
  }

  function getPreviewLayer(shell) {
    if (!shell) {
      return null;
    }

    return shell.querySelector(".home-card-preview-layer");
  }

  function getPreviewPanel(shell) {
    if (!shell) {
      return null;
    }

    return shell.querySelector(".home-card-preview");
  }

  function getPreviewOpenLink(shell) {
    if (!shell) {
      return null;
    }

    return shell.querySelector(".preview-open-link");
  }

  function getPreviewCloseButton(shell) {
    if (!shell) {
      return null;
    }

    return shell.querySelector(".preview-close-button");
  }

  function isWithinPreview(target) {
    if (!(target instanceof Node)) {
      return false;
    }

    return state.activeShell?.contains(target) || false;
  }

  function hasFocusedPreviewTarget(shell) {
    const activeElement = document.activeElement;
    if (!shell || !(activeElement instanceof Element) || !shell.contains(activeElement)) {
      return false;
    }

    return !activeElement.closest(".home-card-preview-layer[hidden]");
  }

  function getTopPreviewShellAtPoint(clientX, clientY) {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      return null;
    }

    const elements = document.elementsFromPoint(clientX, clientY);
    for (const element of elements) {
      const shell = getPreviewShell(element);
      if (shell) {
        return shell;
      }
    }

    return null;
  }

  function isPointWithinPreviewPanel(shell, clientX, clientY) {
    if (!shell || !Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      return false;
    }

    const layer = getPreviewLayer(shell);
    const panel = getPreviewPanel(shell);
    if (!layer || layer.hidden || !panel) {
      return false;
    }

    const rect = panel.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  function getEligibleOpenShell() {
    if (state.focusShell?.isConnected && hasFocusedPreviewTarget(state.focusShell)) {
      return state.focusShell;
    }

    if (state.hoverShell?.isConnected && state.hoverShell.matches(":hover")) {
      return state.hoverShell;
    }

    return null;
  }

  function syncSourceState(shell, isActive) {
    const card = getSourceCard(shell);
    if (!shell || !card) {
      return;
    }

    shell.classList.toggle("preview-source-active", isActive);
    card.setAttribute("aria-expanded", String(isActive));
  }

  function hideOverlayImmediately(shell) {
    const layer = getPreviewLayer(shell);
    const panel = getPreviewPanel(shell);
    const closeButton = getPreviewCloseButton(shell);
    const openLink = getPreviewOpenLink(shell);

    clearHideTimer();
    shell?.classList.remove("is-preview-expanded", "is-preview-closing", "is-preview-measuring");
    if (layer) {
      layer.hidden = true;
      layer.setAttribute("aria-hidden", "true");
    }
    if (panel) {
      panel.removeAttribute("data-preview-layout");
      panel.removeAttribute("data-preview-placement");
      panel.scrollTop = 0;
    }
    closeButton?.setAttribute("tabindex", "-1");
    openLink?.setAttribute("tabindex", "-1");
  }

  function closeShell(shell, { immediate = false, returnFocus = false } = {}) {
    if (!shell) {
      clearOpenTimer();
      clearCloseTimer();
      clearHideTimer();
      if (state.activeShell) {
        syncSourceState(state.activeShell, false);
        hideOverlayImmediately(state.activeShell);
      }
      state.activeShell = null;
      return;
    }

    const layer = getPreviewLayer(shell);
    const closeButton = getPreviewCloseButton(shell);
    const openLink = getPreviewOpenLink(shell);

    if (state.pendingShell === shell) {
      clearOpenTimer();
    }

    clearCloseTimer();
    clearHideTimer();
    syncSourceState(shell, false);

    if (state.activeShell === shell) {
      state.activeShell = null;
    }

    if (returnFocus && shell.contains(document.activeElement)) {
      getSourceCard(shell)?.focus();
    }

    if (immediate || !layer) {
      hideOverlayImmediately(shell);
      return;
    }

    shell.classList.remove("is-preview-expanded", "is-preview-measuring");
    shell.classList.add("is-preview-closing");
    layer.setAttribute("aria-hidden", "true");
    closeButton?.setAttribute("tabindex", "-1");
    openLink?.setAttribute("tabindex", "-1");
    state.hideTimer = window.setTimeout(() => {
      hideOverlayImmediately(shell);
    }, SHOW_CARD_PREVIEW_CLOSE_TRANSITION_MS);
  }

  function openShell(shell, { force = false } = {}) {
    if (!shell) {
      return;
    }

    const layer = getPreviewLayer(shell);
    const panel = getPreviewPanel(shell);
    const closeButton = getPreviewCloseButton(shell);
    const openLink = getPreviewOpenLink(shell);

    clearOpenTimer();
    clearCloseTimer();
    clearHideTimer();

    if (state.activeShell && state.activeShell !== shell) {
      closeShell(state.activeShell, { immediate: true });
    }

    if (!layer || !panel || !closeButton || !openLink) {
      return;
    }

    if (!force && (state.isUserScrolling || getEligibleOpenShell() !== shell)) {
      return;
    }

    layer.hidden = false;
    layer.setAttribute("aria-hidden", "false");
    closeButton.removeAttribute("tabindex");
    openLink.removeAttribute("tabindex");
    panel.scrollTop = 0;
    shell.classList.remove("is-preview-closing");
    shell.classList.add("is-preview-measuring");
    positionHomeCardPreview(shell, archiveGrid, archiveSection);
    syncSourceState(shell, true);

    state.activeShell = shell;
    window.requestAnimationFrame(() => {
      shell.classList.remove("is-preview-measuring");
      window.requestAnimationFrame(() => {
        shell.classList.add("is-preview-expanded");
      });
    });
  }

  function scheduleOpen(shell, { force = false } = {}) {
    if (!shell) {
      return;
    }

    clearCloseTimer();

    if (state.activeShell === shell || state.isUserScrolling) {
      return;
    }

    clearOpenTimer();
    state.pendingShell = shell;
    state.openTimer = window.setTimeout(() => {
      openShell(shell, { force });
    }, SHOW_CARD_PREVIEW_DELAY_MS);
  }

  function handleScrollActivity() {
    state.isUserScrolling = true;
    clearOpenTimer();
    clearScrollStopTimer();
    closeActivePreview({ immediate: true });
    state.scrollStopTimer = window.setTimeout(() => {
      state.isUserScrolling = false;
      const shell = getEligibleOpenShell();
      if (shell) {
        scheduleOpen(shell);
      }
    }, SHOW_CARD_PREVIEW_SCROLL_IDLE_MS);
  }

  function scheduleClose(shell, { immediate = false, returnFocus = false } = {}) {
    if (!shell) {
      return;
    }

    if (state.pendingShell === shell) {
      clearOpenTimer();
    }

    if (immediate) {
      closeShell(shell, { immediate: true, returnFocus });
      return;
    }

    clearCloseTimer();
    state.closeTimer = window.setTimeout(() => {
      closeShell(shell, { returnFocus });
    }, SHOW_CARD_PREVIEW_CLOSE_DELAY_MS);
  }

  function closeActivePreview({ immediate = false, returnFocus = false } = {}) {
    if (state.pendingShell && state.pendingShell !== state.activeShell) {
      clearOpenTimer();
    }

    if (!state.activeShell) {
      clearCloseTimer();
      return;
    }

    scheduleClose(state.activeShell, { immediate, returnFocus });
  }

  function isTouchLikeActivation(event) {
    if (event.detail === 0) {
      return false;
    }

    if (state.lastPointerType === "touch" || state.lastPointerType === "pen") {
      return true;
    }

    return coarsePointerQuery.matches || hoverlessPointerQuery.matches || navigator.maxTouchPoints > 0;
  }

  const handlePointerOver = (event) => {
    if (event.pointerType && event.pointerType !== "mouse") {
      state.lastPointerType = event.pointerType;
      return;
    }

    state.lastPointerType = "mouse";
    const targetShell = getPreviewShell(event.target);
    if (!targetShell) {
      return;
    }

    if (isPointWithinPreviewPanel(state.activeShell, event.clientX, event.clientY)) {
      state.hoverShell = state.activeShell;
      return;
    }

    const shell = getTopPreviewShellAtPoint(event.clientX, event.clientY) || targetShell;
    if (shell !== targetShell) {
      return;
    }

    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && shell.contains(relatedTarget)) {
      return;
    }

    if (state.activeShell && state.activeShell !== shell) {
      closeShell(state.activeShell, { immediate: true });
    }

    state.hoverShell = shell;
    scheduleOpen(shell);
  };

  const handlePointerOut = (event) => {
    if (event.pointerType && event.pointerType !== "mouse") {
      return;
    }

    const shell = getPreviewShell(event.target);
    if (!shell) {
      return;
    }

    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && shell.contains(relatedTarget)) {
      return;
    }

    if (isPointWithinPreviewPanel(shell, event.clientX, event.clientY)) {
      state.hoverShell = shell;
      return;
    }

    if (getTopPreviewShellAtPoint(event.clientX, event.clientY) === shell) {
      return;
    }

    if (state.hoverShell === shell) {
      state.hoverShell = null;
    }
    scheduleClose(shell);
  };

  const handleFocusIn = (event) => {
    const shell = getPreviewShell(event.target);
    if (!shell) {
      return;
    }

    state.focusShell = shell;
    scheduleOpen(shell);
  };

  const handleFocusOut = (event) => {
    const shell = getPreviewShell(event.target);
    if (!shell) {
      return;
    }

    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && shell.contains(nextTarget)) {
      return;
    }

    if (state.focusShell === shell) {
      state.focusShell = null;
    }
    scheduleClose(shell, { immediate: true });
  };

  const handleKeyDown = (event) => {
    if (event.key !== "Escape") {
      return;
    }

    if (!state.activeShell || !isWithinPreview(event.target)) {
      return;
    }

    event.preventDefault();
    closeShell(state.activeShell, { immediate: true, returnFocus: true });
  };

  const handleCardClick = (event) => {
    const card = event.target instanceof Element ? event.target.closest(".podcast-card-primary") : null;
    if (!(card instanceof HTMLAnchorElement) || !archiveGrid.contains(card)) {
      return;
    }

    if (!isTouchLikeActivation(event)) {
      return;
    }

    const shell = getPreviewShell(card);
    if (!shell) {
      return;
    }

    event.preventDefault();
    openShell(shell, { force: true });
  };

  const handlePreviewCloseClick = (event) => {
    const closeButton = event.target instanceof Element ? event.target.closest(".preview-close-button") : null;
    if (!(closeButton instanceof HTMLButtonElement) || !archiveGrid.contains(closeButton)) {
      return;
    }

    const shell = getPreviewShell(closeButton);
    if (!shell) {
      return;
    }

    event.preventDefault();
    closeShell(shell, { immediate: true, returnFocus: event.detail === 0 });
  };

  const handleDocumentPointerDown = (event) => {
    if (event.pointerType) {
      state.lastPointerType = event.pointerType;
    }

    const activeShell = state.activeShell;
    const pendingShell = state.pendingShell;

    if (!activeShell && !pendingShell) {
      return;
    }

    const target = event.target;
    if (target instanceof Node && (activeShell?.contains(target) || pendingShell?.contains(target))) {
      return;
    }

    closeActivePreview({ immediate: true });
  };

  const handleViewportChange = () => {
    if (!state.activeShell) {
      return;
    }

    positionHomeCardPreview(state.activeShell, archiveGrid, archiveSection);
  };

  archiveGrid.addEventListener("pointerover", handlePointerOver);
  archiveGrid.addEventListener("pointerout", handlePointerOut);
  archiveGrid.addEventListener("focusin", handleFocusIn);
  archiveGrid.addEventListener("focusout", handleFocusOut);
  archiveGrid.addEventListener("keydown", handleKeyDown);
  archiveGrid.addEventListener("click", handlePreviewCloseClick);
  archiveGrid.addEventListener("click", handleCardClick);
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  window.addEventListener("scroll", handleScrollActivity, { passive: true });
  window.addEventListener("wheel", handleScrollActivity, { passive: true });
  window.addEventListener("touchmove", handleScrollActivity, { passive: true });
  window.addEventListener("resize", handleViewportChange);

  return {
    closeActivePreview,
  };
}

function positionHomeCardPreview(shell, archiveGrid, archiveSection) {
  const panel = getShellPreviewPanel(shell);
  if (!panel) {
    return;
  }

  const shellRect = shell.getBoundingClientRect();
  const cardRect = shell.querySelector(".podcast-card-primary")?.getBoundingClientRect() || shellRect;
  const gridStyles = window.getComputedStyle(archiveGrid);
  const columnGap = Number.parseFloat(gridStyles.columnGap) || 24;
  const isStackedLayout = window.matchMedia("(max-width: 780px)").matches;
  const viewportInset = isStackedLayout ? 8 : 12;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || shellRect.width * 2 + columnGap;
  const previewWidth = Math.min(
    shellRect.width * 2 + columnGap,
    Math.max(viewportWidth - viewportInset * 2, cardRect.width),
  );
  const centeredPreviewLeft = cardRect.left + cardRect.width / 2 - previewWidth / 2;
  const minPreviewLeft = viewportInset;
  const maxPreviewLeft = Math.max(minPreviewLeft, viewportWidth - viewportInset - previewWidth);
  const previewLeft = clampValue(centeredPreviewLeft, minPreviewLeft, maxPreviewLeft);
  const previewTop = cardRect.top;
  const previewMinHeight = Math.max(
    cardRect.height - (isStackedLayout ? 8 : 18),
    Math.min(cardRect.height, 240),
  );

  void archiveSection;
  shell.style.setProperty("--preview-width", `${previewWidth}px`);
  shell.style.setProperty("--preview-left", `${previewLeft - shellRect.left}px`);
  shell.style.setProperty("--preview-top", `${previewTop - shellRect.top}px`);
  shell.style.setProperty("--preview-min-height", `${previewMinHeight}px`);
  panel.dataset.previewLayout = isStackedLayout ? "stack" : "split";
  panel.dataset.previewPlacement = "card";

  const previewHeight = panel.getBoundingClientRect().height || panel.scrollHeight || previewMinHeight;
  const startScaleX = clampValue(cardRect.width / previewWidth, 0.34, 0.68);
  const startScaleY = clampValue(cardRect.height / Math.max(previewHeight, 1), 0.34, 0.94);
  const startShiftX = cardRect.left - previewLeft;
  const startShiftY = cardRect.top - previewTop;

  shell.style.setProperty("--preview-start-scale-x", `${startScaleX}`);
  shell.style.setProperty("--preview-start-scale-y", `${startScaleY}`);
  shell.style.setProperty("--preview-shift-x", `${startShiftX}px`);
  shell.style.setProperty("--preview-shift-y", `${startShiftY}px`);
}

function clampValue(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
