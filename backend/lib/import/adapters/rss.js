const { XMLParser, XMLValidator } = require("fast-xml-parser");

const {
  cleanDescription,
  mergeUniqueStrings,
  normalizeUrl,
  parseDateValue,
  resolveUrl,
  trimText,
} = require("../utils");
const { fetchTextWithLimits, throwForUpstreamStatus } = require("../fetch");

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  cdataPropName: "#cdata",
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  allowBooleanAttributes: true,
  processEntities: true,
  htmlEntities: true,
});

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function nodeText(value) {
  if (value === undefined || value === null) return "";
  if (["string", "number", "boolean"].includes(typeof value)) return trimText(value, 20_000);
  if (Array.isArray(value)) return trimText(value.map(nodeText).filter(Boolean).join(" "), 20_000);
  if (typeof value === "object") {
    return trimText(value["#cdata"] ?? value["#text"] ?? value["@value"] ?? "", 20_000);
  }
  return "";
}

function firstText(node, keys) {
  for (const key of keys) {
    const value = nodeText(node?.[key]);
    if (value) return value;
  }
  return "";
}

function firstAttribute(node, keys) {
  for (const key of keys) {
    const value = trimText(node?.[`@${key}`] ?? node?.[key] ?? "", 2_000);
    if (value) return value;
  }
  return "";
}

function parseDurationMinutes(value = "") {
  const trimmed = trimText(value, 40);
  if (!trimmed) return null;
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : null;
  }
  const parts = trimmed.split(":").map((entry) => Number.parseInt(entry, 10));
  if (parts.some((entry) => !Number.isInteger(entry) || entry < 0) || parts.length < 2 || parts.length > 3) return null;
  const [hours, minutes, seconds] = parts.length === 3 ? parts : [0, parts[0], parts[1]];
  const totalSeconds = (hours * 3600) + (minutes * 60) + seconds;
  return totalSeconds > 0 ? Math.max(1, Math.round(totalSeconds / 60)) : null;
}

function numericStats(values = []) {
  const numbers = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (numbers.length === 0) return { average: null, median: null, min: null, max: null };
  const middle = Math.floor(numbers.length / 2);
  const median = numbers.length % 2 ? numbers[middle] : Math.round((numbers[middle - 1] + numbers[middle]) / 2);
  return {
    average: Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length),
    median,
    min: numbers[0],
    max: numbers.at(-1),
  };
}

function readCategoryTree(value, values = []) {
  asArray(value).forEach((entry) => {
    const text = firstAttribute(entry, ["text"]) || nodeText(entry);
    if (text) values.push(text);
    if (entry && typeof entry === "object") readCategoryTree(entry["itunes:category"], values);
  });
  return values;
}

function normalizePerson(value, sourceUrl) {
  const name = nodeText(value);
  if (!name) return null;
  return {
    name: trimText(name, 240),
    role: trimText(firstAttribute(value, ["role"]) || "host", 100).toLowerCase(),
    group: trimText(firstAttribute(value, ["group"]), 100).toLowerCase(),
    href: resolveUrl(firstAttribute(value, ["href"]), sourceUrl),
    image: resolveUrl(firstAttribute(value, ["img"]), sourceUrl),
  };
}

function normalizeTranscript(value, sourceUrl) {
  const url = resolveUrl(firstAttribute(value, ["url", "href"]) || nodeText(value), sourceUrl);
  if (!url) return null;
  return {
    url,
    type: trimText(firstAttribute(value, ["type"]), 120).toLowerCase(),
    language: trimText(firstAttribute(value, ["language", "lang"]), 40).toLowerCase(),
    rel: trimText(firstAttribute(value, ["rel"]), 80).toLowerCase(),
  };
}

