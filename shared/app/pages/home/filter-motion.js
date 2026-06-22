export const ACTIVE_BROWSE_CLEAR_KEY = "__active-browse-clear__";
export const FILTER_OPTION_TOGGLE_DURATION_MS = 120;
export const FILTER_COUNT_PULSE_DURATION_MS = 280;

const ACTIVE_BROWSE_ENTER_DURATION_MS = 180;
const ACTIVE_BROWSE_EXIT_DURATION_MS = 140;
const ACTIVE_BROWSE_FLIP_DURATION_MS = 180;
const MOTION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getMotionDuration(durationMs) {
  return prefersReducedMotion() ? 1 : durationMs;
}

function animateNode(node, keyframes, durationMs, options = {}) {
  if (!(node instanceof HTMLElement) || typeof node.animate !== "function") {
    return null;
  }

  return node.animate(keyframes, {
    duration: getMotionDuration(durationMs),
    easing: options.easing || MOTION_EASING,
    fill: options.fill || "both",
  });
}

function freezeExitingChipPosition(node, container) {
  if (!(node instanceof HTMLElement) || !(container instanceof HTMLElement)) {
    return;
  }

  const containerRect = container.getBoundingClientRect();
  const nodeRect = node.getBoundingClientRect();
  node.style.position = "absolute";
  node.style.left = `${nodeRect.left - containerRect.left}px`;
  node.style.top = `${nodeRect.top - containerRect.top}px`;
  node.style.width = `${nodeRect.width}px`;
  node.style.height = `${nodeRect.height}px`;
  node.style.margin = "0";
  node.style.zIndex = "2";
  node.style.pointerEvents = "none";
}

export function resetExitingChipPosition(node) {
  if (!(node instanceof HTMLElement)) {
    return;
  }

  node.style.position = "";
  node.style.left = "";
  node.style.top = "";
  node.style.width = "";
  node.style.height = "";
  node.style.margin = "";
  node.style.zIndex = "";
  node.style.pointerEvents = "";
}

export function cancelPendingExit(node) {
  if (!(node instanceof HTMLElement)) {
    return;
  }

  if (node.__activeBrowseExitTimer) {
    window.clearTimeout(node.__activeBrowseExitTimer);
    node.__activeBrowseExitTimer = 0;
  }

  node.__activeBrowseExitAnimation?.cancel?.();
  node.__activeBrowseExitAnimation = null;
  node.classList.remove("is-exiting");
  node.removeAttribute("aria-hidden");
}

export function restartAnimationClass(node, className, durationMs) {
  if (!(node instanceof HTMLElement)) {
    return;
  }

  if (node[`__${className}Timer`]) {
    window.clearTimeout(node[`__${className}Timer`]);
  }

  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
  node[`__${className}Timer`] = window.setTimeout(() => {
    node.classList.remove(className);
    node[`__${className}Timer`] = 0;
  }, getMotionDuration(durationMs));
}

export function captureRects(items) {
  return new Map(
    items
      .filter((item) => item?.node instanceof HTMLElement && !item.node.hidden)
      .map((item) => [item.key, item.node.getBoundingClientRect()]),
  );
}

export function playFlipAnimations(items, firstRects) {
  if (prefersReducedMotion()) {
    return;
  }

  items.forEach((item) => {
    if (!(item?.node instanceof HTMLElement) || item.node.hidden) {
      return;
    }

    const firstRect = firstRects.get(item.key);
    if (!firstRect) {
      return;
    }

    const lastRect = item.node.getBoundingClientRect();
    const deltaX = firstRect.left - lastRect.left;
    const deltaY = firstRect.top - lastRect.top;
    if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) {
      return;
    }

    animateNode(
      item.node,
      [
        { transform: `translate(${deltaX}px, ${deltaY}px)` },
        { transform: "translate(0, 0)" },
      ],
      ACTIVE_BROWSE_FLIP_DURATION_MS,
    );
  });
}

