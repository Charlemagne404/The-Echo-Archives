#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const SITE_ROOT = path.resolve(__dirname, "..");
const SHOWS_DIRECTORY = path.join(SITE_ROOT, "catalog-src", "shows");
const TAXONOMY_PATH = path.join(SITE_ROOT, "catalog-src", "tag-taxonomy.json");

const FORMAT_MOVES = new Map([
  ["Anthology", "anthology"],
  ["Full cast", "full-cast"],
  ["Narrated", "narrated"],
  ["Serialized", "serialized"],
]);

const RETIRED_TAGS = new Set([
  "Arcade", "Assigned roles", "Aviation", "Boston", "Comfort listen", "Cinematic", "Couriers", "Diner",
  "Epic", "Fire lookout", "Funeral directors", "Mall", "Museum", "New Orleans", "Paris", "Scary stories",
  "Solar research", "Theme park", "Toronto",
]);

const REPLACEMENTS = new Map([
  ["Character drama", ["Character-driven"]],
  ["Comedy Fiction", ["Comedy"]],
  ["Comedy mystery", ["Comedy", "Mystery"]],
  ["Corporate conspiracy", ["Corporate", "Conspiracy"]],
  ["Corporate dystopia", ["Corporate", "Dystopian"]],
  ["Crime thriller", ["Crime", "Thriller"]],
  ["Detective comedy", ["Detective", "Comedy"]],
  ["Documentary framing", ["Mock documentary"]],
  ["Family secrets", ["Family secret"]],
  ["Forensic mystery", ["Forensics", "Mystery"]],
  ["Found audio", ["Found media"]],
  ["Found documents", ["Found media"]],
  ["Found footage", ["Found media"]],
  ["Found tapes", ["Found media"]],
  ["Ghost story", ["Ghosts"]],
  ["Gothic horror", ["Gothic", "Horror"]],
  ["Horror anthology", ["Horror"]],
  ["Horror fiction", ["Horror"]],
  ["Horror romance", ["Horror", "Romance"]],
  ["Investigative", ["Investigation"]],
  ["Investigative podcast", ["Investigation"]],
  ["Lovecraftian horror", ["Lovecraftian", "Horror"]],
  ["Medical drama", ["Medical"]],
  ["Murder mystery", ["Murder", "Mystery"]],
  ["Paranormal investigation", ["Paranormal", "Investigation"]],
  ["Paranormal mystery", ["Paranormal", "Mystery"]],
  ["Portal fantasy", ["Portal worlds", "Fantasy"]],
  ["Psychological horror", ["Psychological", "Horror"]],
  ["Psychological mystery", ["Psychological", "Mystery"]],
  ["Psychological thriller", ["Psychological", "Thriller"]],
  ["Queer fiction", ["Queer"]],
  ["Queer romance", ["Queer", "Romance"]],
  ["Space comedy", ["Space", "Comedy"]],
  ["Space western", ["Space", "Western"]],
  ["Spy comedy", ["Espionage", "Comedy"]],
  ["Supernatural horror", ["Supernatural", "Horror"]],
  ["Supernatural western", ["Supernatural", "Western"]],
  ["Vampire fiction", ["Vampires"]],
]);

const SHOW_TAG_LIMITS = new Map([
  ["caravan", ["Portal worlds", "Fantasy", "Queer", "Found family"]],
  ["hi-nay", ["Horror", "Supernatural", "Mystery", "Filipino"]],
  ["homecoming", ["Psychological", "Thriller", "Military", "Conspiracy"]],
  ["how-i-died", ["Forensics", "Mystery", "Ghosts", "Small town"]],
  ["impact-winter", ["Survival", "Post-apocalyptic", "Vampires", "Sci-fi"]],
  ["midnight-radio", ["Ghosts", "Small town", "Queer", "Radio"]],
  ["midst", ["Science fantasy", "Space", "Western", "Frontier"]],
  ["mission-rejected", ["Espionage", "Comedy", "Ensemble", "Action"]],
  ["old-gods-of-appalachia", ["Horror", "Appalachia", "Eldritch", "Folk horror"]],
  ["oz-9", ["Space", "Comedy", "Corporate", "Sleeper ship"]],
  ["red-valley", ["Cryonics", "Experimental science", "Conspiracy", "Memory"]],
  ["the-cellar-letters", ["Horror", "Found media", "Haunted house", "Analog horror"]],
  ["the-penumbra-podcast", ["Sci-fi", "Private investigator", "Fantasy", "Queer"]],
  ["the-polybius-conspiracy", ["Video games", "Mystery", "1980s", "Conspiracy"]],
  ["the-silt-verses", ["Horror", "Folk horror", "Cults", "Weird fiction"]],
  ["we-fix-space-junk", ["Sci-fi", "Road trip", "Dystopian", "Queer"]],
]);

