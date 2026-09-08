const path = require("node:path");
const { readCatalogSource } = require("./lib/catalog-source");
const {
  normalizeProvenance,
  validateProvenance,
} = require("./lib/catalog-provenance");

const ROOT = path.resolve(__dirname, "..");

function summarizeProvenance(shows) {
  const summary = {
    totalShows: shows.length,
    publishedShows: shows.filter((show) => show.status !== "draft").length,
    documentedProvenance: 0,
    legacyUnknown: 0,
    legacyWithObjectiveSources: 0,
    importedEvidence: 0,
    descriptionSourceRecorded: 0,
    artworkSourceRecorded: 0,
    rightsNotesRecorded: 0,
  };

  for (const show of shows) {
    if (show.provenance !== undefined) {
      validateProvenance(show.id, show.provenance);
      const provenance = normalizeProvenance(show.provenance);
      if (provenance.status === "documented") summary.documentedProvenance += 1;
      else summary.legacyUnknown += 1;
      if (provenance.description.sourceUrls.length || provenance.description.origin !== "unknown") {
        summary.descriptionSourceRecorded += 1;
      }
      if (provenance.artwork.sourceUrl) summary.artworkSourceRecorded += 1;
      if (provenance.rightsNotes || provenance.artwork.rightsNote || provenance.logos.some((logo) => logo.rightsNote)) {
        summary.rightsNotesRecorded += 1;
      }
    } else {
      summary.legacyUnknown += 1;
    }

    const objectiveSources = show.metadata?.objectiveSources;
    const selectedSources = show.metadata?.import?.selectedSources;
    if (Array.isArray(objectiveSources) && objectiveSources.length) summary.legacyWithObjectiveSources += 1;
    if (Array.isArray(selectedSources) && selectedSources.length) summary.importedEvidence += 1;
  }

  return summary;
}

function main() {
  const { shows } = readCatalogSource(ROOT);
  const summary = summarizeProvenance(shows);
  console.log("Provenance coverage");
  console.log(`Shows: ${summary.totalShows}`);
  console.log(`Published shows: ${summary.publishedShows}`);
  console.log(`Explicit documented provenance: ${summary.documentedProvenance}`);
  console.log(`Legacy/unknown provenance (omitted or marked): ${summary.legacyUnknown}`);
  console.log(`Existing objective source evidence (legacy-compatible): ${summary.legacyWithObjectiveSources}`);
  console.log(`Existing importer source evidence: ${summary.importedEvidence}`);
  console.log(`Description source/origin recorded: ${summary.descriptionSourceRecorded}`);
  console.log(`Cover artwork source recorded: ${summary.artworkSourceRecorded}`);
  console.log(`Rights/licensing notes recorded: ${summary.rightsNotesRecorded}`);
  console.log("This report tracks provenance metadata; it does not grant rights.");
}

if (require.main === module) main();

module.exports = { summarizeProvenance };