function parseEpisode(item = {}, sourceUrl = "", isAtom = false) {
  const linkValues = asArray(item.link);
  const enclosureNode = item.enclosure || linkValues.find((entry) => firstAttribute(entry, ["rel"]).toLowerCase() === "enclosure");
  const guid = firstText(item, ["guid", "id"]);
  const pubDate = parseDateValue(firstText(item, ["pubDate", "published", "updated", "dc:date"]));
  const episodeType = trimText(firstText(item, ["itunes:episodeType", "podcast:episodeType"]), 40).toLowerCase() || "full";
  const durationMinutes = parseDurationMinutes(firstText(item, ["itunes:duration", "podcast:duration"]));
  const transcripts = asArray(item["podcast:transcript"]).map((entry) => normalizeTranscript(entry, sourceUrl)).filter(Boolean);
  const people = asArray(item["podcast:person"]).map((entry) => normalizePerson(entry, sourceUrl)).filter(Boolean);
  return {
    guid,
    title: cleanDescription(firstText(item, ["title"]), 500),
    description: cleanDescription(firstText(item, ["itunes:summary", "description", "summary", "content:encoded", "content"]), 1_500),
    publicationDate: pubDate,
    scheduled: Boolean(pubDate && Date.parse(pubDate) > Date.now()),
    episodeType: ["trailer", "bonus"].includes(episodeType) ? episodeType : "full",
    season: Number.parseInt(firstText(item, ["itunes:season"]), 10) || null,
    episode: Number.parseInt(firstText(item, ["itunes:episode"]), 10) || null,
    durationMinutes,
    enclosureUrl: resolveUrl(firstAttribute(enclosureNode, ["url", "href"]), sourceUrl),
    enclosureType: trimText(firstAttribute(enclosureNode, ["type"]), 120).toLowerCase(),
    link: resolveUrl(isAtom ? firstAttribute(linkValues.find((entry) => firstAttribute(entry, ["rel"]) !== "enclosure") || {}, ["href"]) : firstText(item, ["link"]), sourceUrl),
    transcripts,
    people,
  };
}

function cadenceFromDates(dates = []) {
  const timestamps = dates.map(Date.parse).filter(Number.isFinite).sort((a, b) => a - b).slice(-9);
  const intervals = [];
  for (let index = 1; index < timestamps.length; index += 1) {
    const days = Math.round((timestamps[index] - timestamps[index - 1]) / 86_400_000);
    if (days > 0 && days < 366) intervals.push(days);
  }
  const medianDays = numericStats(intervals).median;
  let label = "unknown";
  if (medianDays !== null) {
    if (medianDays <= 9) label = "weekly";
    else if (medianDays <= 18) label = "biweekly";
    else if (medianDays <= 40) label = "monthly";
    else label = "irregular";
  }
  return { label, medianDays, observedIntervals: intervals.length };
}

function findAtomLink(node, rel = "alternate") {
  const match = asArray(node?.link).find((entry) => (firstAttribute(entry, ["rel"]) || "alternate").toLowerCase() === rel);
  return firstAttribute(match || {}, ["href"]);
}

