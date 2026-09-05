const { renderCollectionShowCard, renderCollectionDirectoryCard } = require("../../tools/lib/home-page-prerender");
const { injectPageMetadata, injectStructuredData, injectNoIndex } = require("./public-page-render");
const { TYPE_LABELS, entityPath, escapeHtml, getEntityShows, getPublicDirectoryEntities, isIndexableEntity, matchesEntityQuery, entityStructuredData } = require("../../shared/archive-entities");

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

function renderEntityCard(entity, shows) {
  const catalogue = orderedShows(entity, shows);
  return `<article class="entity-card" data-entity-id="${escapeHtml(entity.id)}" data-entity-names="${escapeHtml(JSON.stringify([entity.name, ...entity.aliases]))}"><a href="${entityPath(entity.id)}">${renderEntityArt(catalogue)}<div class="entity-card-copy"><div class="entity-card-head"><span class="entity-type">${TYPE_LABELS[entity.type]}</span><span class="entity-card-signal" aria-hidden="true"></span></div><h2>${escapeHtml(entity.name)}</h2><span class="entity-count"><strong>${catalogue.length}</strong> ${catalogue.length === 1 ? "show" : "shows"} in the archive <span class="entity-count-arrow" aria-hidden="true">↗</span></span></div></a></article>`;
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

function directoryContent(entities, shows, query) {
  const sorted = getPublicDirectoryEntities(entities, shows).sort((a, b) => a.name.localeCompare(b.name, "en"));
  const catalogues = new Map(sorted.map((entity) => [entity.id, orderedShows(entity, shows)]));
  const featured = [...sorted]
    .sort((a, b) => (catalogues.get(b.id).length - catalogues.get(a.id).length) || a.name.localeCompare(b.name, "en"))
    .slice(0, 3);
  const publicEntityIds = new Set(sorted.map((entity) => entity.id));
  const connectedShowCount = shows.filter((show) => show.status === "published" && (show.entityLinks || []).some((link) => publicEntityIds.has(link.entityId))).length;
  const latestReviewedAt = sorted.map((entity) => entity.reviewedAt).filter(Boolean).sort().at(-1) || "";
  const summary = `${sorted.length} ${sorted.length === 1 ? "creator organization" : "creator organizations"} in the index.`;
  // All cards stay in the document so filtering needs no second catalog fetch.
  return `<section class="hero-shell entity-hero-shell" id="creatorsHero" aria-labelledby="creatorsHeroTitle"><div class="hero-panel creators-hero-panel entity-hero-panel"><div class="hero-copy entity-hero-copy"><h1 id="creatorsHeroTitle">Meet the makers behind the stories</h1><p>Trace a favorite show back to the production companies, studios, networks, and creator brands behind it.</p><div class="home-hero-actions entity-featured-routes" aria-label="Featured creator shortcuts">${featured.map((entity, index) => renderEntityShortcut(entity, catalogues.get(entity.id), index)).join("")}</div></div><form class="entity-search" role="search" action="/creators" method="get"><label class="entity-search-label" for="entitySearch">Search the creator directory</label><div class="entity-search-control"><div class="entity-search-field"><span class="entity-search-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m21 21-4.35-4.35M10.8 18a7.2 7.2 0 1 0 0-14.4 7.2 7.2 0 0 0 0 14.4Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" /></svg></span><input id="entitySearch" type="search" name="q" value="${escapeHtml(query)}" placeholder="Try 7 Lamb or Fool &amp; Scholar" autocomplete="off" aria-controls="entityGrid" /></div><button class="entity-search-submit" type="submit">Search <span aria-hidden="true">↗</span></button></div></form><section class="archive-trust-grid entity-trust-grid" aria-label="Creator index snapshot"><p class="archive-trust-item"><strong>${sorted.length}</strong> <span>creator organizations</span></p><p class="archive-trust-item"><strong>${connectedShowCount}</strong> <span>connected shows</span></p><p class="archive-trust-item entity-trust-updated"><span>Updated</span> <strong>${formatEntityDate(latestReviewedAt)}</strong></p></section></div></section><section class="entity-explore-section" id="entityDirectorySection" aria-labelledby="entityDirectoryTitle"><div class="entity-section-heading"><div><h2 id="entityDirectoryTitle">Explore creators</h2><p>${summary}</p></div><a class="entity-section-link" href="/submit?submissionType=correction">Suggest a connection <span aria-hidden="true">↗</span></a></div><p id="entityResults" class="entity-results" role="status" aria-live="polite"></p><div id="entityGrid" class="entity-grid">${sorted.map((entity) => renderEntityCard(entity, shows).replace('<article ', `<article ${query && !matchesEntityQuery(entity, query) ? 'hidden ' : ''}`)).join("")}</div><div id="entityEmpty" class="empty-state-card"${!query || sorted.some((entity) => matchesEntityQuery(entity, query)) ? " hidden" : ""}><h2>No creator matches yet</h2><p>Try a shorter name, or search the full archive for a show credit.</p><div class="entity-empty-actions"><a class="collection-action" href="/?q=${encodeURIComponent(query)}#archive" data-entity-browse>Search shows</a><a class="collection-secondary-link" href="/creators" data-entity-reset>Clear search</a></div></div></section><p class="entity-footnote">Know a missing connection? <a href="/submit?submissionType=correction">Send a correction</a> or <a href="/for-creators">visit For creators</a>.</p>`;
}

function detailContent(entity, shows, collections) {
  const catalogue = orderedShows(entity, shows);
  const ids = new Set(catalogue.map((show) => show.id));
  const related = collections.map((collection) => ({ collection, count: (collection.showIds || []).filter((id) => ids.has(id)).length }))
    .filter((entry) => entry.count > 0).sort((a, b) => b.count - a.count || a.collection.title.localeCompare(b.collection.title, "en")).slice(0, 3);
  const showMap = new Map(shows.filter((show) => show.status === "published").map((show) => [show.id, show]));
  return `${breadcrumb(entity)}<header class="entity-heading entity-detail-heading"><div><p class="entity-kicker">${TYPE_LABELS[entity.type]}</p><h1>${escapeHtml(entity.name)}</h1>${entity.description ? `<p>${escapeHtml(entity.description)}</p>` : ""}<p class="entity-scope">${catalogue.length} ${catalogue.length === 1 ? "show" : "shows"} with confirmed connections in the archive.</p>${entity.website ? `<a class="collection-action" href="${escapeHtml(entity.website)}" rel="external">Official website <span aria-hidden="true">↗</span></a>` : ""}</div>${renderEntityArt(catalogue)}</header>
    <section class="archive-section entity-catalogue" aria-labelledby="entityShowsTitle"><div class="section-heading"><h2 id="entityShowsTitle">Shows in the archive</h2></div><div class="podcast-card-grid">${catalogue.map((show) => renderCollectionShowCard(show)).join("")}</div></section>
    ${related.length ? `<section class="entity-collections" aria-labelledby="entityCollectionsTitle"><div class="section-heading"><div><h2 id="entityCollectionsTitle">Explore through collections</h2><p>Listening paths that include these shows.</p></div></div><div class="entity-collection-grid">${related.map(({ collection }) => renderCollectionDirectoryCard(collection, showMap, { compact: true })).join("")}</div></section>` : ""}
    <p class="entity-footnote">Missing a show or spotted an incorrect credit? <a href="/submit?submissionType=correction">Send a correction</a>. Connections describe factual credits, not approval of archive reviews.</p>`;
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

function renderEntityPage(template, { entity = null, entities = [], shows = [], collections = [], siteUrl, query = "" }) {
  const content = entity ? detailContent(entity, shows, collections) : directoryContent(entities, shows, query);
  const { metadata, structuredData } = buildEntityPageData({ entity, entities, shows, siteUrl });
  let html = template.replace(/<!-- ENTITY_CONTENT -->[\s\S]*?<!-- \/ENTITY_CONTENT -->/, () => `<!-- ENTITY_CONTENT -->${content}<!-- /ENTITY_CONTENT -->`);
  html = injectStructuredData(injectPageMetadata(html, metadata), structuredData);
  if (query || (entity && !isIndexableEntity(entity, shows))) html = injectNoIndex(html, { follow: true });
  return html;
}

module.exports = { renderEntityPage, buildEntityPageData };
