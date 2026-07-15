const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { normalizeAppleResult } = require("../lib/import/adapters/apple");
const { buildPodcastIndexAuthHeaders } = require("../lib/import/adapters/podcast-index");
const { parseRssText } = require("../lib/import/adapters/rss");
const { parseWebsiteHtml } = require("../lib/import/adapters/website");
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
  assert.equal(normalized.firstPublicationDate, "2026-06-01T00:00:00.000Z");
  assert.equal(normalized.latestPublicationDate, "2026-06-08T00:00:00.000Z");
});

test("parseRssText handles Podcasting 2.0 people, transcripts, funding, episode types, and observed runtime", () => {
  const normalized = parseRssText(`<?xml version="1.0"?>
    <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0">
      <channel>
        <title>Deep Signal</title><description><![CDATA[<p>A complete short fiction series.</p>]]></description>
        <podcast:guid>4c4d1ac2-1ab3-42ad-8898-123456789abc</podcast:guid>
        <podcast:medium>podcast</podcast:medium><podcast:complete>true</podcast:complete>
        <podcast:person role="writer" group="creative" href="https://example.com/alex">Alex Writer</podcast:person>
        <podcast:funding url="https://example.com/support">Support</podcast:funding>
        <podcast:license url="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</podcast:license>
        <item><guid>one</guid><title>One</title><pubDate>2026-01-01T00:00:00Z</pubDate><itunes:duration>1800</itunes:duration><itunes:season>1</itunes:season><podcast:transcript url="/one.vtt" type="text/vtt" language="en" /></item>
        <item><guid>bonus</guid><title>Bonus</title><itunes:episodeType>bonus</itunes:episodeType><pubDate>2026-01-02T00:00:00Z</pubDate></item>
        <item><guid>trailer</guid><title>Trailer</title><itunes:episodeType>trailer</itunes:episodeType><pubDate>2025-12-20T00:00:00Z</pubDate></item>
      </channel>
    </rss>`, "https://example.com/feed.xml");

  assert.equal(normalized.podcastGuid, "4c4d1ac2-1ab3-42ad-8898-123456789abc");
  assert.equal(normalized.complete, true);
  assert.deepEqual(normalized.episodeCounts, { full: 1, bonus: 1, trailer: 1, totalObserved: 3, exact: true });
  assert.equal(normalized.avgEpisodeMinutes, 30);
  assert.equal(normalized.transcripts.coverage, 0.333);
  assert.deepEqual(normalized.transcripts.languages, ["en"]);
  assert.equal(normalized.transcripts.captions, true);
  assert.equal(normalized.people[0].name, "Alex Writer");
  assert.equal(normalized.supportUrl, "https://example.com/support");
  assert.equal(normalized.license.value, "CC BY 4.0");
});

test("parseRssText supports Atom entries and rejects DTD/entity or malformed XML", () => {
  const atom = parseRssText(`<?xml version="1.0"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>Atom Fiction</title><subtitle>A short drama.</subtitle>
      <link rel="self" href="https://example.com/atom.xml" />
      <link rel="alternate" href="https://example.com/show" />
      <entry><id>ep-1</id><title>Episode One</title><published>2026-01-01T00:00:00Z</published><link rel="enclosure" href="https://example.com/1.mp3" type="audio/mpeg" /></entry>
    </feed>`, "https://example.com/atom.xml");
  assert.equal(atom.sourceFormat, "atom");
  assert.equal(atom.rssUrl, "https://example.com/atom.xml");
  assert.equal(atom.episodeCount, 1);
  assert.throws(() => parseRssText('<!DOCTYPE rss [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><rss><channel><title>&xxe;</title></channel></rss>'), /prohibited DTD/i);
  assert.throws(() => parseRssText("<rss><channel><title>Broken</channel></rss>"), /malformed/i);
});

test("parseWebsiteHtml extracts official links and JSON-LD metadata from show sites", () => {
  const normalized = parseWebsiteHtml(
    `<!doctype html>
      <html lang="en">
        <head>
          <title>Archive Site</title>
          <meta property="og:title" content="Signal Lost" />
          <meta property="og:description" content="An atmospheric fiction mystery." />
          <meta property="og:image" content="/cover.jpg" />
          <link rel="alternate" type="application/rss+xml" href="/feed.xml" />
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "PodcastSeries",
              "name": "Signal Lost",
              "author": { "@type": "Person", "name": "Archive Studio" },
              "publisher": { "@type": "Organization", "name": "Night Signal Network" },
              "sameAs": [
                "https://open.spotify.com/show/abc123",
                "https://www.patreon.com/signal-lost"
              ]
            }
          </script>
        </head>
        <body>
          <a href="https://discord.gg/signal-lost">Discord</a>
          <a href="https://youtube.com/@signallost">YouTube</a>
        </body>
      </html>`,
    "https://example.com/shows/signal-lost",
  );

  assert.equal(normalized.title, "Signal Lost");
  assert.equal(normalized.creatorName, "Archive Studio");
  assert.equal(normalized.networkName, "Night Signal Network");
  assert.equal(normalized.rssUrl, "https://example.com/feed.xml");
  assert.equal(normalized.artworkUrl, "https://example.com/cover.jpg");
  assert.equal(normalized.spotifyUrl, "https://open.spotify.com/show/abc123");
  assert.equal(normalized.patreonUrl, "https://www.patreon.com/signal-lost");
  assert.equal(normalized.discordUrl, "https://discord.gg/signal-lost");
  assert.equal(normalized.youtubeUrl, "https://youtube.com/@signallost");
});

test("parseWebsiteHtml classifies expanded official platform and support links and limits crawl hints", () => {
  const normalized = parseWebsiteHtml(`<!doctype html><html><head><title>Signal</title></head><body>
    <a href="/about">About the show</a><a href="/cast">Cast</a><a href="/legal">Legal</a>
    <a href="https://music.youtube.com/playlist?list=abc">YouTube Music</a>
    <a href="https://music.amazon.com/podcasts/abc">Amazon Music</a>
    <a href="https://pca.st/abc">Pocket Casts</a><a href="https://ko-fi.com/signal">Ko-fi</a>
    <a href="https://bsky.app/profile/signal.example">Bluesky</a>
  </body></html>`, "https://example.com/");
  assert.equal(normalized.youtubeMusicUrl, "https://music.youtube.com/playlist?list=abc");
  assert.equal(normalized.amazonMusicUrl, "https://music.amazon.com/podcasts/abc");
  assert.equal(normalized.pocketCastsUrl, "https://pca.st/abc");
  assert.equal(normalized.koFiUrl, "https://ko-fi.com/signal");
  assert.deepEqual(normalized.crawlUrls, ["https://example.com/about", "https://example.com/cast"]);
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
