import { createHomePreviewHelpers } from "./home-preview/helpers.js";

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
  const {
    closeActivePreview,
    closeShell,
    getPreviewShell,
    getTopPreviewShellAtPoint,
    handleScrollActivity,
    isPointWithinPreviewPanel,
    isTouchLikeActivation,
    isWithinPreview,
    openShell,
    positionActiveShell,
    scheduleClose,
    scheduleOpen,
  } = createHomePreviewHelpers({
    state,
    archiveGrid,
    archiveSection,
    coarsePointerQuery,
    hoverlessPointerQuery,
  });

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

    if (coarsePointerQuery.matches) {
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

    positionActiveShell();
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