export function playEnterAnimation(node) {
  if (!(node instanceof HTMLElement)) {
    return;
  }

  node.classList.remove("is-exiting");
  if (prefersReducedMotion()) {
    return;
  }

  animateNode(
    node,
    [
      { opacity: 0, transform: "translateY(6px) scale(0.96)" },
      { opacity: 1, transform: "translateY(0) scale(1)" },
    ],
    ACTIVE_BROWSE_ENTER_DURATION_MS,
  );
}

export function scheduleChipExit(node, container, onAfterExit) {
  if (!(node instanceof HTMLElement)) {
    return;
  }

  cancelPendingExit(node);
  freezeExitingChipPosition(node, container);
  node.classList.add("is-exiting");
  node.setAttribute("aria-hidden", "true");
  node.__activeBrowseExitAnimation = animateNode(
    node,
    [
      { opacity: 1, transform: "translateY(0) scale(1)" },
      { opacity: 0, transform: "translateY(6px) scale(0.96)" },
    ],
    ACTIVE_BROWSE_EXIT_DURATION_MS,
  );
  node.__activeBrowseExitTimer = window.setTimeout(() => {
    node.__activeBrowseExitTimer = 0;
    node.__activeBrowseExitAnimation = null;
    node.remove();
    onAfterExit();
  }, getMotionDuration(ACTIVE_BROWSE_EXIT_DURATION_MS));
}

export function scheduleClearExit(button, onAfterExit) {
  if (!(button instanceof HTMLButtonElement) || button.hidden) {
    onAfterExit();
    return;
  }

  cancelPendingExit(button);
  button.classList.add("is-exiting");
  button.setAttribute("aria-hidden", "true");
  button.disabled = true;
  button.__activeBrowseExitAnimation = animateNode(
    button,
    [
      { opacity: 1, transform: "translateY(0) scale(1)" },
      { opacity: 0, transform: "translateY(6px) scale(0.96)" },
    ],
    ACTIVE_BROWSE_EXIT_DURATION_MS,
  );
  button.__activeBrowseExitTimer = window.setTimeout(() => {
    button.__activeBrowseExitTimer = 0;
    button.__activeBrowseExitAnimation = null;
    button.hidden = true;
    button.classList.remove("is-exiting");
    button.removeAttribute("aria-hidden");
    button.disabled = false;
    onAfterExit();
  }, getMotionDuration(ACTIVE_BROWSE_EXIT_DURATION_MS));
}

export function syncActiveBrowseVisibility(activeBrowseState, activeBrowseChips, activeBrowseClear) {
  if (!activeBrowseState || !activeBrowseChips || !activeBrowseClear) {
    return;
  }

  const hasLiveChip = activeBrowseChips.querySelector(".active-browse-chip:not(.is-exiting)");
  const hasExitingChip = activeBrowseChips.querySelector(".active-browse-chip.is-exiting");
  const clearVisible = !activeBrowseClear.hidden || activeBrowseClear.classList.contains("is-exiting");
  activeBrowseState.hidden = !hasLiveChip && !hasExitingChip && !clearVisible;
}

export function createActiveBrowseChip(descriptor, onAfterRemove) {
  const button = document.createElement("button");
  button.className = "active-browse-chip";
  button.type = "button";
  button.dataset.activeBrowseId = descriptor.id;
  button.setAttribute("aria-label", `Remove ${descriptor.label}`);
  button.__descriptorId = descriptor.id;
  button.__descriptorRemove = descriptor.remove;

  const label = document.createElement("span");
  label.className = "active-browse-chip-label";
  label.textContent = descriptor.label;

  const remove = document.createElement("span");
  remove.className = "active-browse-chip-remove";
  remove.setAttribute("aria-hidden", "true");
  remove.textContent = "×";

  button.append(label, remove);
  button.addEventListener("click", () => {
    button.__descriptorRemove?.();
    onAfterRemove();
  });
  return button;
}
