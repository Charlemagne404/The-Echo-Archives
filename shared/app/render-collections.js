import { getCollectionShows } from "./data.js";
import { createArchiveCollectionHref, createCollectionHref } from "./urls.js";

export function createCollectionCard(collection, index, showMap, { isClone = false } = {}) {
  const collectionShows = getCollectionShows(collection, showMap);
  const coverShow = collectionShows[0];
  const card = document.createElement("a");
  card.className = "collection-card";
  card.href = createCollectionHref(collection.id);
  card.setAttribute("aria-label", `Browse the ${collection.title} collection`);
  card.dataset.collectionId = collection.id;
  if (isClone) {
    card.dataset.collectionClone = "true";
    card.tabIndex = -1;
    card.setAttribute("aria-hidden", "true");
  }

  if (coverShow?.cover) {
    card.style.setProperty("--collection-cover-image", `url("/${coverShow.cover}")`);
  }

  const title = document.createElement("h3");
  title.textContent = collection.title;

  const footer = document.createElement("div");
  footer.className = "collection-card-footer";

  const count = document.createElement("p");
  count.className = "collection-card-count";
  count.textContent = `${collectionShows.length} ${collectionShows.length === 1 ? "show" : "shows"}`;

  const cta = document.createElement("span");
  cta.className = "collection-card-cta";
  cta.textContent = "Browse";

  footer.append(count, cta);
  card.append(title, footer);
  return card;
}

export function createCollectionDirectoryCard(collection, shows) {
  const article = document.createElement("article");
  article.className = "page-card collection-directory-card";

  const kicker = document.createElement("p");
  kicker.className = "page-card-kicker";
  kicker.textContent = collection.featured ? "Featured collection" : "Collection";

  const title = document.createElement("h2");
  title.textContent = collection.title;

  const description = document.createElement("p");
  description.textContent = collection.description;

  const meta = document.createElement("p");
  meta.className = "collection-directory-meta";
  meta.textContent = `${shows.length} shows • ${collection.kind || "curated"}`;

  const actions = document.createElement("div");
  actions.className = "collection-directory-actions";

  const collectionLink = document.createElement("a");
  collectionLink.className = "collection-action";
  collectionLink.href = createCollectionHref(collection.id);
  collectionLink.textContent = "Open collection";

  const archiveLink = document.createElement("a");
  archiveLink.className = "collection-secondary-link";
  archiveLink.href = createArchiveCollectionHref(collection.id);
  archiveLink.textContent = "Browse in archive";

  actions.append(collectionLink, archiveLink);
  article.append(kicker, title, description, meta, actions);
  return article;
}

export function createCollectionDirectoryDivider() {
  const divider = document.createElement("div");
  divider.className = "collection-directory-divider";
  divider.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.className = "collection-directory-divider-label";
  label.textContent = "More collections";

  divider.appendChild(label);
  return divider;
}

export function getCollectionShowReason(collection, showId) {
  const reason = collection?.showReasons?.[showId];
  return typeof reason === "string" && reason.trim() ? reason.trim() : "";
}

export function getShowCollectionMemberships(showId, collections = []) {
  return collections
    .filter((collection) => Array.isArray(collection.showIds) && collection.showIds.includes(showId))
    .sort((left, right) => Number(Boolean(right.featured)) - Number(Boolean(left.featured)))
    .map((collection) => ({
      id: collection.id,
      title: collection.title,
      reason: getCollectionShowReason(collection, showId),
      featured: Boolean(collection.featured),
    }));
}
