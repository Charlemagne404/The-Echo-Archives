import { getShellPreviewPanel } from "../render-cards.js";

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

export { positionHomeCardPreview };
