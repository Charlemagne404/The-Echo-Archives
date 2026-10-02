const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRssText } = require('../lib/import/adapters/rss');

test('a bounded feed with 130000 small items does not overflow the JavaScript call stack', () => {
  const xml = '<rss><channel>' + '<item/>'.repeat(130000) + '</channel></rss>';
  assert.ok(Buffer.byteLength(xml) < 1024 * 1024);
  const normalized = parseRssText(xml, 'https://publisher.example/feed');
  assert.equal(normalized.episodeCount, 130000);
  assert.equal(normalized.seasonCount, null);
  assert.equal(normalized.duplicateEpisodeCount, 0);
  const healthy = parseRssText('<rss><channel><item><guid>healthy</guid></item></channel></rss>', 'https://publisher.example/feed');
  assert.equal(healthy.episodeCount, 1);
});
