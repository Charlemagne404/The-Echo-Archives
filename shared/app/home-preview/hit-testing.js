export function getPreviewShell(target) {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest('.podcast-card-shell[data-preview-card="true"]');
}

export function hasFocusedPreviewTarget(shell) {
  const activeElement = document.activeElement;
  if (!shell || !(activeElement instanceof Element) || !shell.contains(activeElement)) {
    return false;
  }

  return !activeElement.closest(".home-card-preview-layer[hidden]");
}

export function getTopPreviewShellAtPoint(clientX, clientY, resolvePreviewShell = getPreviewShell) {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    return null;
  }

  const elements = document.elementsFromPoint(clientX, clientY);
  for (const element of elements) {
    const shell = resolvePreviewShell(element);
    if (shell) {
      return shell;
    }
  }

  return null;
}

export function isPointWithinPreviewPanel(shell, clientX, clientY, getPreviewLayer, getPreviewPanel) {
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

export function isWithinPreview(target, activeShell) {
  if (!(target instanceof Node)) {
    return false;
  }

  return activeShell?.contains(target) || false;
}
