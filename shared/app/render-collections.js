import { getCollectionShows } from "./data.js";
import { configureImageElement, resolveImageSrc } from "./images.js";
import { createArchiveCollectionHref, createCollectionHref } from "./urls.js";
import { toDisplayTag } from "./utils.js";

const COLLAGE_LIMIT = 4;

function getShowCountLabel(shows) {
  return `${shows.length} ${shows.length === 1 ? "show" : "shows"}`;
}

function getCollectionMetaLabel(collection, shows) {
  return [getShowCountLabel(shows), collection.commitment || collection.kind || "Curated path"]
    .filter(Boolean)
    .join(" / ");
}

function applyCollectionAccent(node, shows) {
  const accent = shows.find((show) => show?.accent?.hex)?.accent?.hex;
  if (accent) {
    node.style.setProperty("--collection-accent", accent);
  }
}

export function getCollectionAnchorShow(collection, showsOrMap) {
  const anchorShowId = String(collection?.anchorShowId || "").trim();
  if (!anchorShowId) {
    return null;
  }

  if (showsOrMap instanceof Map) {
    return showsOrMap.get(anchorShowId) || null;
  }

  if (Array.isArray(showsOrMap)) {
    return showsOrMap.find((show) => show?.id === anchorShowId) || null;
  }

  return null;
}

export function getCollectionCoverShows(collection, shows, limit = COLLAGE_LIMIT) {
  const collectionRecord = collection || {};
  const showRecords = Array.isArray(shows) ? shows : [];
  const showMap = new Map(showRecords.map((show) => [show.id, show]));
  const preferred = (collectionRecord.coverShowIds || []).map((showId) => showMap.get(showId)).filter(Boolean);
  const remaining = showRecords.filter((show) => !preferred.some((preferredShow) => preferredShow.id === show.id));
  return [...preferred, ...remaining].slice(0, limit);
}

function getCollectionCollageShows(collection, shows, { anchorShow = null, limit = COLLAGE_LIMIT } = {}) {
  const coverShows = getCollectionCoverShows(collection, shows, limit);
  if (!anchorShow) {
    return coverShows;
  }

  return [anchorShow, ...coverShows.filter((show) => show.id !== anchorShow.id)].slice(0, limit);
}

export function createCollectionCoverCollage(
  collection,
  shows,
  { className = "collection-cover-collage", loading = "lazy", anchorShow = null } = {},
) {
  const coverShows = getCollectionCollageShows(collection, shows, { anchorShow });
  const collage = document.createElement("div");
  collage.className = className;
  collage.setAttribute("aria-hidden", "true");

  coverShows.forEach((show, index) => {
    const frame = document.createElement("span");
    frame.className = "collection-cover-frame";
    frame.dataset.coverIndex = String(index + 1);

    const image = document.createElement("img");
    image.src = show.imageSrc || resolveImageSrc(show.cover);
    image.alt = "";
    configureImageElement(image, {
      loading,
      width: 320,
      height: 320,
    });

    frame.appendChild(image);
    collage.appendChild(frame);
  });

  return collage;
}

export function createCollectionIntentTagList(collection, maxItems = 3) {
  const list = document.createElement("div");
  list.className = "collection-intent-tags";
  (collection.intentTags || []).slice(0, maxItems).forEach((tag) => {
    const item = document.createElement("span");
    item.textContent = toDisplayTag(tag);
    list.appendChild(item);
  });
  return list;
}

export function createCollectionHeroTagList(collection, maxItems = 3) {
  const list = document.createElement("div");
  list.className = "collection-intent-tags collection-hero-tags";

  if (collection.label) {
    const label = document.createElement("span");
    label.className = "collection-intent-tag-featured";
    label.textContent = collection.label;
    list.appendChild(label);
  }

  (collection.intentTags || []).slice(0, maxItems).forEach((tag) => {
    const item = document.createElement("span");
    item.textContent = toDisplayTag(tag);
    list.appendChild(item);
  });

  return list;
}

