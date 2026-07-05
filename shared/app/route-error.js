export function createRouteErrorSurface({
  title,
  explanation,
  primaryAction,
  secondaryAction,
  onRetry,
}) {
  const card = document.createElement("article");
  card.className = "empty-state-card route-error-surface";
  card.setAttribute("role", "alert");

  const heading = document.createElement("h2");
  heading.textContent = title || "This archive view could not load";

  const copy = document.createElement("p");
  copy.textContent = explanation || "The site could not load the archive data needed for this page.";

  const actions = document.createElement("div");
  actions.className = "empty-state-actions";

  if (typeof onRetry === "function") {
    const retryButton = document.createElement("button");
    retryButton.className = "quick-filter";
    retryButton.type = "button";
    retryButton.textContent = "Try again";
    retryButton.addEventListener("click", onRetry);
    actions.appendChild(retryButton);
  }

  if (primaryAction?.href) {
    actions.appendChild(createRouteErrorLink(primaryAction, "collection-action"));
  }
  if (secondaryAction?.href) {
    actions.appendChild(createRouteErrorLink(secondaryAction, "collection-secondary-link"));
  }

  card.append(heading, copy, actions);
  return card;
}

export function renderRouteErrorSurface(root, options) {
  if (!root) {
    return;
  }

  root.textContent = "";
  root.appendChild(createRouteErrorSurface(options));
}

function createRouteErrorLink(action, className) {
  const link = document.createElement("a");
  link.className = className;
  link.href = action.href;
  link.textContent = action.label;
  return link;
}
