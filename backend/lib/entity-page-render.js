const { renderCollectionShowCard, renderCollectionDirectoryCard } = require("../../tools/lib/home-page-prerender");
const { BRAND_DESCRIPTOR, buildAbsoluteUrl, truncateDescription } = require("./seo");
const { injectPageMetadata, injectStructuredData, injectNoIndex } = require("./public-page-render");
const { derivePublicStatus, toPublicLabel } = require("../../shared/archive-record");
const { ROLE_LABELS, TYPE_LABELS, entityPath, escapeHtml, getEntityShows, getPublicDirectoryEntities, isIndexableEntity, matchesEntityQuery, entityStructuredData, showEntityStructuredData } = require("../../shared/archive-entities");

const DIRECTORY_FILTERS = [
  { value: "all", label: "All organizations" },
  { value: "production-company", label: "Production companies" },
  { value: "studio", label: "Studios" },
  { value: "network", label: "Networks" },
];
const DIRECTORY_FILTER_VALUES = new Set(DIRECTORY_FILTERS.map((filter) => filter.value));
const DIRECTORY_SORT_VALUES = new Set(["name", "shows"]);

function orderedShows(entity, shows) {
  return getEntityShows(entity.id, shows).sort((a, b) => a.title.localeCompare(b.title, "en") || a.id.localeCompare(b.id, "en"));
}

const ENTITY_DIRECTORY_TITLE = "Audio Drama Creators & Production Companies | The Echo Archives";
const ENTITY_SEO_LABELS = {
  person: "Audio Drama Creator",
  "production-company": "Audio Drama Production Company",
  studio: "Audio Drama Studio",
  network: "Fiction Podcast Network",
};

