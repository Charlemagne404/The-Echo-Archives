const COMMUNITY_BODY_OPEN_DURATION_MS = 220;
const COMMUNITY_BODY_CLOSE_DURATION_MS = 180;
const COMMUNITY_CONFIRM_DURATION_MS = 520;
const COMMUNITY_METRIC_ROLL_DURATION_MS = 320;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getMotionDuration(durationMs) {
  return prefersReducedMotion() ? 1 : durationMs;
}

function prepareRollingTextNode(node) {
  if (!(node instanceof HTMLElement)) {
    return;
  }

  node.classList.add("community-roll-host");
  node.dataset.displayText = node.textContent || "";
}

function clearRollingTextMotion(node) {
  if (!(node instanceof HTMLElement)) {
    return;
  }

  if (node.__communityRollTimer) {
    window.clearTimeout(node.__communityRollTimer);
    node.__communityRollTimer = 0;
  }

  if (node.__communityRollFrame) {
    window.cancelAnimationFrame(node.__communityRollFrame);
    node.__communityRollFrame = 0;
  }
}

function finalizeRollingTextNode(node, text) {
  clearRollingTextMotion(node);
  node.classList.remove("is-rolling", "is-rolling-active");
  node.removeAttribute("aria-label");
  node.textContent = text;
  node.dataset.displayText = text;
}

function setRollingTextNodeContent(node, nextText, shouldAnimate) {
  if (!(node instanceof HTMLElement)) {
    return;
  }

  const text = String(nextText ?? "");
  const currentText = node.dataset.displayText ?? node.textContent ?? "";
  if (currentText === text && !node.classList.contains("is-rolling")) {
    return;
  }

  clearRollingTextMotion(node);
  if (!shouldAnimate || prefersReducedMotion()) {
    finalizeRollingTextNode(node, text);
    return;
  }

  const outgoing = document.createElement("span");
  outgoing.className = "community-roll-value is-current";
  outgoing.textContent = currentText;
  outgoing.setAttribute("aria-hidden", "true");

  const incoming = document.createElement("span");
  incoming.className = "community-roll-value is-next";
  incoming.textContent = text;
  incoming.setAttribute("aria-hidden", "true");

  node.dataset.displayText = text;
  node.textContent = "";
  node.classList.add("is-rolling");
  node.setAttribute("aria-label", text);
  node.append(outgoing, incoming);

  node.__communityRollFrame = window.requestAnimationFrame(() => {
    node.__communityRollFrame = 0;
    node.classList.add("is-rolling-active");
  });

  node.__communityRollTimer = window.setTimeout(() => {
    node.__communityRollTimer = 0;
    finalizeRollingTextNode(node, text);
  }, getMotionDuration(COMMUNITY_METRIC_ROLL_DURATION_MS));
}

function clearDetailBodyMotion(widget) {
  if (widget.bodyTimer) {
    window.clearTimeout(widget.bodyTimer);
    widget.bodyTimer = 0;
  }

  if (widget.bodyFrame) {
    window.cancelAnimationFrame(widget.bodyFrame);
    widget.bodyFrame = 0;
  }
}

function openDetailWidgetBody(widget) {
  const { body, root } = widget;
  const startHeight = body.hidden ? 0 : body.getBoundingClientRect().height;

  body.hidden = false;
  body.dataset.state = "closed";
  body.style.height = `${startHeight}px`;
  body.style.opacity = "0";
  body.style.transform = "translateY(-8px)";
  root.classList.add("is-expanded");

  widget.bodyFrame = window.requestAnimationFrame(() => {
    widget.bodyFrame = 0;
    body.dataset.state = "opening";
    body.style.height = `${body.scrollHeight}px`;
    body.style.opacity = "1";
    body.style.transform = "translateY(0)";
    widget.bodyTimer = window.setTimeout(() => {
      widget.bodyTimer = 0;
      body.dataset.state = "open";
      body.style.height = "";
      body.style.opacity = "";
      body.style.transform = "";
    }, getMotionDuration(COMMUNITY_BODY_OPEN_DURATION_MS));
  });
}

function closeDetailWidgetBody(widget) {
  const { body, root } = widget;
  const startHeight = body.getBoundingClientRect().height || body.scrollHeight;

  body.hidden = false;
  body.dataset.state = "open";
  body.style.height = `${startHeight}px`;
  body.style.opacity = "1";
  body.style.transform = "translateY(0)";
  root.classList.remove("is-expanded");

  widget.bodyFrame = window.requestAnimationFrame(() => {
    widget.bodyFrame = 0;
    body.dataset.state = "closing";
    body.style.height = "0px";
    body.style.opacity = "0";
    body.style.transform = "translateY(-8px)";
    widget.bodyTimer = window.setTimeout(() => {
      widget.bodyTimer = 0;
      body.hidden = true;
      body.dataset.state = "closed";
      body.style.height = "";
      body.style.opacity = "";
      body.style.transform = "";
    }, getMotionDuration(COMMUNITY_BODY_CLOSE_DURATION_MS));
  });
}

function restartAnimationClass(node, className, durationMs) {
  if (!(node instanceof HTMLElement)) {
    return;
  }

  const timerKey = `__${className}Timer`;
  if (node[timerKey]) {
    window.clearTimeout(node[timerKey]);
  }

  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
  node[timerKey] = window.setTimeout(() => {
    node.classList.remove(className);
    node[timerKey] = 0;
  }, getMotionDuration(durationMs));
}

function playRatingConfirmation(widget, rating) {
  restartAnimationClass(widget.root, "is-confirming", COMMUNITY_CONFIRM_DURATION_MS);
  const button = widget.ratingButtons[rating - 1];
  restartAnimationClass(button, "is-confirmed", COMMUNITY_CONFIRM_DURATION_MS);
}

export {
  clearDetailBodyMotion,
  closeDetailWidgetBody,
  openDetailWidgetBody,
  playRatingConfirmation,
  prefersReducedMotion,
  prepareRollingTextNode,
  setRollingTextNodeContent,
};