export function createCollectionCard(collection, index, showMap, { isClone = false } = {}) {
  const collectionShows = getCollectionShows(collection, showMap);
  const anchorShow = getCollectionAnchorShow(collection, showMap);
  const coverShow = anchorShow || getCollectionCoverShows(collection, collectionShows, 1)[0];
  const collectionId = collection.id || "";
  const title = collection.title || "Untitled collection";
  const card = document.createElement("a");
  card.className = "collection-card";
  card.href = collectionId ? createCollectionHref(collectionId) : "/collections";
  card.setAttribute("aria-label", `Browse the ${title} collection`);
  card.dataset.collectionId = collectionId;
  if (anchorShow?.id) {
    card.dataset.anchorShowId = anchorShow.id;
  }
  if (isClone) {
    card.dataset.collectionClone = "true";
    card.tabIndex = -1;
    card.setAttribute("aria-hidden", "true");
  }

  if (coverShow?.imageSrc || coverShow?.cover) {
    card.style.setProperty("--collection-cover-image", `url("${coverShow.imageSrc || resolveImageSrc(coverShow.cover)}")`);
  }
  applyCollectionAccent(card, anchorShow ? [anchorShow, ...collectionShows] : collectionShows);

  const titleNode = document.createElement("h3");
  titleNode.textContent = title;

  const footer = document.createElement("div");
  footer.className = "collection-card-footer";

  const count = document.createElement("p");
  count.className = "collection-card-count";
  count.textContent = getShowCountLabel(collectionShows);

  const cta = document.createElement("span");
  cta.className = "collection-card-cta";
  cta.textContent = "Browse";

  footer.append(count, cta);
  card.append(titleNode, footer);
  return card;
}

export function createCollectionFeatureCard(collection, shows, { anchorShow = null } = {}) {
  const collectionId = collection.id || "";
  const titleText = collection.title || "Untitled collection";
  const card = document.createElement("a");
  card.className = "collections-feature-card";
  card.href = collectionId ? createCollectionHref(collectionId) : "/collections";
  card.dataset.collectionId = collectionId;
  if (anchorShow?.id) {
    card.dataset.anchorShowId = anchorShow.id;
  }
  card.setAttribute("aria-label", `Open the ${titleText} collection`);
  applyCollectionAccent(card, anchorShow ? [anchorShow, ...(shows || [])] : shows);

  const label = document.createElement("span");
  label.className = "collections-card-label";
  label.textContent = collection.label || "Curated route";

  const title = document.createElement("h3");
  title.textContent = titleText;

  const description = document.createElement("p");
  description.textContent = collection.description || "Collection description not cataloged yet.";

  const meta = document.createElement("p");
  meta.className = "collections-card-meta";
  meta.textContent = getCollectionMetaLabel(collection, shows);

  const body = document.createElement("div");
  body.className = "collections-feature-card-body";
  body.append(label, title, description, meta, createCollectionIntentTagList(collection));

  card.append(createCollectionCoverCollage(collection, shows, { anchorShow }), body);
  return card;
}

export function createCollectionDirectoryCard(collection, shows, { compact = false, anchorShow = null } = {}) {
  const collectionId = collection.id || "";
  const titleText = collection.title || "Untitled collection";
  const article = document.createElement("a");
  article.className = compact ? "collections-directory-card collections-directory-card-compact" : "collections-directory-card";
  article.href = collectionId ? createCollectionHref(collectionId) : "/collections";
  article.dataset.collectionId = collectionId;
  if (anchorShow?.id) {
    article.dataset.anchorShowId = anchorShow.id;
  }
  article.dataset.intentTags = (collection.intentTags || []).join(" ");
  article.setAttribute("aria-label", `Open the ${titleText} collection`);
  applyCollectionAccent(article, anchorShow ? [anchorShow, ...(shows || [])] : shows);

  const cover = createCollectionCoverCollage(collection, shows, {
    className: compact
      ? "collection-cover-collage collection-cover-collage-compact collection-cover-collage-rail"
      : "collection-cover-collage collection-cover-collage-compact",
    anchorShow,
  });

  const label = document.createElement("span");
  label.className = "collections-card-label";
  label.textContent = collection.label || (collection.featured ? "Featured route" : "Curated route");

  const title = document.createElement("h3");
  title.textContent = titleText;

  const description = document.createElement("p");
  description.className = "collections-directory-description";
  description.textContent = collection.description || "Collection description not cataloged yet.";

  const meta = document.createElement("p");
  meta.className = "collections-card-meta";
  meta.textContent = getCollectionMetaLabel(collection, shows);

  const actions = document.createElement("div");
  actions.className = "collection-directory-actions";

  const collectionLink = document.createElement("span");
  collectionLink.className = "collection-action";
  collectionLink.textContent = "Open collection";

  actions.append(collectionLink);
  article.append(cover, label, title, description, meta, createCollectionIntentTagList(collection, compact ? 3 : 999), actions);
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
