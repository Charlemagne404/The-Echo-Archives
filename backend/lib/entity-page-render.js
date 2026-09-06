const { renderCollectionShowCard, renderCollectionDirectoryCard } = require("../../tools/lib/home-page-prerender");
const { injectPageMetadata, injectStructuredData, injectNoIndex } = require("./public-page-render");
const { TYPE_LABELS, entityPath, escapeHtml, getEntityShows, getPublicDirectoryEntities, isIndexableEntity, matchesEntityQuery, entityStructuredData } = require("../../shared/archive-entities");

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

function renderDirectoryControls(entities, activeFilter, activeSort) {
  const counts = new Map(DIRECTORY_FILTERS.map((filter) => [filter.value, filter.value === "all" ? entities.length : entities.filter((entity) => entity.type === filter.value).length]));
  return `<div class="entity-directory-controls" aria-label="Browse creator organizations"><div class="entity-type-filter"><span class="entity-control-label" id="entityTypeFilterLabel">Filter organizations</span><div class="entity-filter-options" role="group" aria-labelledby="entityTypeFilterLabel">${DIRECTORY_FILTERS.map((filter) => `<button class="entity-filter-button${activeFilter === filter.value ? " is-active" : ""}" type="button" data-entity-filter="${escapeHtml(filter.value)}" aria-pressed="${activeFilter === filter.value ? "true" : "false"}"><span>${escapeHtml(filter.label)}</span><span class="entity-filter-count">${counts.get(filter.value)}</span></button>`).join("")}</div></div><label class="entity-sort-field" for="entitySort"><span>Sort</span><select id="entitySort" name="sort"><option value="name"${activeSort === "name" ? " selected" : ""}>Name, A–Z</option><option value="shows"${activeSort === "shows" ? " selected" : ""}>Most connected shows</option></select></label></div>`;
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
  const summary = "Browse confirmed production companies, studios, and networks.";
  const matches = (entity) => (entityType === "all" || entity.type === entityType) && (!query || matchesEntityQuery(entity, query));
  const visibleCount = sorted.filter(matches).length;
  const resultLabel = visibleCount === 1 ? "organization" : "organizations";
  const initialResults = `${visibleCount} ${resultLabel}${query || entityType !== "all" ? " found" : " to explore"}.`;
  // All cards stay in the document so filtering needs no second catalog fetch.
  return `<section class="hero-shell entity-hero-shell" id="creatorsHero" aria-labelledby="creatorsHeroTitle"><div class="hero-panel creators-hero-panel entity-hero-panel"><div class="hero-copy entity-hero-copy"><h1 id="creatorsHeroTitle">Meet the makers behind the stories</h1><p>Trace a favorite show back to the production companies, studios, networks, and creator brands behind it.</p><div class="entity-featured-rail"><div class="home-hero-actions entity-featured-routes" aria-label="Featured creator shortcuts">${featured.map((entity, index) => renderEntityShortcut(entity, catalogues.get(entity.id), index)).join("")}</div></div></div><form class="entity-search" role="search" action="/creators" method="get"><label class="entity-search-label" for="entitySearch">Search the creator directory</label><div class="entity-search-control"><div class="entity-search-field"><span class="entity-search-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m21 21-4.35-4.35M10.8 18a7.2 7.2 0 1 0 0-14.4 7.2 7.2 0 0 0 0 14.4Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" /></svg></span><input id="entitySearch" type="search" name="q" value="${escapeHtml(query)}" placeholder="Try 7 Lamb or Fool &amp; Scholar" autocomplete="off" aria-controls="entityGrid" /></div><button class="entity-search-submit" type="submit">Search ${renderArrowIcon()}</button></div></form><section class="archive-trust-grid entity-trust-grid" aria-label="Creator index snapshot"><p class="archive-trust-item"><strong>${directoryEntities.length}</strong> <span>creator organizations</span></p><p class="archive-trust-item"><strong>${connectedShowCount}</strong> <span>connected shows</span></p><p class="archive-trust-item entity-trust-updated"><span>Updated</span> <strong>${formatEntityDate(latestReviewedAt)}</strong></p></section></div></section><section class="entity-explore-section" id="entityDirectorySection" aria-labelledby="entityDirectoryTitle"><div class="entity-section-heading"><div><h2 id="entityDirectoryTitle">Explore creators</h2><p>${summary}</p></div><a class="entity-section-link" href="${escapeHtml(createEntityCorrectionHref())}">Suggest a creator connection ${renderArrowIcon()}</a></div>${renderDirectoryControls(directoryEntities, entityType, sort)}<p id="entityResults" class="entity-results" role="status" aria-live="polite">${initialResults}</p><div id="entityGrid" class="entity-grid">${sorted.map((entity) => renderEntityCard(entity, shows).replace("<article ", `<article ${matches(entity) ? "" : "hidden "}`)).join("")}</div><div id="entityEmpty" class="empty-state-card"${visibleCount > 0 ? " hidden" : ""}><h2>No matching organizations yet</h2><p>Try a shorter name, choose All organizations, or clear your search.</p><div class="entity-empty-actions"><a class="collection-action" href="${query ? `/?q=${encodeURIComponent(query)}#archive` : "/#archive"}" data-entity-browse>Search shows</a><a class="collection-secondary-link" href="/creators" data-entity-reset>Clear search and filters</a></div></div></section><p class="entity-footnote">Know a missing connection? <a href="${escapeHtml(createEntityCorrectionHref())}">Send a creator-page correction</a> or <a href="/for-creators">visit For creators</a>.</p>`;
}

