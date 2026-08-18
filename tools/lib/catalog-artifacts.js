const fs = require("node:fs");
const path = require("node:path");

const {
  GENERATED_STATUS_PATH,
  RUNTIME_DATA_DIR,
  SEARCH_INDEX_PATH,
  writeJsonFile,
} = require("./catalog-source");
const { buildPhase2Readiness } = require("../../backend/lib/discovery-gaps");

function serializeRuntimeShow(record) {
  const {
    imageSrc: _imageSrc,
    searchIndex: _searchIndex,
    ...serializable
  } = record;

  const importMetadata = serializable.metadata?.import;
  if (!importMetadata) {
    return serializable;
  }

  return {
    ...serializable,
    metadata: {
      ...serializable.metadata,
      import: {
        pipelineVersion: importMetadata.pipelineVersion,
        identifiers: importMetadata.identifiers,
        selectedSources: (importMetadata.selectedSources || []).map(({ sourceType, sourceUrl, fetchedAt }) => ({
          sourceType,
          sourceUrl,
          fetchedAt,
        })),
        fields: importMetadata.fields,
        importedAt: importMetadata.importedAt,
        optionalGaps: importMetadata.optionalGaps,
        publication: importMetadata.publication,
        ...(importMetadata.factualReview ? {
          factualReview: {
            reviewedAt: importMetadata.factualReview.reviewedAt,
            inputRevision: importMetadata.factualReview.inputRevision,
          },
        } : {}),
      },
    },
  };
}

function createSearchIndexRecord(record) {
  const runtimeRecord = serializeRuntimeShow(record);

  return {
    id: runtimeRecord.id,
    title: runtimeRecord.title,
    subtitle: runtimeRecord.subtitle,
    description: runtimeRecord.description,
    cover: runtimeRecord.cover,
    coverVariants: runtimeRecord.coverVariants,
    coverAlt: runtimeRecord.coverAlt,
    creators: runtimeRecord.creators,
    accent: runtimeRecord.accent,
    status: runtimeRecord.status,
    reviewStatus: runtimeRecord.reviewStatus,
    releaseStatus: runtimeRecord.releaseStatus,
    completionStatus: runtimeRecord.completionStatus,
    genres: runtimeRecord.genres,
    tones: runtimeRecord.tones,
    formats: runtimeRecord.formats,
    tags: runtimeRecord.tags,
    aliases: runtimeRecord.aliases,
    themes: runtimeRecord.themes,
    contentNotes: runtimeRecord.contentNotes,
    languages: runtimeRecord.languages,
    transcriptLanguages: runtimeRecord.transcriptLanguages,
    bestFor: runtimeRecord.bestFor,
    similarTo: runtimeRecord.similarTo,
    similarReasons: runtimeRecord.similarReasons,
    archiveTake: runtimeRecord.archiveTake,
    facts: runtimeRecord.facts,
    credits: runtimeRecord.credits,
    availability: runtimeRecord.availability,
    content: runtimeRecord.content,
    ratings: runtimeRecord.ratings,
    popularity: runtimeRecord.popularity,
    featured: runtimeRecord.featured,
    createdAt: runtimeRecord.createdAt,
    updatedAt: runtimeRecord.updatedAt,
  };
}

function buildCatalogSnapshot(catalog, collections, reviewCount, gapReport, archiveContext, reviewsById = {}, tagTaxonomy = {}) {
  const publishedShows = catalog.filter((show) => show.status === "published");
  const latestUpdatedAt = [
    ...publishedShows.map((show) => show.updatedAt),
    ...collections.map((collection) => collection.updatedAt),
  ]
    .filter(Boolean)
    .sort()
    .at(-1) || "Unknown";
  const creatorVerifiedCount = publishedShows.filter((show) => show.verification?.status === "creator-verified").length;
  const withRssCount = publishedShows.filter((show) => Boolean(show.listenLinks?.rss)).length;
  const missingObjectiveSourcesCount = publishedShows.filter(
    (show) => !Array.isArray(show.metadata?.objectiveSources) || show.metadata.objectiveSources.length === 0,
  ).length;
  const withResearchGapsCount = publishedShows.filter(
    (show) => Array.isArray(show.metadata?.researchGaps) && show.metadata.researchGaps.length > 0,
  ).length;
  const reviewStatusCounts = new Map();

  publishedShows.forEach((show) => {
    reviewStatusCounts.set(show.reviewStatus, (reviewStatusCounts.get(show.reviewStatus) || 0) + 1);
  });

  const phase2 = buildPhase2Readiness(catalog, collections, { reviewsById, tagTaxonomy });

  return {
    catalog,
    collections,
    latestUpdatedAt,
    gapReport,
    archiveContext,
    phase2,
    metrics: {
      totalShows: catalog.length,
      publishedShows: publishedShows.length,
      draftShows: catalog.filter((show) => show.status === "draft").length,
      fullReviews: reviewStatusCounts.get("full-review") || 0,
      spotlightReviews: reviewStatusCounts.get("spotlight") || 0,
      indexedOnly: reviewStatusCounts.get("indexed-only") || 0,
      imported: reviewStatusCounts.get("imported") || 0,
      plannedReviews: reviewStatusCounts.get("planned") || 0,
      collections: collections.length,
      reviewCompanions: reviewCount,
      creatorVerified: creatorVerifiedCount,
      withRss: withRssCount,
      missingObjectiveSources: missingObjectiveSourcesCount,
      withResearchGaps: withResearchGapsCount,
    },
  };
}

