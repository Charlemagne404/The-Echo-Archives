import { prefersReducedMotion } from "./collections-motion.js";

const COLLECTIONS_MOTION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

const GRID_MOTION_PROFILES = {
  explicit: {
    enterDuration: 190,
    exitDuration: 150,
    flipDuration: 220,
    maxStagger: 72,
  },
  "live-search": {
    enterDuration: 130,
    exitDuration: 110,
    flipDuration: 160,
    maxStagger: 40,
  },
};

function getMotionDuration(durationMs) {
  return prefersReducedMotion() ? 1 : durationMs;
}

function animateNode(node, keyframes, durationMs, { delay = 0, fill = "both" } = {}) {
  if (!(node instanceof HTMLElement) || typeof node.animate !== "function" || durationMs <= 0) {
    return null;
  }

  return node.animate(keyframes, {
    duration: getMotionDuration(durationMs),
    delay: getMotionDuration(delay),
    easing: COLLECTIONS_MOTION_EASING,
    fill,
  });
}

function cleanupAnimation(node, key, state, animation) {
  animation?.finished
    ?.then(() => {
      if (node[key] !== animation) {
        return;
      }

      node[key] = null;
      if (node.dataset.collectionsMotionState === state) {
        node.dataset.collectionsMotionState = "settled";
      }
      animation.cancel();
    })
    .catch(() => {});
}

function readAnimationDuration(animation) {
  const duration = animation?.effect?.getTiming?.()?.duration;
  return typeof duration === "number" ? duration : 0;
}

function clearAnimation(node, key) {
  node[key]?.cancel?.();
  node[key] = null;
}

function resetFrozenGridItemPosition(node) {
  node.style.position = "";
  node.style.left = "";
  node.style.top = "";
  node.style.width = "";
  node.style.height = "";
  node.style.margin = "";
  node.style.zIndex = "";
  node.style.pointerEvents = "";
}

function clearGridTimers(node) {
  if (node.__collectionsExitTimer) {
    window.clearTimeout(node.__collectionsExitTimer);
    node.__collectionsExitTimer = 0;
  }
}

function resetGridItemMotion(node) {
  if (!(node instanceof HTMLElement)) {
    return;
  }

  clearGridTimers(node);
  clearAnimation(node, "__collectionsEnterAnimation");
  clearAnimation(node, "__collectionsFlipAnimation");
  clearAnimation(node, "__collectionsExitAnimation");
  resetFrozenGridItemPosition(node);
  node.dataset.collectionsMotionState = "settled";
  node.removeAttribute("aria-hidden");
}

function getGridChildren(root) {
  return Array.from(root.children).filter((node) => node instanceof HTMLElement);
}

function pruneUnkeyedGridItems(root) {
  getGridChildren(root).forEach((node) => {
    if (node.dataset.collectionId) {
      return;
    }

    resetGridItemMotion(node);
    node.remove();
  });
}

function pruneExitingGridItems(root) {
  getGridChildren(root).forEach((node) => {
    if (node.dataset.collectionsMotionState !== "exiting") {
      return;
    }

    resetGridItemMotion(node);
    node.remove();
  });
}

function captureGridItemRects(root) {
  return new Map(
    getGridChildren(root)
      .filter((node) => node.dataset.collectionsMotionState !== "exiting")
      .map((node) => [node.dataset.collectionId || "", node.getBoundingClientRect()])
      .filter(([key]) => Boolean(key)),
  );
}

function freezeGridItemPosition(node, root) {
  if (!(node instanceof HTMLElement) || !(root instanceof HTMLElement)) {
    return;
  }

  const rootRect = root.getBoundingClientRect();
  const nodeRect = node.getBoundingClientRect();
  node.style.position = "absolute";
  node.style.left = `${nodeRect.left - rootRect.left}px`;
  node.style.top = `${nodeRect.top - rootRect.top}px`;
  node.style.width = `${nodeRect.width}px`;
  node.style.height = `${nodeRect.height}px`;
  node.style.margin = "0";
  node.style.zIndex = "2";
  node.style.pointerEvents = "none";
}

