import {
  SHOW_CARD_PREVIEW_CLOSE_DELAY_MS,
  SHOW_CARD_PREVIEW_CLOSE_TRANSITION_MS,
  SHOW_CARD_PREVIEW_DELAY_MS,
  SHOW_CARD_PREVIEW_SCROLL_IDLE_MS,
} from "../constants.js";
import {
  getPreviewShell,
  getTopPreviewShellAtPoint,
  hasFocusedPreviewTarget,
  isPointWithinPreviewPanel,
  isWithinPreview,
} from "./hit-testing.js";
import { positionHomeCardPreview } from "./position.js";

export function createHomePreviewHelpers({ state, archiveGrid, archiveSection, coarsePointerQuery, hoverlessPointerQuery }) {
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

  function getEligibleOpenShell() {
    if (state.focusShell?.isConnected && hasFocusedPreviewTarget(state.focusShell)) {
      return state.focusShell;
    }

    if (state.hoverShell?.isConnected && state.hoverShell.matches(":hover")) {
      return state.hoverShell;
    }

    return null;
  }

  const resolveTopPreviewShell = (clientX, clientY) => getTopPreviewShellAtPoint(clientX, clientY, getPreviewShell);
  const isPointWithinPreview = (shell, clientX, clientY) =>
    isPointWithinPreviewPanel(shell, clientX, clientY, getPreviewLayer, getPreviewPanel);
  const isTargetWithinPreview = (target) => isWithinPreview(target, state.activeShell);

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

  function positionActiveShell() {
    if (!state.activeShell) {
      return;
    }

    positionHomeCardPreview(state.activeShell, archiveGrid, archiveSection);
  }

  return {
    closeActivePreview,
    closeShell,
    getPreviewShell,
    getTopPreviewShellAtPoint: resolveTopPreviewShell,
    handleScrollActivity,
    isPointWithinPreviewPanel: isPointWithinPreview,
    isTouchLikeActivation,
    isWithinPreview: isTargetWithinPreview,
    openShell,
    positionActiveShell,
    scheduleClose,
    scheduleOpen,
  };
}