function detailContent(entity, shows, collections) {
  const catalogue = orderedShows(entity, shows);
  const ids = new Set(catalogue.map((show) => show.id));
  const linkedCollections = collections.map((collection) => ({ collection, count: (collection.showIds || []).filter((id) => ids.has(id)).length }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.collection.title.localeCompare(b.collection.title, "en"));
  const related = linkedCollections.slice(0, 3);
  const showMap = new Map(shows.filter((show) => show.status === "published").map((show) => [show.id, show]));
  const countLabel = `${catalogue.length} ${catalogue.length === 1 ? "show" : "shows"}`;
  const typeLabel = TYPE_LABELS[entity.type];
  const lede = entity.description || `Explore the published shows currently connected to this ${typeLabel.toLowerCase()} in The Echo Archives.`;
  const reviewNote = entity.reviewedAt ? `Archive record checked ${formatEntityDate(entity.reviewedAt)}` : "Archive record reviewed from published sources";
  return `<section class="hero-shell entity-detail-hero" aria-labelledby="entityTitle"><div class="hero-panel page-panel entity-detail-hero-panel"><div class="hero-copy entity-detail-hero-copy">${breadcrumb(entity)}<div class="entity-detail-status-row"><span class="entity-detail-kicker">${escapeHtml(typeLabel)}</span><span class="entity-detail-status"><span class="entity-detail-status-dot" aria-hidden="true"></span>Confirmed archive connection</span></div><h1 id="entityTitle">${escapeHtml(entity.name)}</h1><p class="entity-detail-lede">${escapeHtml(lede)}</p><div class="entity-detail-actions"><a class="collection-action entity-detail-primary" href="#entityShows">Explore ${escapeHtml(countLabel)} ${renderArrowIcon()}</a>${entity.website ? `<a class="collection-secondary-link entity-detail-secondary" href="${escapeHtml(entity.website)}" rel="external">Official website ${renderArrowIcon({ external: true })}</a>` : ""}<a class="collection-secondary-link entity-detail-secondary" href="/creators">All creators ${renderArrowIcon()}</a></div><p class="entity-detail-trust"><span class="entity-detail-trust-label">Archive note</span><span>Connections describe factual credits; archive ratings and reviews remain separate.</span></p></div><div class="entity-detail-art" aria-hidden="true">${renderEntityHeroArt(catalogue)}</div></div></section>
    <section class="page-card entity-detail-overview" aria-label="Creator at a glance"><div class="entity-detail-overview-head"><span class="page-card-kicker">At a glance</span><span class="entity-detail-reviewed">${escapeHtml(reviewNote)}</span></div><dl class="entity-detail-stat-grid"><div class="entity-detail-stat"><dt>Shows in archive</dt><dd>${catalogue.length}</dd></div><div class="entity-detail-stat"><dt>Listening routes</dt><dd>${linkedCollections.length}</dd></div><div class="entity-detail-stat"><dt>Archive role</dt><dd>${escapeHtml(typeLabel)}</dd></div></dl>${entity.aliases?.length ? `<div class="entity-detail-aliases"><span>Also indexed as</span>${entity.aliases.map((alias) => `<span>${escapeHtml(alias)}</span>`).join("")}</div>` : ""}</section>
   <section id="entityShows" class="archive-section entity-catalogue entity-detail-catalogue" aria-labelledby="entityShowsTitle"><div class="section-heading entity-detail-section-heading"><div><span class="page-card-kicker">Catalogued works</span><h2 id="entityShowsTitle">Shows in the archive</h2><p>${escapeHtml(countLabel)} with a confirmed connection to ${escapeHtml(entity.name)}.</p></div><a class="entity-detail-section-link" href="/creators">Browse all creators ${renderArrowIcon()}</a></div><div class="podcast-card-grid">${catalogue.map((show) => renderCollectionShowCard(show)).join("")}</div></section>
   ${related.length ? `<section class="page-card entity-collections entity-detail-related-section" aria-labelledby="entityCollectionsTitle"><div class="section-heading entity-detail-related-heading"><div><span class="page-card-kicker">Keep browsing</span><h2 id="entityCollectionsTitle">Explore through collections</h2><p>Listening paths that include these shows.</p></div></div><div class="entity-collection-grid">${related.map(({ collection }) => renderCollectionDirectoryCard(collection, showMap, { compact: true })).join("")}</div></section>` : ""}
    <section class="page-card entity-detail-correction" aria-labelledby="entityCorrectionTitle"><div><span class="page-card-kicker">Archive maintenance</span><h2 id="entityCorrectionTitle">See a missing or incorrect credit?</h2><p>Help keep this creator record useful by sending a factual correction to the archive.</p></div><a class="collection-action" href="${escapeHtml(createEntityCorrectionHref(entity))}">Correct this creator page ${renderArrowIcon()}</a></section>`;
}

function buildEntityPageData({ entity, entities, shows, siteUrl }) {
  const pagePath = entity ? entityPath(entity.id) : "/creators";
  const canonicalUrl = new URL(pagePath, siteUrl).toString();
  const title = entity ? `${entity.name} — Audio Dramas & Fiction Podcasts | The Echo Archives` : "Audio Drama Creators, Studios & Networks | The Echo Archives";
  const description = entity ? `Explore ${orderedShows(entity, shows).length} shows connected to ${entity.name} in The Echo Archives, with listening links and curated collections.` : "Discover audio dramas through the production companies, studios, networks, and creator brands behind them. Explore curated creator catalogues in The Echo Archives.";
  const list = entity ? orderedShows(entity, shows).map((show) => ({ name: show.title, url: new URL(`/shows/${show.id}`, siteUrl).toString() })) : getPublicDirectoryEntities(entities, shows).map((record) => ({ name: record.name, url: new URL(entityPath(record.id), siteUrl).toString() }));
  const graph = [
    { "@type": "CollectionPage", "@id": `${canonicalUrl}#webpage`, url: canonicalUrl, name: title, description, isPartOf: { "@id": new URL("/#website", siteUrl).toString() }, breadcrumb: { "@id": `${canonicalUrl}#breadcrumb` }, mainEntity: { "@id": `${canonicalUrl}${entity ? "#entity" : "#itemlist"}` }, ...(entity ? { mentions: { "@id": `${canonicalUrl}#itemlist` } } : {}) },
    { "@type": "ItemList", "@id": `${canonicalUrl}#itemlist`, numberOfItems: list.length, itemListElement: list.map((record, index) => ({ "@type": "ListItem", position: index + 1, ...record })) },
    { "@type": "BreadcrumbList", "@id": `${canonicalUrl}#breadcrumb`, itemListElement: [{ name: "Archive", path: "/" }, { name: "Creators", path: "/creators" }, ...(entity ? [{ name: entity.name, path: pagePath }] : [])].map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: new URL(item.path, siteUrl).toString() })) },
  ];
  if (entity) graph.push({ ...entityStructuredData(entity, siteUrl), ...(entity.description ? { description: entity.description } : {}), ...(entity.website ? { sameAs: [entity.website] } : {}), ...(entity.aliases.length ? { alternateName: entity.aliases } : {}) });
  return { metadata: { title, description, canonicalUrl, imageUrl: new URL("/echo-wordmark1.png", siteUrl).toString(), imageAlt: "The Echo Archives" }, structuredData: { "@context": "https://schema.org", "@graph": graph } };
}

function renderEntityPage(template, { entity = null, entities = [], shows = [], collections = [], siteUrl, query = "", entityType = "all", sort = "name" }) {
  const activeEntityType = normalizeDirectoryFilter(entityType);
  const activeSort = normalizeDirectorySort(sort);
  const content = entity ? detailContent(entity, shows, collections) : directoryContent(entities, shows, query, { entityType: activeEntityType, sort: activeSort });
  const { metadata, structuredData } = buildEntityPageData({ entity, entities, shows, siteUrl });
  let html = template.replace(/<!-- ENTITY_CONTENT -->[\s\S]*?<!-- \/ENTITY_CONTENT -->/, () => `<!-- ENTITY_CONTENT -->${content}<!-- /ENTITY_CONTENT -->`);
  html = injectStructuredData(injectPageMetadata(html, metadata), structuredData);
  if (query || (!entity && (activeEntityType !== "all" || activeSort !== "name")) || (entity && !isIndexableEntity(entity, shows))) html = injectNoIndex(html, { follow: true });
  return html;
}

module.exports = { renderEntityPage, buildEntityPageData };