function playGridEnterAnimation(node, durationMs, delayMs = 0) {
  if (!(node instanceof HTMLElement) || durationMs <= 0) {
    return;
  }

  node.dataset.collectionsMotionState = "entering";
  node.__collectionsEnterAnimation = animateNode(
    node,
    [
      { opacity: 0, transform: "translateY(14px) scale(0.985)" },
      { opacity: 1, transform: "translateY(0) scale(1)" },
    ],
    durationMs,
    { delay: delayMs },
  );
  cleanupAnimation(node, "__collectionsEnterAnimation", "entering", node.__collectionsEnterAnimation);
}

function playGridFlipAnimation(node, firstRect, durationMs, delayMs = 0) {
  if (!(node instanceof HTMLElement) || typeof firstRect?.left !== "number" || durationMs <= 0) {
    return;
  }

  const lastRect = node.getBoundingClientRect();
  const deltaX = firstRect.left - lastRect.left;
  const deltaY = firstRect.top - lastRect.top;
  if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) {
    return;
  }

  node.dataset.collectionsMotionState = "flipping";
  node.__collectionsFlipAnimation = animateNode(
    node,
    [
      { transform: `translate(${deltaX}px, ${deltaY}px)` },
      { transform: "translate(0, 0)" },
    ],
    durationMs,
    { delay: delayMs },
  );
  cleanupAnimation(node, "__collectionsFlipAnimation", "flipping", node.__collectionsFlipAnimation);
}

function scheduleGridExit(node, root, durationMs) {
  if (!(node instanceof HTMLElement)) {
    return;
  }

  resetGridItemMotion(node);
  freezeGridItemPosition(node, root);
  node.dataset.collectionsMotionState = "exiting";
  node.setAttribute("aria-hidden", "true");
  node.__collectionsExitAnimation = animateNode(
    node,
    [
      { opacity: 1, transform: "translateY(0) scale(1)" },
      { opacity: 0, transform: "translateY(14px) scale(0.985)" },
    ],
    durationMs,
  );
  node.__collectionsExitTimer = window.setTimeout(() => {
    node.__collectionsExitTimer = 0;
    node.__collectionsExitAnimation = null;
    resetFrozenGridItemPosition(node);
    node.remove();
  }, readAnimationDuration(node.__collectionsExitAnimation) || getMotionDuration(durationMs));
}

export function getCollectionsGridMotionProfile(changeReason) {
  if (prefersReducedMotion() || changeReason === "initial") {
    return null;
  }

  return GRID_MOTION_PROFILES[changeReason] || GRID_MOTION_PROFILES.explicit;
}

export function syncCollectionGrid(root, items, { renderItem, motionProfile = null } = {}) {
  if (!(root instanceof HTMLElement) || typeof renderItem !== "function") {
    return;
  }

  pruneUnkeyedGridItems(root);
  pruneExitingGridItems(root);
  const firstRects = motionProfile ? captureGridItemRects(root) : new Map();
  const existingNodes = new Map(
    getGridChildren(root)
      .map((node) => [node.dataset.collectionId || "", node])
      .filter(([key]) => Boolean(key)),
  );

  const nextNodes = items
    .map((item, index) => {
      const key = String(item?.id || "");
      if (!key) {
        return null;
      }

      let node = existingNodes.get(key);
      const isNew = !(node instanceof HTMLElement);
      if (!node) {
        node = renderItem(item, index);
      }
      if (!(node instanceof HTMLElement)) {
        return null;
      }

      resetGridItemMotion(node);
      node.dataset.collectionId = key;
      existingNodes.delete(key);
      return { key, node, isNew, index };
    })
    .filter(Boolean);

  nextNodes.forEach(({ node }) => {
    root.appendChild(node);
  });

  const exitingNodes = Array.from(existingNodes.values());
  if (!motionProfile) {
    exitingNodes.forEach((node) => {
      resetGridItemMotion(node);
      node.remove();
    });
    return;
  }

  nextNodes.forEach(({ key, node, isNew, index }) => {
    const delayMs = Math.min(index * 18, motionProfile.maxStagger || 0);
    if (isNew) {
      playGridEnterAnimation(node, motionProfile.enterDuration, delayMs);
      return;
    }

    playGridFlipAnimation(node, firstRects.get(key), motionProfile.flipDuration, delayMs);
  });

  exitingNodes.forEach((node) => scheduleGridExit(node, root, motionProfile.exitDuration));
}