function buildArchiveStats(catalog, collections) {
  const publishedShows = catalog.filter((show) => show.status === "published");
  const creatorNames = new Set();

  publishedShows.forEach((show) => {
    (Array.isArray(show.creators) ? show.creators : []).forEach((creator) => {
      if (creator) {
        creatorNames.add(creator);
      }
    });
  });

  const latestUpdatedAt = [
    ...publishedShows.map((show) => show.updatedAt),
    ...collections.map((collection) => collection.updatedAt),
  ]
    .filter(Boolean)
    .sort()
    .at(-1) || "";

  return {
    showCount: publishedShows.length,
    fullReviewCount: publishedShows.filter((show) => show.reviewStatus === "full-review").length,
    collectionCount: collections.length,
    latestUpdatedAt,
    creatorCount: creatorNames.size,
    metadataCheckedCount: publishedShows.filter(
      (show) => Boolean(show.verification?.status || show.verification?.verifiedAt || show.metadata?.objectiveVerifiedAt),
    ).length,
  };
}

function buildCatalogStatusMarkdown(snapshot) {
  const { metrics, latestUpdatedAt, gapReport, archiveContext, phase2 } = snapshot;
  const phase2Status = phase2?.complete ? "complete" : "content-pending";
  const phase2BlockingErrors = phase2?.blockingErrors || [];

  return [
    "# Catalog Status",
    "",
    `Latest catalog update: \`${latestUpdatedAt}\``,
    "",
    "## Snapshot",
    "",
    "| Metric | Value |",
    "| --- | ---: |",
    `| Total shows | ${metrics.totalShows} |`,
    `| Published shows | ${metrics.publishedShows} |`,
    `| Draft shows | ${metrics.draftShows} |`,
    `| Full reviews | ${metrics.fullReviews} |`,
    `| Spotlight reviews | ${metrics.spotlightReviews} |`,
    `| Indexed-only shows | ${metrics.indexedOnly} |`,
    `| Imported shows | ${metrics.imported} |`,
    `| Planned reviews | ${metrics.plannedReviews} |`,
    `| Collections | ${metrics.collections} |`,
    `| Review companions | ${metrics.reviewCompanions} |`,
    `| Creator-verified shows | ${metrics.creatorVerified} |`,
    `| Shows with RSS | ${metrics.withRss} |`,
    `| Shows missing metadata.objectiveSources | ${metrics.missingObjectiveSources} |`,
    `| Shows with metadata.researchGaps | ${metrics.withResearchGaps} |`,
    "",
    "## Discovery Gaps",
    "",
    `- Shows missing similarReasons: ${gapReport.publishedShowsMissingSimilarReasons.length}`,
    `- Shows with out-of-range similar links: ${gapReport.publishedShowsWithOutOfRangeSimilarLinks.length}`,
    `- Shows with fewer than 2 collection memberships: ${gapReport.publishedShowsWithTooFewCollectionMemberships.length}`,
    `- Anchor shows with fewer than 3 collection memberships: ${gapReport.anchorShowsWithTooFewCollectionMemberships.length}`,
    `- Route collections missing showReasons: ${gapReport.routeCollectionsMissingShowReasons.length}`,
    "",
    "## Optional Datasets",
    "",
    `- Creators: ${archiveContext.creators.length}`,
    `- Networks: ${archiveContext.networks.length}`,
    `- Changelog entries: ${archiveContext.changelog.length}`,
    "",
    "## Phase 2 Readiness (Gate B)",
    "",
    `- Status: \`${phase2Status}\``,
    `- Numeric targets: ${phase2?.numericTargets?.publishedShows?.actual || 0} published shows (floor ${phase2?.numericTargets?.publishedShows?.target || 129}), ${phase2?.numericTargets?.fullReviews?.actual || 0} full reviews (floor ${phase2?.numericTargets?.fullReviews?.target || 7}), ${phase2?.numericTargets?.collections?.actual || 0} collections (floor ${phase2?.numericTargets?.collections?.target || 29})`,
    `- Factual metadata gaps: ${phase2?.factual?.coreMetadataGaps?.length || 0} core, ${phase2?.factual?.missingObjectiveSources?.length || 0} missing provenance, ${phase2?.factual?.actionableMissingRss?.length || 0} actionable RSS, ${phase2?.factual?.missingRuntime?.length || 0} missing detailed runtime`,
    `- Explicit unknowns/research gaps: ${phase2?.factual?.documentedResearchGaps?.length || 0} records; ${phase2?.factual?.documentedMissingRss?.length || 0} missing RSS and ${phase2?.factual?.documentedRuntimeUnknowns?.length || 0} runtime gaps are documented rather than hidden`,
    `- Editorial/recommendation gaps: ${phase2?.editorial?.gaps?.length || 0}; collection blockers: ${phase2?.collections?.blockingErrors?.length || 0}`,
    `- Taxonomy: ${phase2?.taxonomy?.controlledLabelCount || 0} controlled labels; unknown/non-approved public tags: ${(phase2?.taxonomy?.unknownTags?.length || 0) + (phase2?.taxonomy?.nonApprovedTags?.length || 0)}`,
    `- Sparse indexed-only discovery gaps are informational: ${phase2?.sparseIndexedOnly?.count || 0} sparse records; ${phase2?.sparseIndexedOnly?.fewerThanTwoCollections || 0} have fewer than two collections, ${phase2?.sparseIndexedOnly?.outOfRangeSimilarLinks || 0} have no editorial similarity set, and ${phase2?.sparseIndexedOnly?.editorialViolations?.length || 0} contain unsupported editorial claims`,
    `- Phase 2 blocking errors: ${phase2BlockingErrors.length}`,
    ...(phase2BlockingErrors.length > 0 ? phase2BlockingErrors.map((error) => `  - ${error}`) : []),
    "",
  ].join("\n");
}