const FACET_BY_TAG = new Map([
  ["genre", ["Adventure", "Comedy", "Fantasy", "Horror", "Mystery", "Sci-fi", "Supernatural", "Thriller"]],
  ["setting", ["Antarctica", "Appalachia", "Arctic", "Ocean", "Rural", "Small town", "Space", "Underwater", "Wilderness"]],
  ["era", ["1930s", "1980s", "1990s", "Historical", "Victorian"]],
  ["framing", ["Analog horror", "Anthology", "Documentary framing", "Found media", "Narrated", "Serialized", "Unfiction"]],
  ["representation", ["Filipino", "Queer"]],
  ["tone", ["Black comedy", "Dark comedy", "Gothic", "New Weird", "Punk", "Satire", "Weird fiction"]],
]);

function tagId(label) {
  return String(label || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function facetForTag(label) {
  for (const [facet, tags] of FACET_BY_TAG) {
    if (tags.includes(label)) return facet;
  }
  return "hook";
}

function unique(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = String(value || "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function migrateTags(tags) {
  const nextTags = [];
  const movedFormats = [];
  const dispositions = [];

  (Array.isArray(tags) ? tags : []).forEach((tag) => {
    if (RETIRED_TAGS.has(tag)) {
      dispositions.push({ tag, action: "retire" });
      return;
    }
    if (FORMAT_MOVES.has(tag)) {
      movedFormats.push(FORMAT_MOVES.get(tag));
      dispositions.push({ tag, action: "move-to-format", value: FORMAT_MOVES.get(tag) });
      return;
    }
    if (REPLACEMENTS.has(tag)) {
      const values = REPLACEMENTS.get(tag);
      nextTags.push(...values);
      dispositions.push({ tag, action: "replace", values });
      return;
    }
    nextTags.push(tag);
    dispositions.push({ tag, action: "retain", values: [tag] });
  });

  return { tags: unique(nextTags), formats: unique(movedFormats), dispositions };
}

function readShows() {
  return fs.readdirSync(SHOWS_DIRECTORY)
    .filter((fileName) => fileName.endsWith(".json") && fileName !== "_order.json")
    .sort((left, right) => left.localeCompare(right))
    .map((fileName) => ({ fileName, record: JSON.parse(fs.readFileSync(path.join(SHOWS_DIRECTORY, fileName), "utf8")) }));
}

function buildTaxonomy(labels) {
  const entries = labels
    .sort((left, right) => left.localeCompare(right))
    .map((label) => ({ id: tagId(label), label, facet: facetForTag(label), status: "approved" }));
  const duplicateIds = entries.filter((entry, index) => entries.findIndex((candidate) => candidate.id === entry.id) !== index);
  if (duplicateIds.length) {
    throw new Error(`Taxonomy id collision: ${duplicateIds.map((entry) => entry.id).join(", ")}`);
  }
  return {
    version: 1,
    description: "Controlled public discovery vocabulary. Publisher keywords are evidence and must not be added here automatically.",
    facets: [
      { id: "genre", label: "Genre" },
      { id: "setting", label: "Setting" },
      { id: "hook", label: "Story hook" },
      { id: "framing", label: "Narrative framing" },
      { id: "tone", label: "Tone and style" },
      { id: "era", label: "Era" },
      { id: "representation", label: "Representation" },
    ],
    aliases: {
      "science fiction": "Sci-fi",
      "science-fiction": "Sci-fi",
      "sci fi": "Sci-fi",
      "scifi": "Sci-fi",
      "found audio": "Found media",
      "found documents": "Found media",
      "found footage": "Found media",
      "found tapes": "Found media",
    },
    tags: entries,
  };
}

function main() {
  const write = process.argv.includes("--write");
  const shows = readShows();
  const migrated = shows.map(({ fileName, record }) => {
    const result = migrateTags(record.tags);
    const limitedTags = SHOW_TAG_LIMITS.get(record.id) || result.tags;
    return {
      fileName,
      record: {
        ...record,
        tags: limitedTags,
        formats: unique([...(record.formats || []), ...result.formats]),
      },
      result,
    };
  });
  const taxonomy = buildTaxonomy([...new Set(migrated.flatMap(({ record }) => record.tags || []))]);
  const changedShows = migrated.filter(({ record, fileName }) => fs.readFileSync(path.join(SHOWS_DIRECTORY, fileName), "utf8") !== `${JSON.stringify(record, null, 2)}\n`);
  const actionCounts = migrated.flatMap(({ result }) => result.dispositions).reduce((counts, item) => {
    counts[item.action] = (counts[item.action] || 0) + 1;
    return counts;
  }, {});

  console.log(JSON.stringify({ shows: shows.length, changedShows: changedShows.length, taxonomyTags: taxonomy.tags.length, actionCounts }, null, 2));
  if (!write) return;

  changedShows.forEach(({ fileName, record }) => {
    fs.writeFileSync(path.join(SHOWS_DIRECTORY, fileName), `${JSON.stringify(record, null, 2)}\n`);
  });
  fs.writeFileSync(TAXONOMY_PATH, `${JSON.stringify(taxonomy, null, 2)}\n`);
}

main();

module.exports = { buildTaxonomy, migrateTags };
