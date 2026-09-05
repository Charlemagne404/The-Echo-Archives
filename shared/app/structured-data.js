import { buildSiteAbsoluteUrl } from "./utils.js";
import { archiveRecord } from "./constants.js";
import { BRAND_DESCRIPTOR, buildCollectionSeoDescription, buildCollectionSeoTitle, buildShowSeoDescription, buildShowSeoTitle } from "./seo.js";
import { createCollectionHref, createShowHref } from "./urls.js";

function cleanText(value) {
  return String(value || "").trim();
}

function uniqueTextValues(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(cleanText).filter(Boolean)));
}

function validExternalUrls(values = []) {
  return Array.from(new Set(values.flatMap((value) => {
    const candidate = cleanText(value);
    if (!candidate) {
      return [];
    }
    try {
      const url = new URL(candidate);
      return ["http:", "https:"].includes(url.protocol) ? [url.toString()] : [];
    } catch (_error) {
      return [];
    }
  })));
}

function objectValues(record) {
  return record && typeof record === "object" && !Array.isArray(record) ? Object.values(record) : [];
}

function compactObject(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => {
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return value !== "" && value !== null && value !== undefined;
  }));
}

function buildShowListItems(shows = [], showReasons = {}) {
  return (Array.isArray(shows) ? shows : []).map((show, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: cleanText(show?.title) || "Untitled archive entry",
    ...(cleanText(showReasons?.[show?.id]) ? { description: cleanText(showReasons[show.id]) } : {}),
    url: buildSiteAbsoluteUrl(createShowHref(show?.id || "")),
  }));
}

export function buildWebsiteStructuredData(description) {
  const homeUrl = buildSiteAbsoluteUrl("/");
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${homeUrl}#website`,
        name: "The Echo Archives",
        alternateName: BRAND_DESCRIPTOR,
        url: homeUrl,
        description: cleanText(description),
        about: [
          { "@type": "Thing", name: "Audio drama discovery" },
          { "@type": "Thing", name: "Fiction podcast recommendations" },
          { "@type": "Thing", name: "Audio drama reviews" },
        ],
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${homeUrl}?q={search_term_string}#archive`,
          },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "WebPage",
        "@id": `${homeUrl}#webpage`,
        url: homeUrl,
        name: BRAND_DESCRIPTOR,
        description: cleanText(description),
        isPartOf: { "@id": `${homeUrl}#website` },
      },
    ],
  };
}

export function buildShowStructuredData(show) {
  const title = cleanText(show?.title);
  const creators = uniqueTextValues(show?.creators);
  const sameAs = validExternalUrls([
    ...objectValues(show?.officialLinks),
    ...objectValues(show?.listenLinks),
  ]);
  const image = show?.imageSrc || (show?.cover ? `/${String(show.cover).replace(/^\/+/, "")}` : "");

  const pageUrl = buildSiteAbsoluteUrl(createShowHref(show?.id || ""));
  const homeUrl = buildSiteAbsoluteUrl("/");
  const pageDates = archiveRecord.getWebPageDates(show);
  const podcast = compactObject({
    "@type": "PodcastSeries",
    "@id": `${pageUrl}#podcast`,
    name: title,
    description: cleanText(show?.description),
    url: pageUrl,
    image: image ? buildSiteAbsoluteUrl(image) : "",
    genre: uniqueTextValues(show?.genres),
    creator: creators,
    ...globalThis.EchoArchiveEntities.showEntityStructuredData(show, homeUrl),
    inLanguage: uniqueTextValues(show?.languages),
    sameAs,
  });
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${pageUrl}#webpage`,
        url: pageUrl,
        name: buildShowSeoTitle(show),
        description: buildShowSeoDescription(show),
        isPartOf: { "@id": `${homeUrl}#website` },
        breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
        mainEntity: { "@id": `${pageUrl}#podcast` },
        ...(show.resolvedEntities?.length ? { mentions: show.resolvedEntities.map((entity) => globalThis.EchoArchiveEntities.entityStructuredData(entity, homeUrl)) } : {}),
        ...(image ? { primaryImageOfPage: { "@type": "ImageObject", url: buildSiteAbsoluteUrl(image) } } : {}),
        ...(pageDates.datePublished ? { datePublished: pageDates.datePublished } : {}),
        ...(pageDates.dateModified ? { dateModified: pageDates.dateModified } : {}),
      },
      podcast,
      {
        "@type": "BreadcrumbList",
        "@id": `${pageUrl}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: BRAND_DESCRIPTOR, item: homeUrl },
          { "@type": "ListItem", position: 2, name: title, item: pageUrl },
        ],
      },
    ],
  };
}

export function buildCollectionStructuredData(collection, shows = []) {
  const itemListElement = buildShowListItems(shows, collection?.showReasons);
  const pageUrl = buildSiteAbsoluteUrl(createCollectionHref(collection?.id || ""));
  const homeUrl = buildSiteAbsoluteUrl("/");
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${pageUrl}#webpage`,
        name: buildCollectionSeoTitle(collection),
        description: buildCollectionSeoDescription(collection, shows),
        url: pageUrl,
        isPartOf: { "@id": `${homeUrl}#website` },
        breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
        mainEntity: { "@id": `${pageUrl}#itemlist` },
        ...(collection?.updatedAt ? { dateModified: collection.updatedAt } : {}),
      },
      { "@type": "ItemList", "@id": `${pageUrl}#itemlist`, numberOfItems: itemListElement.length, itemListElement },
      {
        "@type": "BreadcrumbList",
        "@id": `${pageUrl}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: BRAND_DESCRIPTOR, item: homeUrl },
          { "@type": "ListItem", position: 2, name: "Audio drama collections", item: buildSiteAbsoluteUrl("/collections") },
          { "@type": "ListItem", position: 3, name: cleanText(collection?.title), item: pageUrl },
        ],
      },
    ],
  };
}

export function buildCollectionsDirectoryStructuredData(collections = []) {
  const records = Array.isArray(collections) ? collections : [];
  const pageUrl = buildSiteAbsoluteUrl("/collections");
  const homeUrl = buildSiteAbsoluteUrl("/");
  const description =
    "Browse audio drama and fiction podcast recommendations by mood, genre, listening time, completion status, and similar shows.";
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${pageUrl}#webpage`,
        name: "Audio Drama & Fiction Podcast Collections | The Echo Archives",
        description,
        url: pageUrl,
        isPartOf: { "@id": `${homeUrl}#website` },
        breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
        mainEntity: { "@id": `${pageUrl}#itemlist` },
      },
      {
        "@type": "ItemList",
        "@id": `${pageUrl}#itemlist`,
        numberOfItems: records.length,
        itemListElement: records.map((collection, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: cleanText(collection?.title) || "Untitled collection",
          url: buildSiteAbsoluteUrl(createCollectionHref(collection?.id || "")),
        })),
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${pageUrl}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: BRAND_DESCRIPTOR, item: homeUrl },
          { "@type": "ListItem", position: 2, name: "Audio drama collections", item: pageUrl },
        ],
      },
    ],
  };
}