function writeCatalogArtifacts(siteRoot, { catalog, collections, reviewsById, gapReport, archiveContext, tagTaxonomy }) {
  const runtimeCatalog = catalog.filter((show) => show.status === "published").map(serializeRuntimeShow);
  const runtimeSearchIndex = catalog
    .filter((show) => show.status === "published")
    .map(createSearchIndexRecord);
  const snapshot = buildCatalogSnapshot(catalog, collections, Object.keys(reviewsById).length, gapReport, archiveContext, reviewsById, tagTaxonomy);
  const archiveStats = buildArchiveStats(catalog, collections);
  const statusMarkdown = buildCatalogStatusMarkdown(snapshot);

  writeJsonFile(path.join(siteRoot, RUNTIME_DATA_DIR, "shows.json"), runtimeCatalog);
  writeJsonFile(path.join(siteRoot, RUNTIME_DATA_DIR, "collections.json"), collections);
  const runtimeReviewsDirectory = path.join(siteRoot, "data", "reviews");
  fs.mkdirSync(runtimeReviewsDirectory, { recursive: true });
  fs.readdirSync(runtimeReviewsDirectory)
    .filter((fileName) => fileName.endsWith(".json") && !Object.hasOwn(reviewsById, fileName.replace(/\.json$/i, "")))
    .forEach((fileName) => {
      fs.rmSync(path.join(runtimeReviewsDirectory, fileName), { force: true });
    });
  Object.entries(reviewsById).forEach(([showId, reviewRecord]) => {
    writeJsonFile(path.join(runtimeReviewsDirectory, `${showId}.json`), reviewRecord);
  });
  writeJsonFile(path.join(siteRoot, SEARCH_INDEX_PATH), runtimeSearchIndex);
  writeJsonFile(path.join(siteRoot, "data", "archive-stats.json"), archiveStats);
  writeJsonFile(path.join(siteRoot, "data", "tag-taxonomy.json"), tagTaxonomy || {});
  writeJsonFile(path.join(siteRoot, "docs", "generated", "catalog-status.json"), {
    ...snapshot.metrics,
    phase2: snapshot.phase2,
  });
  fs.mkdirSync(path.dirname(path.join(siteRoot, GENERATED_STATUS_PATH)), { recursive: true });
  fs.writeFileSync(path.join(siteRoot, GENERATED_STATUS_PATH), `${statusMarkdown}\n`);

  return {
    runtimeCatalog,
    runtimeSearchIndex,
    statusMarkdown,
    snapshot,
  };
}

module.exports = {
  buildArchiveStats,
  buildCatalogSnapshot,
  buildCatalogStatusMarkdown,
  createSearchIndexRecord,
  serializeRuntimeShow,
  writeCatalogArtifacts,
};