function parseRssText(text = "", sourceUrl = "") {
  const xml = String(text || "");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    const error = new Error("RSS feed contains a prohibited DTD or entity declaration.");
    error.code = "IMPORT_UNSAFE_XML";
    error.retryable = false;
    throw error;
  }
  const validation = XMLValidator.validate(xml, { allowBooleanAttributes: true });
  if (validation !== true) {
    const error = new Error(`RSS feed is malformed: ${validation.err?.msg || "invalid XML"}`);
    error.code = "IMPORT_INVALID_XML";
    error.retryable = false;
    throw error;
  }
  const document = parser.parse(xml);
  const isAtom = Boolean(document.feed && !document.rss);
  const channel = document.rss?.channel || document["rdf:RDF"]?.channel || document.feed;
  if (!channel || typeof channel !== "object") {
    const error = new Error("RSS document does not contain a channel or Atom feed.");
    error.code = "IMPORT_INVALID_XML";
    error.retryable = false;
    throw error;
  }
  const rawEpisodes = isAtom ? asArray(channel.entry) : asArray(channel.item || document["rdf:RDF"]?.item);
  const episodes = rawEpisodes.map((item) => parseEpisode(item, sourceUrl, isAtom));
  const fullEpisodes = episodes.filter((episode) => episode.episodeType === "full");
  const publishedFullEpisodes = fullEpisodes.filter((episode) => episode.publicationDate && !episode.scheduled);
  const scheduledFullEpisodes = fullEpisodes.filter((episode) => episode.publicationDate && episode.scheduled);
  const dates = publishedFullEpisodes.map((episode) => episode.publicationDate).filter(Boolean).sort();
  const allDates = episodes.map((episode) => episode.publicationDate).filter(Boolean).sort();
  const durationStats = numericStats(fullEpisodes.map((episode) => episode.durationMinutes));
  const channelPeople = asArray(channel["podcast:person"]).map((entry) => normalizePerson(entry, sourceUrl)).filter(Boolean);
  const episodePeople = episodes.flatMap((episode) => episode.people);
  const peopleByKey = new Map();
  [...channelPeople, ...episodePeople].forEach((person) => peopleByKey.set(`${person.name.toLowerCase()}|${person.role}|${person.group}`, person));
  const transcripts = episodes.flatMap((episode) => episode.transcripts);
  const transcriptEpisodeCount = episodes.filter((episode) => episode.transcripts.length > 0).length;
  const owner = channel["itunes:owner"] || {};
  const imageNode = channel["itunes:image"] || channel.image;
  const imageValue = firstAttribute(imageNode, ["href", "url"]) || firstText(imageNode || {}, ["url"]);
  const categories = mergeUniqueStrings(
    readCategoryTree(channel["itunes:category"]),
    asArray(channel.category).map(nodeText),
    trimText(firstText(channel, ["podcast:txt"]), 500).split(","),
  );
  const completeRaw = firstText(channel, ["podcast:complete", "itunes:complete"]);
  const complete = completeRaw ? /^(yes|true|1)$/i.test(completeRaw) : null;
  const feedType = trimText(firstText(channel, ["itunes:type"]), 80).toLowerCase();
  const atomSelf = resolveUrl(findAtomLink(channel, "self"), sourceUrl);
  const websiteUrl = resolveUrl(isAtom ? findAtomLink(channel, "alternate") : firstText(channel, ["link"]), sourceUrl);
  const guidNode = channel["podcast:guid"];
  const guid = nodeText(guidNode);
  const funding = asArray(channel["podcast:funding"]).map((entry) => ({
    url: resolveUrl(firstAttribute(entry, ["url", "href"]), sourceUrl),
    label: nodeText(entry),
  })).filter((entry) => entry.url);
  const licenseNode = channel["podcast:license"];

  return {
    title: cleanDescription(firstText(channel, ["title"]), 240),
    subtitle: cleanDescription(firstText(channel, ["itunes:subtitle", "subtitle"]), 240),
    creatorName: trimText(firstText(channel, ["itunes:author"]) || firstText(owner, ["itunes:name"]) || firstText(channel, ["managingEditor", "author"]), 240),
    ownerName: trimText(firstText(owner, ["itunes:name"]), 240),
    description: cleanDescription(firstText(channel, ["itunes:summary", "description", "summary", "content:encoded"]), 4_000),
    rssUrl: atomSelf || normalizeUrl(sourceUrl),
    previousRssUrl: normalizeUrl(firstText(channel, ["itunes:new-feed-url"])),
    websiteUrl,
    artworkUrl: resolveUrl(imageValue, sourceUrl),
    language: trimText(firstText(channel, ["language"]), 40).toLowerCase(),
    explicit: trimText(firstText(channel, ["itunes:explicit"]), 60).toLowerCase(),
    copyright: trimText(firstText(channel, ["copyright"]), 500),
    categories,
    keywords: mergeUniqueStrings(trimText(firstText(channel, ["itunes:keywords"]), 1_000).split(",")),
    feedType,
    medium: trimText(firstText(channel, ["podcast:medium"]), 80).toLowerCase(),
    complete,
    podcastGuid: trimText(guid, 240),
    podcastGuidIsValid: Boolean(guid && (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(guid) || /^https?:\/\//i.test(guid))),
    episodeCount: fullEpisodes.length || null,
    episodeCountObserved: fullEpisodes.length,
    episodeCountExact: complete === true,
    episodeCounts: {
      full: fullEpisodes.length,
      bonus: episodes.filter((episode) => episode.episodeType === "bonus").length,
      trailer: episodes.filter((episode) => episode.episodeType === "trailer").length,
      totalObserved: episodes.length,
      exact: complete === true,
    },
    scheduledReleaseCount: episodes.filter((episode) => episode.scheduled).length,
    firstPublicationDate: dates[0] || allDates[0] || "",
    latestPublicationDate: dates.at(-1) || "",
    latestAnyPublicationDate: allDates.at(-1) || "",
    nextScheduledPublicationDate: scheduledFullEpisodes.map((episode) => episode.publicationDate).sort()[0] || "",
    seasonCount: Math.max(0, ...fullEpisodes.map((episode) => episode.season || 0)) || null,
    seasonsObserved: mergeUniqueStrings(fullEpisodes.map((episode) => episode.season).filter(Boolean).map(String)).map(Number),
    avgEpisodeMinutes: durationStats.average,
    medianEpisodeMinutes: durationStats.median,
    minEpisodeMinutes: durationStats.min,
    maxEpisodeMinutes: durationStats.max,
    totalObservedHours: durationStats.average && fullEpisodes.length ? Number(((fullEpisodes.reduce((sum, episode) => sum + (episode.durationMinutes || 0), 0)) / 60).toFixed(1)) : null,
    durationCoverage: fullEpisodes.length > 0 ? Number((fullEpisodes.filter((episode) => episode.durationMinutes).length / fullEpisodes.length).toFixed(3)) : 0,
    cadence: cadenceFromDates(dates),
    people: [...peopleByKey.values()],
    channelPeople,
    transcripts: {
      episodeCount: transcriptEpisodeCount,
      coverage: episodes.length > 0 ? Number((transcriptEpisodeCount / episodes.length).toFixed(3)) : 0,
      languages: mergeUniqueStrings(transcripts.map((entry) => entry.language).filter(Boolean)),
      formats: mergeUniqueStrings(transcripts.map((entry) => entry.type).filter(Boolean)),
      captions: transcripts.some((entry) => /(vtt|srt|caption)/i.test(entry.type)),
    },
    funding,
    supportUrl: funding[0]?.url || "",
    license: {
      value: nodeText(licenseNode),
      url: resolveUrl(firstAttribute(licenseNode, ["url", "href"]), sourceUrl),
    },
    location: trimText(nodeText(channel["podcast:location"]), 240),
    episodes,
    sourceFormat: isAtom ? "atom" : "rss",
  };
}

function createRssAdapter({ fetchImpl = globalThis.fetch, userAgent, timeoutMs = 15_000, maxBytes = 5 * 1024 * 1024 } = {}) {
  async function fetchByUrl(url, cache = null) {
    const headers = {
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9",
      "User-Agent": userAgent,
    };
    if (cache?.etag) headers["If-None-Match"] = cache.etag;
    if (cache?.lastModified) headers["If-Modified-Since"] = cache.lastModified;
    const { response, text, resolvedUrl } = await fetchTextWithLimits(fetchImpl, url, { headers }, {
      timeoutMs,
      maxBytes,
      label: "RSS request",
      allowedContentTypes: ["application/rss+xml", "application/atom+xml", "application/xml", "text/xml", "text/plain"],
    });
    if (response.status === 304 && cache?.rawBody) {
      return {
        sourceType: "rss", sourceKey: normalizeUrl(resolvedUrl || url), sourceUrl: normalizeUrl(resolvedUrl || url),
        fetchStatus: "not-modified", httpStatus: 304,
        etag: response.headers.get("etag") || cache.etag || "", lastModified: response.headers.get("last-modified") || cache.lastModified || "",
        raw: { contentType: response.headers.get("content-type") || "", text: cache.rawBody },
        normalized: cache.normalized || parseRssText(cache.rawBody, resolvedUrl || url),
      };
    }
    throwForUpstreamStatus(response, "RSS request");
    return {
      sourceType: "rss",
      sourceKey: normalizeUrl(resolvedUrl || url),
      sourceUrl: normalizeUrl(resolvedUrl || url),
      httpStatus: response.status,
      etag: response.headers.get("etag") || "",
      lastModified: response.headers.get("last-modified") || "",
      raw: { contentType: response.headers.get("content-type") || "", text },
      normalized: parseRssText(text, resolvedUrl || url),
    };
  }
  return { fetchByUrl, parseRssText };
}

module.exports = { createRssAdapter, parseDurationMinutes, parseRssText };
