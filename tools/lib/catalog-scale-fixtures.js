const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createShowTemplate, createCollectionTemplate } = require("./catalog-schema");

const GENRES = ["adventure", "comedy", "drama", "fantasy", "horror", "mystery", "sci-fi", "science", "supernatural", "thriller"];
const VOICE_STYLES = ["primarily-acted", "primarily-narrated", "mixed"];
const NARRATIVE_FOCI = ["character-driven", "plot-driven", "balanced"];
const INTENSITIES = ["low", "medium", "high", "variable"];
const COMMITMENTS = ["single-sitting", "short", "medium", "long", "deep-dive"];
const SHOWS_PER_COHORT = 20;

function pad(value, width = 5) {
  return String(value).padStart(width, "0");
}

function createScaleDataset(showCount) {
  if (!Number.isInteger(showCount) || showCount < 1) {
    throw new Error("Synthetic catalogue size must be a positive integer.");
  }

  const cohortCount = Math.ceil(showCount / SHOWS_PER_COHORT);
  const entities = Array.from({ length: cohortCount }, (_, cohort) => {
    const id = `synthetic-creator-${pad(cohort)}`;
    return {
      id,
      name: `Synthetic Creator ${pad(cohort)}`,
      type: "person",
      aliases: [],
      publication: "public",
      indexable: true,
      directory: false,
      reviewedAt: "2026-09-01",
      sources: [`https://example.invalid/scale-fixtures/${id}`],
    };
  });

  const shows = Array.from({ length: showCount }, (_, index) => {
    const id = `synthetic-show-${pad(index)}`;
    const cohort = Math.floor(index / SHOWS_PER_COHORT);
    const cohortStart = cohort * SHOWS_PER_COHORT;
    const cohortEnd = Math.min(cohortStart + SHOWS_PER_COHORT, showCount);
    const entity = entities[cohort];
    const show = createShowTemplate({ id, title: `Synthetic Signal ${pad(index)}`, today: "2026-09-01" });
    show.status = "published";
    show.reviewStatus = "indexed-only";
    show.description = `Synthetic benchmark fixture ${pad(index)} belongs to listening cohort ${pad(cohort)}. Its invented metadata exists only to measure catalogue loading, discovery, generation, and rendering at scale.`;
    show.cover = "images/TEA-Logo-S.png";
    show.coverAlt = `${show.title} synthetic benchmark cover`;
    show.genres = [GENRES[cohort % GENRES.length]];
    show.tones = [`synthetic-tone-${pad(cohort)}`];
    show.formats = [`synthetic-format-${pad(cohort)}`];
    show.themes = [`synthetic-theme-${pad(cohort)}`];
    show.bestFor = [`synthetic-listening-route-${pad(cohort)}`];
    show.discovery = {
      voiceStyle: VOICE_STYLES[cohort % VOICE_STYLES.length],
      narrativeFocus: NARRATIVE_FOCI[cohort % NARRATIVE_FOCI.length],
      intensity: INTENSITIES[cohort % INTENSITIES.length],
      commitment: COMMITMENTS[cohort % COMMITMENTS.length],
    };
    show.creators = [entity.name];
    show.entityLinks = [{ entityId: entity.id, role: "creator" }];
    show.ratings = {};
    show.similarTo = index === cohortStart
      ? Array.from({ length: Math.min(4, cohortEnd - cohortStart - 1) }, (_, offset) => `synthetic-show-${pad(cohortStart + offset + 1)}`)
      : [];
    show.similarReasons = Object.fromEntries(show.similarTo.map((targetId) => [
      targetId,
      "Both fixtures share a synthetic creator, tone, theme, and listening route for scale testing.",
    ]));
    return show;
  });

  const collections = Array.from({ length: cohortCount }, (_, cohort) => {
    const start = cohort * SHOWS_PER_COHORT;
    const showIds = shows.slice(start, start + SHOWS_PER_COHORT).map((show) => show.id);
    return {
      ...createCollectionTemplate({
        id: `synthetic-cohort-${pad(cohort)}`,
        title: `Synthetic Cohort ${pad(cohort)}`,
        today: "2026-09-01",
        order: cohort,
        showIds,
      }),
      description: `A synthetic group of up to ${SHOWS_PER_COHORT} benchmark records. This fixture collection is generated temporarily and is not part of the authored archive.`,
      kind: "curated",
      intentTags: [`synthetic-cohort-${pad(cohort)}`],
    };
  });

  return { shows, collections, entities, cohortCount };
}

function writeScaleFixture(showCount) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-scale-"));
  const dataset = createScaleDataset(showCount);
  const showsDirectory = path.join(root, "catalog-src", "shows");
  const collectionsDirectory = path.join(root, "catalog-src", "collections");
  fs.mkdirSync(showsDirectory, { recursive: true });
  fs.mkdirSync(collectionsDirectory, { recursive: true });
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  fs.writeFileSync(path.join(root, "catalog-src", "entities.json"), `${JSON.stringify(dataset.entities, null, 2)}\n`);
  fs.writeFileSync(path.join(showsDirectory, "_order.json"), `${JSON.stringify(dataset.shows.map((show) => show.id))}\n`);
  fs.writeFileSync(path.join(collectionsDirectory, "_order.json"), `${JSON.stringify(dataset.collections.map((collection) => collection.id))}\n`);

  dataset.shows.forEach((show) => {
    fs.writeFileSync(path.join(showsDirectory, `${show.id}.json`), `${JSON.stringify(show)}\n`);
  });
  dataset.collections.forEach((collection) => {
    fs.writeFileSync(path.join(collectionsDirectory, `${collection.id}.json`), `${JSON.stringify(collection)}\n`);
  });

  return {
    ...dataset,
    root,
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

module.exports = {
  SHOWS_PER_COHORT,
  createScaleDataset,
  writeScaleFixture,
};
