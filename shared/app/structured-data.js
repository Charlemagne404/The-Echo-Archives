import { buildSiteAbsoluteUrl } from "./utils.js";

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

function buildShowListItems(shows = []) {
  return (Array.isArray(shows) ? shows : []).map((show, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: cleanText(show?.title) || "Untitled archive entry",
    url: buildSiteAbsoluteUrl(`/show?id=${encodeURIComponent(show?.id || "")}`),
  }));
}

export function buildWebsiteStructuredData(description) {
  const homeUrl = buildSiteAbsoluteUrl("/");
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "The Echo Archives",
    url: homeUrl,
    description: cleanText(description),
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${homeUrl}?q={search_term_string}#archive`,
      },
      "query-input": "required name=search_term_string",
    },
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

  return compactObject({
    "@context": "https://schema.org",
    "@type": "PodcastSeries",
    name: title,
    description: cleanText(show?.description),
    url: buildSiteAbsoluteUrl(`/show?id=${encodeURIComponent(show?.id || "")}`),
    image: image ? buildSiteAbsoluteUrl(image) : "",
    genre: uniqueTextValues(show?.genres),
    creator: creators,
    inLanguage: uniqueTextValues(show?.languages),
    dateModified: cleanText(show?.updatedAt),
    sameAs,
  });
}

export function buildCollectionStructuredData(collection, shows = []) {
  const itemListElement = buildShowListItems(shows);
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: cleanText(collection?.title) || "The Echo Archives collection",
    description: cleanText(collection?.description),
    url: buildSiteAbsoluteUrl(`/collection?id=${encodeURIComponent(collection?.id || "")}`),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: itemListElement.length,
      itemListElement,
    },
  };
}

export function buildCollectionsDirectoryStructuredData(collections = []) {
  const records = Array.isArray(collections) ? collections : [];
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Collections - The Echo Archives",
    description: "Browse curated listening paths by mood, tone, and commitment in The Echo Archives.",
    url: buildSiteAbsoluteUrl("/collections"),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: records.length,
      itemListElement: records.map((collection, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: cleanText(collection?.title) || "Untitled collection",
        url: buildSiteAbsoluteUrl(`/collection?id=${encodeURIComponent(collection?.id || "")}`),
      })),
    },
  };
}
