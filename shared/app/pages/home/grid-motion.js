const GRID_MOTION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

const GRID_MOTION_PROFILES = {
  explicit: {
    enterDuration: 170,
    exitDuration: 150,
    flipDuration: 230,
  },
  "live-search": {
    enterDuration: 120,
    exitDuration: 110,
    flipDuration: 150,
  },
};

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getMotionDuration(durationMs) {
  return prefersReducedMotion() ? 1 : durationMs;
}

function animateShell(shell, keyframes, durationMs) {
  if (!(shell instanceof HTMLElement) || typeof shell.animate !== "function") {
    return null;
  }

  return shell.animate(keyframes, {
    duration: getMotionDuration(durationMs),
    easing: GRID_MOTION_EASING,
    fill: "both",
  });
}

function readAnimationDuration(animation) {
  const duration = animation?.effect?.getTiming?.()?.duration;
  return typeof duration === "number" ? duration : 0;
}

function cleanupAnimation(shell, key, className, animation) {
  animation?.finished
    ?.then(() => {
      if (shell[key] !== animation) {
        return;
      }

      shell[key] = null;
      shell.classList.remove(className);
      animation.cancel();
    })
    .catch(() => {});
}

function clearAnimation(shell, key, className) {
  shell[key]?.cancel?.();
  shell[key] = null;
  shell.classList.remove(className);
}

function resetFrozenShellPosition(shell) {
  shell.style.position = "";
  shell.style.left = "";
  shell.style.top = "";
  shell.style.width = "";
  shell.style.height = "";
  shell.style.margin = "";
  shell.style.zIndex = "";
  shell.style.pointerEvents = "";
}

function getShellKey(shell) {
  return shell.dataset.podcastId || "";
}

export function getGridMotionProfile(changeReason) {
  if (prefersReducedMotion()) {
    return null;
  }

  return GRID_MOTION_PROFILES[changeReason] || null;
}

export function setGridMotionMetadata(archiveGrid, changeReason, motionProfile) {
  if (!(archiveGrid instanceof HTMLElement)) {
    return;
  }

  archiveGrid.dataset.gridMotionReason = changeReason;
  archiveGrid.dataset.gridMotionFlipDuration = String(motionProfile?.flipDuration || 0);
  archiveGrid.dataset.gridMotionEnterDuration = String(motionProfile?.enterDuration || 0);
  archiveGrid.dataset.gridMotionExitDuration = String(motionProfile?.exitDuration || 0);
}

export function captureGridShellRects(shells) {
  return new Map(
    shells
      .filter((shell) => shell instanceof HTMLElement && !shell.hidden)
      .map((shell) => [getShellKey(shell), shell.getBoundingClientRect()]),
  );
}

export function resetGridShellMotion(shell) {
  if (!(shell instanceof HTMLElement)) {
    return;
  }

  if (shell.__gridExitTimer) {
    window.clearTimeout(shell.__gridExitTimer);
    shell.__gridExitTimer = 0;
  }

  clearAnimation(shell, "__gridExitAnimation", "is-grid-exiting");
  clearAnimation(shell, "__gridEnterAnimation", "is-grid-entering");
  clearAnimation(shell, "__gridFlipAnimation", "is-grid-flipping");
  resetFrozenShellPosition(shell);
  shell.removeAttribute("aria-hidden");
}

export function freezeGridShellPosition(shell, archiveGrid) {
  if (!(shell instanceof HTMLElement) || !(archiveGrid instanceof HTMLElement)) {
    return;
  }

  const gridRect = archiveGrid.getBoundingClientRect();
  const shellRect = shell.getBoundingClientRect();
  shell.style.position = "absolute";
  shell.style.left = `${shellRect.left - gridRect.left}px`;
  shell.style.top = `${shellRect.top - gridRect.top}px`;
  shell.style.width = `${shellRect.width}px`;
  shell.style.height = `${shellRect.height}px`;
  shell.style.margin = "0";
  shell.style.zIndex = "2";
  shell.style.pointerEvents = "none";
}

export function playGridEnterAnimation(shell, durationMs) {
  if (!(shell instanceof HTMLElement) || durationMs <= 0) {
    return;
  }

  clearAnimation(shell, "__gridEnterAnimation", "is-grid-entering");
  shell.classList.add("is-grid-entering");
  shell.__gridEnterAnimation = animateShell(
    shell,
    [
      { opacity: 0, transform: "translateY(14px)" },
      { opacity: 1, transform: "translateY(0)" },
    ],
    durationMs,
  );
  if (!shell.__gridEnterAnimation) {
    shell.classList.remove("is-grid-entering");
    return;
  }
  cleanupAnimation(shell, "__gridEnterAnimation", "is-grid-entering", shell.__gridEnterAnimation);
}

export function playGridFlipAnimation(shell, firstRect, durationMs) {
  if (!(shell instanceof HTMLElement) || typeof firstRect?.left !== "number" || durationMs <= 0) {
    return;
  }

  const lastRect = shell.getBoundingClientRect();
  const deltaX = firstRect.left - lastRect.left;
  const deltaY = firstRect.top - lastRect.top;
  if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) {
    return;
  }

  clearAnimation(shell, "__gridFlipAnimation", "is-grid-flipping");
  shell.classList.add("is-grid-flipping");
  shell.__gridFlipAnimation = animateShell(
    shell,
    [
      { transform: `translate(${deltaX}px, ${deltaY}px)` },
      { transform: "translate(0, 0)" },
    ],
    durationMs,
  );
  if (!shell.__gridFlipAnimation) {
    shell.classList.remove("is-grid-flipping");
    return;
  }
  cleanupAnimation(shell, "__gridFlipAnimation", "is-grid-flipping", shell.__gridFlipAnimation);
}

export function scheduleGridExit(shell, durationMs) {
  if (!(shell instanceof HTMLElement) || durationMs <= 0) {
    return;
  }

  if (shell.__gridExitTimer) {
    window.clearTimeout(shell.__gridExitTimer);
  }

  clearAnimation(shell, "__gridExitAnimation", "is-grid-exiting");
  shell.classList.add("is-grid-exiting");
  shell.setAttribute("aria-hidden", "true");
  shell.__gridExitAnimation = animateShell(
    shell,
    [
      { opacity: 1, transform: "translateY(0)" },
      { opacity: 0, transform: "translateY(14px)" },
    ],
    durationMs,
  );
  shell.__gridExitTimer = window.setTimeout(() => {
    shell.__gridExitTimer = 0;
    shell.__gridExitAnimation = null;
    resetFrozenShellPosition(shell);
    shell.remove();
  }, readAnimationDuration(shell.__gridExitAnimation) || getMotionDuration(durationMs));
}
