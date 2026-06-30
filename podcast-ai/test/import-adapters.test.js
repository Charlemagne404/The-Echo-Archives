const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { normalizeAppleResult } = require("../lib/import/adapters/apple");
const { buildPodcastIndexAuthHeaders } = require("../lib/import/adapters/podcast-index");
const { parseRssText } = require("../lib/import/adapters/rss");
const { buildDedupeMatches } = require("../lib/import/dedupe");

test("normalizeAppleResult extracts discovery and feed metadata from Apple payloads", () => {
  const normalized = normalizeAppleResult({
    collectionId: 123456,
    collectionName: "Midnight Burger",
    artistName: "Fable and Folly",
    description: "<p>A diner between worlds.</p>",
    collectionViewUrl: "https://podcasts.apple.com/us/podcast/midnight-burger/id123456",
    feedUrl: "https://midnightburger.libsyn.com/rss",
    artworkUrl600: "https://is1-ssl.mzstatic.com/image600.jpg",
    genres: ["Fiction", "Comedy Fiction"],
    primaryGenreName: "Fiction",
    contentAdvisoryRating: "Clean",
    trackCount: 42,
    releaseDate: "2026-06-01T00:00:00Z",
    country: "USA",
  });

  assert.equal(normalized.title, "Midnight Burger");
  assert.equal(normalized.creatorName, "Fable and Folly");
  assert.equal(normalized.description, "A diner between worlds.");
  assert.equal(normalized.appleCollectionId, "123456");
  assert.equal(normalized.rssUrl, "https://midnightburger.libsyn.com/rss");
  assert.deepEqual(normalized.genreHints, ["Fiction", "Comedy Fiction"]);
  assert.equal(normalized.episodeCount, 42);
});

test("parseRssText extracts canonical feed metadata from RSS XML", () => {
  const normalized = parseRssText(
    `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
        <channel>
          <title><![CDATA[Signal Lost]]></title>
          <itunes:author>Archive Studio</itunes:author>
          <itunes:summary><![CDATA[An atmospheric fiction mystery feed.]]></itunes:summary>
          <itunes:image href="https://example.com/covers/signal-lost.jpg" />
          <language>en</language>
          <itunes:category text="Fiction" />
          <itunes:category text="Mystery" />
          <item><title>Episode 1</title><pubDate>Mon, 01 Jun 2026 00:00:00 GMT</pubDate></item>
          <item><title>Episode 2</title><pubDate>Mon, 08 Jun 2026 00:00:00 GMT</pubDate></item>
        </channel>
      </rss>`,
    "https://example.com/feed.xml",
  );

  assert.equal(normalized.title, "Signal Lost");
  assert.equal(normalized.creatorName, "Archive Studio");
  assert.equal(normalized.description, "An atmospheric fiction mystery feed.");
  assert.equal(normalized.rssUrl, "https://example.com/feed.xml");
  assert.equal(normalized.artworkUrl, "https://example.com/covers/signal-lost.jpg");
  assert.deepEqual(normalized.categories, ["Fiction", "Mystery"]);
  assert.equal(normalized.episodeCount, 2);
  assert.equal(normalized.latestPublicationDate, "2026-06-08T00:00:00.000Z");
});

test("buildPodcastIndexAuthHeaders matches the documented SHA-1 auth scheme", () => {
  const now = Date.parse("2026-06-30T12:00:00Z");
  const headers = buildPodcastIndexAuthHeaders({
    apiKey: "test-key",
    apiSecret: "test-secret",
    userAgent: "EchoImportTest/1.0",
    now,
  });
  const expectedDate = String(Math.floor(now / 1000));
  const expectedAuthorization = crypto.createHash("sha1").update(`test-keytest-secret${expectedDate}`).digest("hex");

  assert.equal(headers["User-Agent"], "EchoImportTest/1.0");
  assert.equal(headers["X-Auth-Key"], "test-key");
  assert.equal(headers["X-Auth-Date"], expectedDate);
  assert.equal(headers.Authorization, expectedAuthorization);
});

test("buildDedupeMatches detects show and candidate duplicates across stable identifiers", () => {
  const matches = buildDedupeMatches({
    objective: {
      title: "Signal Lost",
      creatorName: "Archive Studio",
      rssUrl: "https://example.com/feed.xml",
      appleCollectionId: "123456",
      podcastIndexGuid: "guid-1",
    },
    shows: [
      {
        id: "signal-lost",
        title: "Signal Lost",
        listenLinks: {
          rss: "https://example.com/feed.xml",
        },
        credits: {
          creatorName: "Archive Studio",
        },
        metadata: {
          importIdentifiers: {
            appleCollectionId: "123456",
          },
        },
      },
    ],
    candidates: [
      {
        id: "candidate-1",
        title: "Signal Lost",
        objective: {
          title: "Signal Lost",
          creatorName: "Archive Studio",
          podcastIndexGuid: "guid-1",
        },
      },
    ],
  });

  assert.equal(matches.hasDuplicateMatch, true);
  assert.equal(matches.hasExactMatch, true);
  assert.ok(matches.existingShows.some((match) => match.matchType === "rss-url"));
  assert.ok(matches.existingCandidates.some((match) => match.matchType === "podcast-index-guid"));
});