function cleanEntityText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function uniqueEntityText(values = []) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map(cleanEntityText)
    .filter((value) => {
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function entitySeoLabel(entity) {
  return ENTITY_SEO_LABELS[entity?.type] || "Audio Drama Creator";
}

function getEntityPageProfile(entity, shows, collections = []) {
  const catalogue = orderedShows(entity, shows);
  const showIds = new Set(catalogue.map((show) => show.id));
  const linkedCollections = (Array.isArray(collections) ? collections : [])
    .map((collection) => ({ collection, count: (collection.showIds || []).filter((id) => showIds.has(id)).length }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.collection.title.localeCompare(b.collection.title, "en"));
  const genres = uniqueEntityText(catalogue.flatMap((show) => Array.isArray(show.genres) ? show.genres : []));
  const tags = uniqueEntityText(catalogue.flatMap((show) => Array.isArray(show.tags) ? show.tags : []));
  const statuses = uniqueEntityText(catalogue.map((show) => derivePublicStatus(show)));
  return { catalogue, linkedCollections, genres, tags, statuses };
}

function getShowImageSource(show) {
  return show?.coverVariants?.find((variant) => variant.width === 640)?.src
    || show?.coverVariants?.find((variant) => variant.width === 320)?.src
    || show?.cover
    || "";
}

function getEntitySocialImage({ entity = null, entities = [], shows = [], siteUrl }) {
  const records = entity
    ? orderedShows(entity, shows)
    : getPublicDirectoryEntities(entities, shows)
      .map((record) => ({ record, catalogue: orderedShows(record, shows) }))
      .sort((a, b) => b.catalogue.length - a.catalogue.length || a.record.name.localeCompare(b.record.name, "en"))
      .flatMap(({ catalogue }) => catalogue);
  const source = getShowImageSource(records[0]);
  return source ? buildAbsoluteUrl(siteUrl, source) : buildAbsoluteUrl(siteUrl, "/echo-wordmark1.png");
}

function buildEntitySeoTitle(entity = null) {
  return entity ? `${cleanEntityText(entity.name)} — ${entitySeoLabel(entity)} | The Echo Archives` : ENTITY_DIRECTORY_TITLE;
}

function buildEntitySeoDescription(entity = null, shows = [], collections = [], entities = []) {
  if (!entity) {
    const directory = getPublicDirectoryEntities(entities, shows);
    const publicEntityIds = new Set(directory.map((record) => record.id));
    const connectedShowCount = shows.filter((show) => show.status === "published" && (show.entityLinks || []).some((link) => publicEntityIds.has(link.entityId))).length;
    return truncateDescription(`Browse ${directory.length} source-backed audio drama production companies, studios, and networks connected to ${connectedShowCount} fiction podcast shows. Find creator catalogues, listening links, and curated recommendations in The Echo Archives.`);
  }

  const profile = getEntityPageProfile(entity, shows, collections);
  const countLabel = `${profile.catalogue.length} ${profile.catalogue.length === 1 ? "show" : "shows"}`;
  const leadTitle = cleanEntityText(profile.catalogue[0]?.title);
  const sourceDescription = cleanEntityText(entity.description);
  const description = sourceDescription
    ? `${sourceDescription} Explore ${countLabel} connected audio dramas and fiction podcasts in The Echo Archives.`
    : `${cleanEntityText(entity.name)} — ${entitySeoLabel(entity)} with ${countLabel} in The Echo Archives${leadTitle ? `, including ${leadTitle}` : ""}. Find fiction podcast details, listening links, and curated collections.`;
  return truncateDescription(description);
}

function getEntityShowRoles(entity, show) {
  return [...new Set((show.entityLinks || [])
    .filter((link) => link.entityId === entity.id)
    .map((link) => ROLE_LABELS[link.role] || link.role)
    .filter(Boolean))];
}

function renderEntityShowCard(entity, show) {
  const roles = getEntityShowRoles(entity, show);
  const roleMarkup = roles.length
    ? `<p class="entity-show-role" aria-label="Archive relationship: ${escapeHtml(roles.join(", "))}">${roles.map(escapeHtml).join(" · ")}</p>`
    : "";
  return renderCollectionShowCard(show).replace("</h2>", `</h2>${roleMarkup}`);
}

function renderEntityArt(shows) {
  const covers = shows.slice(0, 4);
  const count = Math.max(1, covers.length);
  return `<span class="entity-art entity-art-count-${count}" aria-hidden="true">${covers.map((show) => {
    const cover = show.coverVariants?.find((variant) => variant.width === 320)?.src || show.cover;
    const src = /^https?:\/\//.test(cover) ? cover : `/${String(cover).replace(/^\/+/, "")}`;
    return `<img src="${escapeHtml(src)}" alt="" width="160" height="160" loading="lazy" decoding="async" />`;
  }).join("")}</span>`;
}

function renderEntityHeroArt(shows) {
  const covers = shows.slice(0, 4);
  return `<div class="collection-cover-collage collection-detail-collage entity-detail-collage">${covers.map((show, index) => {
    const cover = show.coverVariants?.find((variant) => variant.width === 320)?.src || show.cover;
    const src = /^https?:\/\//.test(cover) ? cover : `/${String(cover).replace(/^\/+/, "")}`;
    return `<span class="collection-cover-frame" data-cover-index="${index + 1}"><img src="${escapeHtml(src)}" alt="" loading="${index === 0 ? "eager" : "lazy"}" decoding="async" width="320" height="320" /></span>`;
  }).join("")}</div>`;
}

function renderArrowIcon({ external = false } = {}) {
  const path = external ? "M4 12 12 4M7 4h5v5" : "M2.75 8h10.5M8.75 4 12.75 8l-4 4";
  return `<svg class="entity-arrow-icon${external ? " entity-arrow-icon-external" : ""}" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="${path}" /></svg>`;
}

function renderEntityCard(entity, shows) {
  const catalogue = orderedShows(entity, shows);
  return `<article class="entity-card" data-entity-id="${escapeHtml(entity.id)}" data-entity-type="${escapeHtml(entity.type)}" data-entity-show-count="${catalogue.length}" data-entity-names="${escapeHtml(JSON.stringify([entity.name, ...entity.aliases]))}"><a href="${entityPath(entity.id)}">${renderEntityArt(catalogue)}<div class="entity-card-copy"><div class="entity-card-head"><span class="entity-type">${TYPE_LABELS[entity.type]}</span><span class="entity-card-signal" aria-hidden="true"></span></div><h2>${escapeHtml(entity.name)}</h2><span class="entity-count"><strong>${catalogue.length}</strong> ${catalogue.length === 1 ? "show" : "shows"} in the archive <span class="entity-count-arrow">${renderArrowIcon()}</span></span></div></a></article>`;
}

function breadcrumb(entity) {
  return `<nav class="detail-breadcrumbs" aria-label="Breadcrumb"><a href="/">Archive</a><span aria-hidden="true">/</span>${entity ? `<a href="/creators">Creators</a><span aria-hidden="true">/</span><span aria-current="page">${escapeHtml(entity.name)}</span>` : '<span aria-current="page">Creators</span>'}</nav>`;
}

function formatEntityDate(value) {
  if (!value) return "Unknown";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

function renderEntityShortcut(entity, catalogue, index) {
  const countLabel = `${catalogue.length} ${catalogue.length === 1 ? "show" : "shows"}`;
  return `<a class="home-hero-route entity-featured-route${index === 0 ? " is-primary" : ""}" href="${entityPath(entity.id)}" aria-label="Explore ${escapeHtml(entity.name)}, ${countLabel}"><span class="home-hero-route-kicker">${countLabel}</span><span class="home-hero-route-label">${escapeHtml(entity.name)}</span></a>`;
}

function createEntityCorrectionHref(entity = null) {
  const params = new URLSearchParams({ submissionType: "correction", correctionType: "creator-page" });
  if (entity?.id) params.set("entityId", entity.id);
  if (entity?.name) params.set("entityName", entity.name);
  return `/submit?${params.toString()}`;
}

function normalizeDirectoryFilter(value) {
  return DIRECTORY_FILTER_VALUES.has(value) ? value : "all";
}

function normalizeDirectorySort(value) {
  return DIRECTORY_SORT_VALUES.has(value) ? value : "name";
}

function sortDirectoryEntities(entities, catalogues, sort) {
  return [...entities].sort((a, b) => {
    if (sort === "shows") {
      return (catalogues.get(b.id).length - catalogues.get(a.id).length) || a.name.localeCompare(b.name, "en");
    }
    return a.name.localeCompare(b.name, "en");
  });
}

function renderDirectoryControls(entities, activeFilter, activeSort, query = "") {
  const matchesSearch = (entity) => !query || matchesEntityQuery(entity, query);
  const counts = new Map(DIRECTORY_FILTERS.map((filter) => [filter.value, entities.filter((entity) => (filter.value === "all" || entity.type === filter.value) && matchesSearch(entity)).length]));
  return `<div class="entity-directory-controls" aria-label="Browse creator organizations"><div class="entity-type-filter"><span class="entity-control-label" id="entityTypeFilterLabel">Filter organizations</span><div class="entity-filter-options" role="group" aria-labelledby="entityTypeFilterLabel">${DIRECTORY_FILTERS.map((filter) => `<button class="entity-filter-button${activeFilter === filter.value ? " is-active" : ""}" type="button" data-entity-filter="${escapeHtml(filter.value)}" aria-pressed="${activeFilter === filter.value ? "true" : "false"}"><span>${escapeHtml(filter.label)}</span><span class="entity-filter-count">${counts.get(filter.value)}</span></button>`).join("")}</div></div><label class="entity-sort-field" for="entitySort"><span>Sort</span><select id="entitySort" name="sort"><option value="name"${activeSort === "name" ? " selected" : ""}>Name, A–Z</option><option value="shows"${activeSort === "shows" ? " selected" : ""}>Most connected shows</option></select></label></div>`;
}

function getDirectoryEmptyCopy(query, entityType) {
  const filter = DIRECTORY_FILTERS.find((entry) => entry.value === entityType);
  if (query && filter && entityType !== "all") {
    return { title: `No ${filter.label.toLowerCase()} match “${query}”`, description: "Try a shorter organization name or clear the search and filter." };
  }
  if (query) {
    return { title: `No organizations match “${query}”`, description: "Try a shorter name, search the main archive for shows, or clear the search." };
  }
  if (filter && entityType !== "all") {
    return { title: `No ${filter.label.toLowerCase()} yet`, description: "Choose All organizations or clear the filter to keep exploring." };
  }
  return { title: "No matching organizations yet", description: "Try a shorter name, search the main archive for shows, or clear your search." };
}

function renderDirectoryFaqItem(kicker, question, answer) {
  return `<details class="creator-faq-item entity-faq-item"><summary class="creator-faq-toggle"><span class="creator-faq-toggle-copy"><span class="creator-faq-toggle-kicker">${kicker}</span><span class="creator-faq-toggle-text">${question}</span></span><span class="creator-faq-toggle-icon" aria-hidden="true"><svg viewBox="0 0 24 24" role="presentation"><path d="M12 5v14M5 12h14" /></svg></span></summary><div class="creator-faq-answer"><div class="creator-faq-answer-inner"><p>${answer}</p></div></div></details>`;
}

function renderDirectoryFaq() {
  return `<section class="page-card entity-faq creator-faq-section" aria-labelledby="entityFaqTitle"><div class="creator-section-header entity-faq-heading"><div><span class="page-card-kicker">Creator directory guide</span><h2 id="entityFaqTitle">Questions about the Creators index</h2><p>How the directory is curated, checked, and connected to the rest of the archive.</p></div></div><div class="creator-faq-list entity-faq-list">${renderDirectoryFaqItem("Directory", "What is included in the Creators directory?", "It lists production companies, studios, and networks with source-backed connections to published shows in The Echo Archives. Individual people can still appear as credited creators on show pages without becoming organization cards.")}${renderDirectoryFaqItem("Sources", "How are creator connections checked?", "Each public entity has a review date and source evidence in the archive registry. A connection describes a factual credit or affiliation; it does not mean the creator approved an archive rating, review, or recommendation.")}${renderDirectoryFaqItem("Boundaries", "What is the difference between Creators and For creators?", 'Creators is the listener-facing catalogue of the teams behind shows. <a href="/for-creators">For creators</a> explains how to submit a show, request a factual correction, or ask for creator verification.')}</div></section>`;
}

function directoryContent(entities, shows, query, options = {}) {
  const directoryEntities = getPublicDirectoryEntities(entities, shows).sort((a, b) => a.name.localeCompare(b.name, "en"));
  const catalogues = new Map(directoryEntities.map((entity) => [entity.id, orderedShows(entity, shows)]));
  const entityType = normalizeDirectoryFilter(options.entityType);
  const sort = normalizeDirectorySort(options.sort);
  const sorted = sortDirectoryEntities(directoryEntities, catalogues, sort);
  const featured = [...directoryEntities]
    .sort((a, b) => (catalogues.get(b.id).length - catalogues.get(a.id).length) || a.name.localeCompare(b.name, "en"))
    .slice(0, 3);
  const publicEntityIds = new Set(directoryEntities.map((entity) => entity.id));
  const connectedShowCount = shows.filter((show) => show.status === "published" && (show.entityLinks || []).some((link) => publicEntityIds.has(link.entityId))).length;
  const latestReviewedAt = directoryEntities.map((entity) => entity.reviewedAt).filter(Boolean).sort().at(-1) || "";
  const summary = `Browse ${directoryEntities.length} source-backed production companies, studios, and networks connected to published audio dramas and fiction podcasts. Individual creators remain linked from their shows and detail pages.`;
  const matches = (entity) => (entityType === "all" || entity.type === entityType) && (!query || matchesEntityQuery(entity, query));
  const visibleCount = sorted.filter(matches).length;
  const resultLabel = visibleCount === 1 ? "organization" : "organizations";
  const initialResults = `${visibleCount} ${resultLabel}${query || entityType !== "all" ? " found" : " to explore"}.`;
  const emptyCopy = getDirectoryEmptyCopy(query, entityType);
  const hasActiveState = Boolean(query || entityType !== "all" || sort !== "name");
  const directoryFaq = renderDirectoryFaq();
  // All cards stay in the document so filtering needs no second catalog fetch.
  return `<section class="hero-shell entity-hero-shell" id="creatorsHero" aria-labelledby="creatorsHeroTitle"><div class="hero-panel creators-hero-panel entity-hero-panel"><div class="hero-copy entity-hero-copy"><span class="entity-directory-kicker">Creator directory · organizations</span><h1 id="creatorsHeroTitle">Production companies, studios &amp; networks</h1><p>Trace a favorite show back to the production companies, studios, and networks behind it. Individual creators remain linked from their shows.</p><div class="entity-featured-rail"><div class="home-hero-actions entity-featured-routes" aria-label="Featured creator organizations">${featured.map((entity, index) => renderEntityShortcut(entity, catalogues.get(entity.id), index)).join("")}</div></div></div><form class="entity-search" role="search" action="/creators" method="get"><label class="entity-search-label" for="entitySearch">Search production companies, studios, and networks</label><div class="entity-search-control"><div class="entity-search-field"><span class="entity-search-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m21 21-4.35-4.35M10.8 18a7.2 7.2 0 1 0 0-14.4 7.2 7.2 0 0 0 0-14.4 7.2 7.2 0 0 0 0 14.4Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" /></svg></span><input id="entitySearch" type="search" name="q" value="${escapeHtml(query)}" placeholder="Try 7 Lamb or Fool &amp; Scholar" autocomplete="off" aria-controls="entityGrid" /><button class="entity-search-clear" type="button" data-entity-clear aria-label="Clear organization search"${query ? "" : " hidden"}>Clear</button></div><button class="entity-search-submit" type="submit">Search ${renderArrowIcon()}</button></div></form><section class="archive-trust-grid entity-trust-grid" aria-label="Creator organization directory snapshot"><p class="archive-trust-item"><strong>${directoryEntities.length}</strong> <span>creator organizations</span></p><p class="archive-trust-item"><strong>${connectedShowCount}</strong> <span>connected shows</span></p><p class="archive-trust-item entity-trust-updated"><span>Last reviewed</span> <strong>${formatEntityDate(latestReviewedAt)}</strong></p></section></div></section><section class="entity-explore-section" id="entityDirectorySection" aria-labelledby="entityDirectoryTitle"><div class="entity-section-heading"><div><h2 id="entityDirectoryTitle">Explore creators</h2><p>${summary}</p></div><a class="entity-section-link" href="${escapeHtml(createEntityCorrectionHref())}">Suggest a creator connection ${renderArrowIcon()}</a></div>${renderDirectoryControls(directoryEntities, entityType, sort, query)}<div class="entity-results-row"><p id="entityResults" class="entity-results" role="status" aria-live="polite">${initialResults}</p><a class="entity-results-reset" href="/creators" data-entity-reset${hasActiveState ? "" : " hidden"}>Clear search and filters</a></div><div id="entityGrid" class="entity-grid">${sorted.map((entity) => renderEntityCard(entity, shows).replace("<article ", `<article ${matches(entity) ? "" : "hidden "}`)).join("")}</div><div id="entityEmpty" class="empty-state-card"${visibleCount > 0 ? " hidden" : ""}><h2 id="entityEmptyTitle">${escapeHtml(emptyCopy.title)}</h2><p id="entityEmptyDescription">${escapeHtml(emptyCopy.description)}</p><div class="entity-empty-actions"><a class="collection-action" href="${query ? `/?q=${encodeURIComponent(query)}#archive` : "/#archive"}" data-entity-browse>Search shows</a><a class="collection-secondary-link" href="/creators" data-entity-reset>Clear search and filters</a></div></div></section><p class="entity-footnote">Know a missing connection? <a href="${escapeHtml(createEntityCorrectionHref())}">Send a creator-page correction</a> or <a href="/for-creators">visit For creators</a>.</p>`;
}

function detailContent(entity, shows, collections) {
  const profile = getEntityPageProfile(entity, shows, collections);
  const { catalogue, linkedCollections } = profile;
  const related = linkedCollections.slice(0, 3);
  const showMap = new Map(shows.filter((show) => show.status === "published").map((show) => [show.id, show]));
  const countLabel = `${catalogue.length} ${catalogue.length === 1 ? "show" : "shows"}`;
  const typeLabel = TYPE_LABELS[entity.type];
  const lede = entity.description || `Explore the published shows currently connected to this ${typeLabel.toLowerCase()} in The Echo Archives.`;
  const reviewNote = entity.reviewedAt ? `Archive record checked ${formatEntityDate(entity.reviewedAt)}` : "Archive record reviewed from published sources";
  const directoryLinkLabel = "Browse all creators";
  const relatedSummary = "Listening paths that include these shows.";
  return `<section class="hero-shell entity-detail-hero" aria-labelledby="entityTitle"><div class="hero-panel page-panel entity-detail-hero-panel"><div class="hero-copy entity-detail-hero-copy">${breadcrumb(entity)}<div class="entity-detail-status-row"><span class="entity-detail-kicker">${escapeHtml(typeLabel)}</span><span class="entity-detail-status"><span class="entity-detail-status-dot" aria-hidden="true"></span>Confirmed archive connection</span></div><h1 id="entityTitle">${escapeHtml(entity.name)}</h1><p class="entity-detail-lede">${escapeHtml(lede)}</p><div class="entity-detail-actions"><a class="collection-action entity-detail-primary" href="#entityShows">Explore ${escapeHtml(countLabel)} ${renderArrowIcon()}</a>${entity.website ? `<a class="collection-secondary-link entity-detail-secondary" href="${escapeHtml(entity.website)}" rel="external">Official website ${renderArrowIcon({ external: true })}</a>` : ""}<a class="collection-secondary-link entity-detail-secondary" href="/creators">${directoryLinkLabel} ${renderArrowIcon()}</a></div><p class="entity-detail-trust"><span class="entity-detail-trust-label">Archive note</span><span>Connections describe factual credits; archive ratings and reviews remain separate.</span></p></div><div class="entity-detail-art" aria-hidden="true">${renderEntityHeroArt(catalogue)}</div></div></section>
    <section class="page-card entity-detail-overview" aria-label="Entity at a glance"><div class="entity-detail-overview-head"><span class="page-card-kicker">At a glance</span><span class="entity-detail-reviewed">${escapeHtml(reviewNote)}</span></div><dl class="entity-detail-stat-grid"><div class="entity-detail-stat"><dt>Shows in archive</dt><dd>${catalogue.length}</dd></div><div class="entity-detail-stat"><dt>Listening routes</dt><dd>${linkedCollections.length}</dd></div><div class="entity-detail-stat"><dt>Archive role</dt><dd>${escapeHtml(typeLabel)}</dd></div></dl>${entity.aliases?.length ? `<div class="entity-detail-aliases"><span>Also indexed as</span>${entity.aliases.map((alias) => `<span>${escapeHtml(alias)}</span>`).join("")}</div>` : ""}</section>
   <section id="entityShows" class="archive-section entity-catalogue entity-detail-catalogue" aria-labelledby="entityShowsTitle"><div class="section-heading entity-detail-section-heading"><div><span class="page-card-kicker">Catalogued works</span><h2 id="entityShowsTitle">Shows in the archive</h2><p>${escapeHtml(countLabel)} with a confirmed connection to ${escapeHtml(entity.name)}.</p></div><a class="entity-detail-section-link" href="/creators">${directoryLinkLabel} ${renderArrowIcon()}</a></div><div class="podcast-card-grid">${catalogue.map((show) => renderEntityShowCard(entity, show)).join("")}</div></section>
   ${related.length ? `<section class="page-card entity-collections entity-detail-related-section" aria-labelledby="entityCollectionsTitle"><div class="section-heading entity-detail-related-heading"><div><span class="page-card-kicker">Keep browsing</span><h2 id="entityCollectionsTitle">Explore through collections</h2><p>${relatedSummary}</p></div></div><div class="entity-collection-grid">${related.map(({ collection }) => renderCollectionDirectoryCard(collection, showMap, { compact: true })).join("")}</div></section>` : ""}
    <section class="page-card entity-detail-correction" aria-labelledby="entityCorrectionTitle"><div><span class="page-card-kicker">Archive maintenance</span><h2 id="entityCorrectionTitle">See a missing or incorrect credit?</h2><p>Help keep this creator record useful by sending a factual correction to the archive.</p></div><a class="collection-action" href="${escapeHtml(createEntityCorrectionHref(entity))}">Correct this creator page ${renderArrowIcon()}</a></section>`;
}

function enhancedDirectoryContent(entities, shows, query, options = {}) {
  const directoryEntities = getPublicDirectoryEntities(entities, shows).sort((a, b) => a.name.localeCompare(b.name, "en"));
  const catalogues = new Map(directoryEntities.map((entity) => [entity.id, orderedShows(entity, shows)]));
  const entityType = normalizeDirectoryFilter(options.entityType);
  const sort = normalizeDirectorySort(options.sort);
  const sorted = sortDirectoryEntities(directoryEntities, catalogues, sort);
  const featured = [...directoryEntities]
    .sort((a, b) => (catalogues.get(b.id).length - catalogues.get(a.id).length) || a.name.localeCompare(b.name, "en"))
    .slice(0, 3);
  const publicEntityIds = new Set(directoryEntities.map((entity) => entity.id));
  const connectedShowCount = shows.filter((show) => show.status === "published" && (show.entityLinks || []).some((link) => publicEntityIds.has(link.entityId))).length;
  const latestReviewedAt = directoryEntities.map((entity) => entity.reviewedAt).filter(Boolean).sort().at(-1) || "";
  const summary = `Browse ${directoryEntities.length} source-backed production companies, studios, and networks connected to published audio dramas and fiction podcasts. Individual creators remain linked from their shows and detail pages.`;
  const matches = (entity) => (entityType === "all" || entity.type === entityType) && (!query || matchesEntityQuery(entity, query));
  const visibleCount = sorted.filter(matches).length;
  const resultLabel = visibleCount === 1 ? "organization" : "organizations";
  const initialResults = `${visibleCount} ${resultLabel}${query || entityType !== "all" ? " found" : " to explore"}.`;
  const emptyCopy = getDirectoryEmptyCopy(query, entityType);
  const hasActiveState = Boolean(query || entityType !== "all" || sort !== "name");
  const hero = `<section class="hero-shell entity-hero-shell" id="creatorsHero" aria-labelledby="creatorsHeroTitle"><div class="hero-panel creators-hero-panel entity-hero-panel"><div class="hero-copy entity-hero-copy"><span class="entity-directory-kicker">Creator directory · organizations</span><h1 id="creatorsHeroTitle">Production companies, studios &amp; networks</h1><p>Trace a favorite show back to the production companies, studios, and networks behind it. Individual creators remain linked from their shows.</p><div class="entity-featured-rail"><div class="home-hero-actions entity-featured-routes" aria-label="Featured creator organizations">${featured.map((entity, index) => renderEntityShortcut(entity, catalogues.get(entity.id), index)).join("")}</div></div></div><form class="entity-search" role="search" action="/creators" method="get"><label class="entity-search-label" for="entitySearch">Search production companies, studios, and networks</label><div class="entity-search-control"><div class="entity-search-field"><span class="entity-search-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m21 21-4.35-4.35M10.8 18a7.2 7.2 0 1 0 0-14.4 7.2 7.2 0 0 0 0 14.4Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" /></svg></span><input id="entitySearch" type="search" name="q" value="${escapeHtml(query)}" placeholder="Try 7 Lamb or Fool &amp; Scholar" autocomplete="off" aria-controls="entityGrid" /><button class="entity-search-clear" type="button" data-entity-clear aria-label="Clear organization search"${query ? "" : " hidden"}>Clear</button></div><button class="entity-search-submit" type="submit">Search ${renderArrowIcon()}</button></div></form><section class="archive-trust-grid entity-trust-grid" aria-label="Creator organization directory snapshot"><p class="archive-trust-item"><strong>${directoryEntities.length}</strong> <span>creator organizations</span></p><p class="archive-trust-item"><strong>${connectedShowCount}</strong> <span>connected shows</span></p><p class="archive-trust-item entity-trust-updated"><span>Last reviewed</span> <strong>${formatEntityDate(latestReviewedAt)}</strong></p></section></div></section>`;
  const browse = `<section class="entity-explore-section" id="entityDirectorySection" aria-labelledby="entityDirectoryTitle"><div class="entity-section-heading"><div><h2 id="entityDirectoryTitle">Browse production companies, studios, and networks</h2><p>${summary}</p></div><a class="entity-section-link" href="${escapeHtml(createEntityCorrectionHref())}">Suggest a creator connection ${renderArrowIcon()}</a></div>${renderDirectoryControls(directoryEntities, entityType, sort, query)}<div class="entity-results-row"><p id="entityResults" class="entity-results" role="status" aria-live="polite">${initialResults}</p><a class="entity-results-reset" href="/creators" data-entity-reset${hasActiveState ? "" : " hidden"}>Clear search and filters</a></div><div id="entityGrid" class="entity-grid">${sorted.map((entity) => renderEntityCard(entity, shows).replace("<article ", `<article ${matches(entity) ? "" : "hidden "}`)).join("")}</div><div id="entityEmpty" class="empty-state-card"${visibleCount > 0 ? " hidden" : ""}><h2 id="entityEmptyTitle">${escapeHtml(emptyCopy.title)}</h2><p id="entityEmptyDescription">${escapeHtml(emptyCopy.description)}</p><div class="entity-empty-actions"><a class="collection-action" href="${query ? `/?q=${encodeURIComponent(query)}#archive` : "/#archive"}" data-entity-browse>Search shows</a><a class="collection-secondary-link" href="/creators" data-entity-reset>Clear search and filters</a></div></div></section><p class="entity-footnote">Know a missing connection? <a href="${escapeHtml(createEntityCorrectionHref())}">Send a creator-page correction</a> or <a href="/for-creators">visit For creators</a>.</p>`;
  return `${hero}${browse}${renderDirectoryFaq()}`;
}

function enhancedDetailContent(entity, shows, collections) {
  const profile = getEntityPageProfile(entity, shows, collections);
  const { catalogue, linkedCollections } = profile;
  const related = linkedCollections.slice(0, 3);
  const showMap = new Map(shows.filter((show) => show.status === "published").map((show) => [show.id, show]));
  const countLabel = `${catalogue.length} ${catalogue.length === 1 ? "show" : "shows"}`;
  const typeLabel = TYPE_LABELS[entity.type];
  const lede = entity.description || `Explore ${countLabel} connected audio dramas and fiction podcasts from this ${typeLabel.toLowerCase()} in The Echo Archives.`;
  const reviewNote = entity.reviewedAt ? `Sources reviewed ${formatEntityDate(entity.reviewedAt)}` : "Sources reviewed from published records";
  const reviewMarkup = entity.reviewedAt
    ? `<time datetime="${escapeHtml(entity.reviewedAt)}">${escapeHtml(reviewNote)}</time>`
    : escapeHtml(reviewNote);
  const genreLabels = profile.genres.slice(0, 4).map(toPublicLabel);
  const tagLabels = profile.tags.slice(0, 4).map(toPublicLabel).filter((tag) => !genreLabels.includes(tag));
  const signalMarkup = genreLabels.length || tagLabels.length || profile.statuses.length
    ? `<div class="entity-detail-signals"><span class="entity-detail-signals-label">Catalogued signals</span>${genreLabels.length ? `<span><strong>Genres</strong> ${escapeHtml(genreLabels.join(" · "))}</span>` : ""}${tagLabels.length ? `<span><strong>Tags</strong> ${escapeHtml(tagLabels.join(" · "))}</span>` : ""}${profile.statuses.length ? `<span><strong>Status</strong> ${escapeHtml(profile.statuses.join(" · "))}</span>` : ""}</div>`
    : "";
  const genreSummary = genreLabels.length ? ` Catalogued genres include ${genreLabels.join(", ")}.` : "";
  const directoryLinkLabel = entity.type === "person" ? "Browse organizations" : "Browse all organizations";
  const relatedSummary = linkedCollections.length > related.length
    ? `Showing ${related.length} of ${linkedCollections.length} listening routes connected to these shows.`
    : "Listening paths that include these shows.";
  return `<section class="hero-shell entity-detail-hero" aria-labelledby="entityTitle"><div class="hero-panel page-panel entity-detail-hero-panel"><div class="hero-copy entity-detail-hero-copy">${breadcrumb(entity)}<div class="entity-detail-status-row"><span class="entity-detail-kicker">${escapeHtml(typeLabel)}</span><span class="entity-detail-status"><span class="entity-detail-status-dot" aria-hidden="true"></span>Source-backed connection</span></div><h1 id="entityTitle">${escapeHtml(entity.name)}</h1><p class="entity-detail-lede">${escapeHtml(lede)}</p><div class="entity-detail-actions"><a class="collection-action entity-detail-primary" href="#entityShows">Explore ${escapeHtml(countLabel)} ${renderArrowIcon()}</a>${entity.website ? `<a class="collection-secondary-link entity-detail-secondary" href="${escapeHtml(entity.website)}" rel="external">Official website ${renderArrowIcon({ external: true })}</a>` : ""}<a class="collection-secondary-link entity-detail-secondary" href="/creators">${directoryLinkLabel} ${renderArrowIcon()}</a></div><p class="entity-detail-trust"><span class="entity-detail-trust-label">Source note</span><span>Links reflect factual credits; they are not creator verification or endorsement. Archive ratings and reviews remain separate.</span></p></div><div class="entity-detail-art" aria-hidden="true">${renderEntityHeroArt(catalogue)}</div></div></section>
    <section class="page-card entity-detail-overview" aria-label="Entity at a glance"><div class="entity-detail-overview-head"><div class="entity-detail-overview-meta"><span class="page-card-kicker">At a glance</span><span class="entity-detail-reviewed">${reviewMarkup}</span></div><a class="collection-action entity-detail-overview-action" href="#entityShows">View ${escapeHtml(countLabel)} ${renderArrowIcon()}</a></div><dl class="entity-detail-stat-grid"><div class="entity-detail-stat"><dt>Shows in archive</dt><dd>${catalogue.length}</dd></div><div class="entity-detail-stat"><dt>Listening routes</dt><dd>${linkedCollections.length}</dd></div><div class="entity-detail-stat"><dt>Entity type</dt><dd>${escapeHtml(typeLabel)}</dd></div><div class="entity-detail-stat"><dt>Genres represented</dt><dd>${genreLabels.length || "—"}</dd></div></dl><details class="entity-detail-overview-extra"><summary>Archive details</summary><div class="entity-detail-context"><p>Curated archive selection; not a complete discography.</p>${signalMarkup}</div>${entity.aliases?.length ? `<div class="entity-detail-aliases"><span>Also indexed as</span>${entity.aliases.map((alias) => `<span>${escapeHtml(alias)}</span>`).join("")}</div>` : ""}</details></section>
   <section id="entityShows" class="archive-section entity-catalogue entity-detail-catalogue" aria-labelledby="entityShowsTitle"><div class="section-heading entity-detail-section-heading"><div><span class="page-card-kicker">Complete catalogue</span><h2 id="entityShowsTitle">Audio dramas and fiction podcasts connected to ${escapeHtml(entity.name)}</h2><p>${escapeHtml(countLabel)} with a source-backed connection to ${escapeHtml(entity.name)}.${genreSummary}</p></div><a class="entity-detail-section-link" href="/creators">${directoryLinkLabel} ${renderArrowIcon()}</a></div><div class="podcast-card-grid">${catalogue.map((show) => renderEntityShowCard(entity, show)).join("")}</div></section>
   ${related.length ? `<section class="page-card entity-collections entity-detail-related-section" aria-labelledby="entityCollectionsTitle"><div class="section-heading entity-detail-related-heading"><div><span class="page-card-kicker">Keep browsing</span><h2 id="entityCollectionsTitle">Explore through collections</h2><p>${relatedSummary}</p></div>${linkedCollections.length > related.length ? `<a class="entity-detail-section-link" href="/collections">Browse all collections ${renderArrowIcon()}</a>` : ""}</div><div class="entity-collection-grid">${related.map(({ collection }) => renderCollectionDirectoryCard(collection, showMap, { compact: true })).join("")}</div></section>` : ""}
    <section class="page-card entity-detail-correction" aria-labelledby="entityCorrectionTitle"><div><span class="page-card-kicker">Archive maintenance</span><h2 id="entityCorrectionTitle">See a missing or incorrect credit?</h2><p>Help keep this creator record useful by sending a factual correction to the archive.</p></div><a class="collection-action" href="${escapeHtml(createEntityCorrectionHref(entity))}">Correct this creator page ${renderArrowIcon()}</a></section>`;
}

function buildEntityStructuredReference(entity, siteUrl, pageId = "") {
  const aliases = Array.isArray(entity.aliases) ? entity.aliases : [];
  return {
    ...entityStructuredData(entity, siteUrl),
    ...(cleanEntityText(entity.description) ? { description: cleanEntityText(entity.description) } : {}),
    ...(entity.website ? { sameAs: [entity.website] } : {}),
    ...(aliases.length ? { alternateName: aliases } : {}),
    ...(pageId ? { mainEntityOfPage: { "@id": pageId } } : {}),
    ...(entity.reviewedAt ? { dateModified: entity.reviewedAt } : {}),
  };
}

function buildEntityShowListItem(show, siteUrl, position) {
  const url = buildAbsoluteUrl(siteUrl, `/shows/${encodeURIComponent(show.id)}`);
  const imageSource = getShowImageSource(show);
  const description = cleanEntityText(show.subtitle || show.description);
  const genres = uniqueEntityText(show.genres);
  const item = {
    "@type": "PodcastSeries",
    "@id": `${url}#podcast`,
    name: show.title,
    url,
    ...(description ? { description } : {}),
    ...(imageSource ? { image: buildAbsoluteUrl(siteUrl, imageSource) } : {}),
    ...(genres.length ? { genre: genres.map(toPublicLabel) } : {}),
  };
  Object.assign(item, showEntityStructuredData(show, siteUrl));
  return { "@type": "ListItem", position, name: show.title, url, item };
}

function buildEntityPageData({ entity, entities, shows, collections = [], siteUrl }) {
  const pagePath = entity ? entityPath(entity.id) : "/creators";
  const canonicalUrl = buildAbsoluteUrl(siteUrl, pagePath);
  const title = buildEntitySeoTitle(entity);
  const description = buildEntitySeoDescription(entity, shows, collections, entities);
  const directoryEntities = getPublicDirectoryEntities(entities, shows).sort((a, b) => a.name.localeCompare(b.name, "en"));
  const profile = entity ? getEntityPageProfile(entity, shows, collections) : null;
  const list = entity
    ? profile.catalogue.map((show, index) => buildEntityShowListItem(show, siteUrl, index + 1))
    : directoryEntities.map((record, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: record.name,
      url: buildAbsoluteUrl(siteUrl, entityPath(record.id)),
      item: buildEntityStructuredReference(record, siteUrl),
    }));
  const pageId = `${canonicalUrl}#webpage`;
  const listId = `${canonicalUrl}#itemlist`;
  const entityId = `${canonicalUrl}#entity`;
  const breadcrumbId = `${canonicalUrl}#breadcrumb`;
  const imageUrl = getEntitySocialImage({ entity, entities, shows, siteUrl });
  const graph = [
    {
      "@type": "CollectionPage",
      "@id": pageId,
      url: canonicalUrl,
      name: title,
      description,
      isPartOf: { "@id": buildAbsoluteUrl(siteUrl, "/#website") },
      breadcrumb: { "@id": breadcrumbId },
      mainEntity: { "@id": entity ? entityId : listId },
      ...(entity ? { about: { "@id": entityId }, mentions: { "@id": listId } } : {}),
      primaryImageOfPage: { "@type": "ImageObject", url: imageUrl },
      ...(entity?.reviewedAt ? { dateModified: entity.reviewedAt } : {}),
    },
    {
      "@type": "ItemList",
      "@id": listId,
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      numberOfItems: list.length,
      itemListElement: list,
    },
    {
      "@type": "BreadcrumbList",
      "@id": breadcrumbId,
      itemListElement: [
        { name: BRAND_DESCRIPTOR, path: "/" },
        { name: "Audio drama creators", path: "/creators" },
        ...(entity ? [{ name: entity.name, path: pagePath }] : []),
      ].map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        item: buildAbsoluteUrl(siteUrl, item.path),
      })),
    },
  ];
  if (entity) graph.push(buildEntityStructuredReference(entity, siteUrl, pageId));
  return {
    metadata: {
      title,
      description,
      canonicalUrl,
      imageUrl,
      imageAlt: entity ? `${entity.name} catalogue in The Echo Archives` : "Audio drama creator catalogues in The Echo Archives",
    },
    structuredData: { "@context": "https://schema.org", "@graph": graph },
  };
}

function renderEntityPage(template, { entity = null, entities = [], shows = [], collections = [], siteUrl, query = "", entityType = "all", sort = "name" }) {
  const activeEntityType = normalizeDirectoryFilter(entityType);
  const activeSort = normalizeDirectorySort(sort);
  const content = entity ? enhancedDetailContent(entity, shows, collections) : enhancedDirectoryContent(entities, shows, query, { entityType: activeEntityType, sort: activeSort });
  const { metadata, structuredData } = buildEntityPageData({ entity, entities, shows, collections, siteUrl });
  let html = template.replace(/<!-- ENTITY_CONTENT -->[\s\S]*?<!-- \/ENTITY_CONTENT -->/, () => `<!-- ENTITY_CONTENT -->${content}<!-- /ENTITY_CONTENT -->`);
  html = injectStructuredData(injectPageMetadata(html, metadata), structuredData);
  if (query || (!entity && (activeEntityType !== "all" || activeSort !== "name")) || (entity && !isIndexableEntity(entity, shows))) html = injectNoIndex(html, { follow: true });
  return html;
}

module.exports = { renderEntityPage, buildEntityPageData, buildEntitySeoTitle, buildEntitySeoDescription };
