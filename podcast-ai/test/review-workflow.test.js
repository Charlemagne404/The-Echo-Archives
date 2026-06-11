const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function createTempSiteRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-review-workflow-"));
}

function createShowRecord(overrides = {}) {
  return {
    id: "demo-show",
    title: "Demo Show",
    description: "A demo archive description.",
    cover: "images/Logo.png",
    coverAlt: "Demo Show cover art",
    status: "published",
    reviewStatus: "indexed-only",
    releaseStatus: "completed",
    completionStatus: "finished",
    listenLinks: {
      website: "",
    },
    genres: ["sci-fi"],
    tones: ["dark"],
    formats: ["full-cast"],
    tags: ["Time travel"],
    ratings: {
      archive: 8,
    },
    bestFor: ["easy-entry"],
    similarTo: [],
    archiveTake: "Worth indexing.",
    spoilerFreeReview: "",
    thoughts: "",
    quote: {
      text: "",
      attribution: "",
    },
    length: {
      label: "Length still being filled in.",
    },
    updatedAt: "2026-06-02",
    ...overrides,
  };
}

function runScript(scriptName, args = [], siteRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(projectRoot, "scripts", scriptName), ...args], {
      cwd: projectRoot,
      env: {
        ...process.env,
        STATIC_ROOT: siteRoot,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("review:new creates a review file and moves indexed-only shows into planned", async () => {
  const tempRoot = createTempSiteRoot();
  const dataRoot = path.join(tempRoot, "data");

  writeJson(path.join(dataRoot, "shows.json"), [createShowRecord()]);
  writeJson(path.join(dataRoot, "collections.json"), []);

  const result = await runScript("review-new.js", ["demo-show"], tempRoot);

  assert.equal(result.code, 0, result.stderr);

  const shows = JSON.parse(fs.readFileSync(path.join(dataRoot, "shows.json"), "utf8"));
  const reviewFile = JSON.parse(fs.readFileSync(path.join(dataRoot, "reviews", "demo-show.json"), "utf8"));

  assert.equal(shows[0].reviewStatus, "planned");
  assert.match(shows[0].updatedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(reviewFile.archiveTake, "Worth indexing.");
  assert.deepEqual(reviewFile.spoilerFreeReview, []);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("review:publish promotes a show to full-review when the companion file is complete", async () => {
  const tempRoot = createTempSiteRoot();
  const dataRoot = path.join(tempRoot, "data");

  writeJson(path.join(dataRoot, "shows.json"), [createShowRecord({ reviewStatus: "planned" })]);
  writeJson(path.join(dataRoot, "collections.json"), []);
  writeJson(path.join(dataRoot, "reviews", "demo-show.json"), {
    archiveTake: "Companion archive take.",
    spoilerFreeReview: ["Paragraph one.", "Paragraph two."],
    thoughts: ["Archive reaction."],
    quote: {
      text: "",
      attribution: "",
    },
  });

  const result = await runScript("review-publish.js", ["demo-show"], tempRoot);

  assert.equal(result.code, 0, result.stderr);

  const shows = JSON.parse(fs.readFileSync(path.join(dataRoot, "shows.json"), "utf8"));
  assert.equal(shows[0].reviewStatus, "full-review");
  assert.match(shows[0].updatedAt, /^\d{4}-\d{2}-\d{2}$/);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("review:report flags review, link, and length gaps for published shows", async () => {
  const tempRoot = createTempSiteRoot();
  const dataRoot = path.join(tempRoot, "data");

  writeJson(path.join(dataRoot, "shows.json"), [createShowRecord()]);
  writeJson(path.join(dataRoot, "collections.json"), []);

  const result = await runScript("review-report.js", [], tempRoot);

  assert.equal(result.code, 0, result.stderr);

  const [header, row] = result.stdout.trim().split("\n");
  assert.equal(
    header,
    "id\ttitle\treviewStatus\thasReviewFile\thasArchiveTake\thasSpoilerFreeReview\thasAnyListenLink\thasDetailedLength\tupdatedAt",
  );
  assert.equal(row, "demo-show\tDemo Show\tindexed-only\tno\tyes\tno\tno\tno\t2026-06-02");

  fs.rmSync(tempRoot, { recursive: true, force: true });
});
