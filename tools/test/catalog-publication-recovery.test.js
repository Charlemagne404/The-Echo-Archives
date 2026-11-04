const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { writeCatalogSource, writeShowRecordsAtomically, writeCollectionRecordsAtomically, writeJsonFileAtomic, readCatalogSource } = require('../lib/catalog-source');
const {
  beginCatalogRuntimeSnapshot,
  beginCatalogPublication,
  recoverCatalogPublication,
  completeCatalogPublicationRecovery,
  ownsCatalogPublication,
  assertCatalogPublicationReadable,
  runWithCatalogPublication,
} = require('../lib/catalog-publication-transaction');
const sourceModule = require.resolve('../lib/catalog-source');
const journalModule = require.resolve('../lib/catalog-publication-transaction');
function journalPath(root) { return path.join(root, 'import-staging', '.echo-catalog-transaction'); }
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-publication-crash-'));
  writeCatalogSource(root, { mode: 'split', shows: [{ id: 'one', title: 'Original one' }, { id: 'two', title: 'Original two' }], collections: [], reviewsById: {} });
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data/shows.json'), 'original generated data');
  return root;
}
function overlayFixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-publication-overlay-'));
  const releaseId = '4819b8f832e3e851e0291f722ad2053445e017a2';
  const root = path.join(base, 'srv/echo-archives/runtime/production', releaseId);
  const releaseRoot = path.join(base, 'srv/echo-archives/releases', releaseId);
  fs.mkdirSync(root, { recursive: true });
  writeCatalogSource(root, { mode: 'split', shows: [{ id: 'one', title: 'Original one' }], collections: [], reviewsById: {} });
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  fs.mkdirSync(path.join(releaseRoot, 'data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data/shows.json'), 'original generated data');
  const linkedGeneratedFiles = ['entities.json', 'entity-graph.json', 'runtime-evidence.json'].map((name) => {
    const releaseFile = path.join(releaseRoot, 'data', name);
    const overlayFile = path.join(root, 'data', name);
    fs.writeFileSync(releaseFile, `original ${name}`);
    fs.symlinkSync(releaseFile, overlayFile);
    return { releaseFile, overlayFile, linkTarget: fs.readlinkSync(overlayFile) };
  });
  return { base, root, linkedGeneratedFiles };
}
function makeTreeReadOnly(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) makeTreeReadOnly(target);
    else if (!entry.isSymbolicLink()) fs.chmodSync(target, 0o444);
  }
  fs.chmodSync(directory, 0o555);
}
function makeTreeWritable(directory) {
  const stat = fs.lstatSync(directory);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    fs.chmodSync(directory, 0o755);
    for (const name of fs.readdirSync(directory)) makeTreeWritable(path.join(directory, name));
  } else fs.chmodSync(directory, 0o644);
}
function productionLayoutFixture() {
  const fixture = overlayFixture();
  const releaseId = path.basename(fixture.root);
  const releaseRoot = path.join(fixture.base, 'srv/echo-archives/releases', releaseId);
  const runtimeRoot = fixture.root;
  const currentRoot = path.join(fixture.base, 'srv/echo-archives/runtime/production/current');
  const currentRelease = path.join(fixture.base, 'srv/echo-archives/current');
  writeCatalogSource(runtimeRoot, {
    mode: 'split',
    shows: [{ id: 'one', title: 'Original one' }],
    collections: [{ id: 'existing-route', title: 'Existing route', description: 'A preserved editorial route.', showIds: ['one'], showReasons: { one: 'An existing editorial route.' } }],
    reviewsById: { one: { archiveTake: 'Existing editorial review.' } },
  });
  fs.writeFileSync(path.join(runtimeRoot, 'catalog-src/entities.json'), '[]\n');
  fs.chmodSync(path.join(runtimeRoot, 'catalog-src/entities.json'), 0o444);
  fs.chmodSync(path.join(runtimeRoot, 'catalog-src'), 0o555);
  for (const name of ['shows', 'collections', 'reviews']) fs.chmodSync(path.join(runtimeRoot, 'catalog-src', name), 0o770);
  fs.symlinkSync(releaseId, currentRoot);
  fs.symlinkSync(path.relative(path.dirname(currentRelease), releaseRoot), currentRelease);
  makeTreeReadOnly(releaseRoot);
  return { ...fixture, root: currentRoot, runtimeRoot, releaseRoot, currentRelease };
}
function disposeProductionLayoutFixture(fixture) {
  makeTreeWritable(fixture.base);
  fs.rmSync(fixture.base, { recursive: true, force: true });
}
function crash(root, script) {
  const result = spawnSync(process.execPath, ['-e', script], { env: { ...process.env, CRASH_ROOT: root }, timeout: 10000 });
  assert.equal(result.signal, 'SIGKILL', result.stderr.toString());
}
test('old production write allowlist reproduces EROFS when collection refresh tries to update its source', () => {
  const fixture = productionLayoutFixture();
  const collectionDirectory = path.join(fixture.root, 'catalog-src/collections');
  const originalCollectionMode = fs.statSync(collectionDirectory).mode & 0o777;
  fs.chmodSync(collectionDirectory, 0o550);
  fs.readdirSync(collectionDirectory).forEach((name) => fs.chmodSync(path.join(collectionDirectory, name), 0o440));
  try {
    const before = readCatalogSource(fixture.root);
    const publication = writeShowRecordsAtomically(fixture.root, [{ id: 'one', title: 'Published show update' }], {
      deferCommit: true,
      recoveryData: { schema: 1, candidates: [], identities: [] },
    });
    const write = fs.writeFileSync;
    let publicationError;
    fs.writeFileSync = (target, ...args) => {
      if (String(target).startsWith(`${collectionDirectory}${path.sep}`) && String(target).includes('.import-')) {
        const error = new Error(`EROFS: read-only file system, open '${target}'`);
        error.code = 'EROFS';
        error.syscall = 'open';
        error.path = target;
        throw error;
      }
      return write(target, ...args);
    };
    try {
      assert.throws(() => runWithCatalogPublication(publication.publicationToken, () => {
        writeCollectionRecordsAtomically(fixture.root, [{
          ...before.collections[0],
          description: 'Collection membership refreshed after show publication.',
        }], { joinExisting: true });
      }), (error) => {
        publicationError = error;
        return error.code === 'EROFS' && /catalog-src\/collections\/existing-route\.json\.import-/.test(error.message);
      });
    } finally { fs.writeFileSync = write; }

    assert.equal(publicationError.code, 'EROFS');
    assert.match(publicationError.message, /read-only file system/);
    publication.rollback();
    completeCatalogPublicationRecovery(fixture.root);
    assert.deepEqual(readCatalogSource(fixture.root), before);
  } finally {
    fs.chmodSync(collectionDirectory, originalCollectionMode);
    disposeProductionLayoutFixture(fixture);
  }
});
test('old broad recovery journal reproduces EROFS on immutable collections and recovers without rewriting unchanged files', () => {
  const fixture = productionLayoutFixture();
  const collectionDirectory = path.join(fixture.root, 'catalog-src/collections');
  const collectionOrder = path.join(collectionDirectory, '_order.json');
  const readOnlyMode = fs.statSync(collectionDirectory).mode & 0o777;
  fs.chmodSync(collectionDirectory, 0o550);
  fs.readdirSync(collectionDirectory).forEach((name) => fs.chmodSync(path.join(collectionDirectory, name), 0o440));
  try {
    const before = readCatalogSource(fixture.root);
    const generatedPath = path.join(fixture.root, 'data/shows.json');
    const generatedBefore = fs.readFileSync(generatedPath);
    crash(fixture.root, `const fs=require('node:fs');const root=process.env.CRASH_ROOT;const journal=require(${JSON.stringify(journalModule)});journal.beginCatalogPublication(root,[root+'/data/shows.json'],{includeGenerated:true,includeSource:true,recoveryData:{schema:1,candidates:[],identities:[]}});fs.writeFileSync(root+'/catalog-src/shows/one.json',JSON.stringify({id:'one',title:'Interrupted change'}));fs.writeFileSync(root+'/data/shows.json','partial generated data');process.kill(process.pid,'SIGKILL');`);

    const manifest = JSON.parse(fs.readFileSync(path.join(journalPath(fixture.root), 'manifest.json'), 'utf8'));
    const collectionEntry = manifest.files.find((file) => file.relative === 'catalog-src/collections/_order.json');
    assert.ok(collectionEntry, 'the previous release journal included the immutable collection order file');
    const backupPath = path.join(journalPath(fixture.root), collectionEntry.backup);
    const copy = fs.copyFileSync;
    let blockedRecoveryCopies = 0;
    fs.copyFileSync = (source, destination, ...args) => {
      if (path.resolve(destination).startsWith(`${collectionDirectory}${path.sep}`) && String(destination).includes('.recover-')) {
        blockedRecoveryCopies += 1;
        const error = new Error(`EROFS: read-only file system, copyfile '${source}' -> '${destination}'`);
        error.code = 'EROFS';
        error.syscall = 'copyfile';
        error.path = source;
        error.dest = destination;
        throw error;
      }
      return copy(source, destination, ...args);
    };
    try {
      assert.throws(
        () => fs.copyFileSync(backupPath, `${collectionOrder}.recover-reproduction`),
        /EROFS: read-only file system, copyfile .*catalog-src\/collections\/_order\.json\.recover-reproduction/,
      );
      blockedRecoveryCopies = 0;
      const recovered = recoverCatalogPublication(fixture.root);
      assert.equal(recovered.pendingDatabaseRecovery.schema, 1);
      assert.equal(blockedRecoveryCopies, 0, 'unchanged immutable source files are not copied during recovery');
    } finally { fs.copyFileSync = copy; }

    assert.deepEqual(readCatalogSource(fixture.root), before);
    assert.deepEqual(fs.readFileSync(generatedPath), generatedBefore);
    completeCatalogPublicationRecovery(fixture.root);
    assert.equal(recoverCatalogPublication(fixture.root), false);
    assert.equal(fs.statSync(collectionDirectory).mode & 0o777, 0o550);
  } finally {
    fs.chmodSync(collectionDirectory, readOnlyMode);
    disposeProductionLayoutFixture(fixture);
  }
});

test('recovery carried across deployment restores mutable records and keeps new release symlinks', () => {
  const fixture = productionLayoutFixture();
  const before = readCatalogSource(fixture.root);
  const oldGenerated = fs.readFileSync(path.join(fixture.root, 'data/shows.json'));
  const newReleaseId = 'abcdefabcdefabcdefabcdefabcdefabcdefabcd';
  const newReleaseRoot = path.join(fixture.base, 'srv/echo-archives/releases', newReleaseId);
  const newRuntimeRoot = path.join(fixture.base, 'srv/echo-archives/runtime/production', newReleaseId);
  try {
    crash(fixture.root, `const fs=require('node:fs');const root=process.env.CRASH_ROOT;const journal=require(${JSON.stringify(journalModule)});journal.beginCatalogPublication(root,[root+'/data/shows.json'],{includeGenerated:true,includeSource:true,recoveryData:{schema:1,candidates:[],identities:[]}});fs.writeFileSync(root+'/catalog-src/shows/one.json',JSON.stringify({id:'one',title:'Interrupted change'}));fs.writeFileSync(root+'/data/shows.json','partial generated data');process.kill(process.pid,'SIGKILL');`);

    fs.cpSync(fixture.releaseRoot, newReleaseRoot, { recursive: true });
    fs.cpSync(fixture.runtimeRoot, newRuntimeRoot, { recursive: true });
    for (const name of ['entities.json', 'entity-graph.json', 'runtime-evidence.json']) {
      const runtimeFile = path.join(newRuntimeRoot, 'data', name);
      fs.rmSync(runtimeFile);
      fs.symlinkSync(path.join(newReleaseRoot, 'data', name), runtimeFile);
    }
    makeTreeReadOnly(newReleaseRoot);
    fs.unlinkSync(fixture.root);
    fs.symlinkSync(newReleaseId, fixture.root);
    fs.unlinkSync(fixture.currentRelease);
    fs.symlinkSync(path.relative(path.dirname(fixture.currentRelease), newReleaseRoot), fixture.currentRelease);

    const recovered = recoverCatalogPublication(fixture.root);
    assert.equal(recovered.pendingDatabaseRecovery.schema, 1);
    assert.deepEqual(readCatalogSource(fixture.root), before);
    assert.deepEqual(fs.readFileSync(path.join(fixture.root, 'data/shows.json')), oldGenerated);
    assert.equal(fs.lstatSync(path.join(fixture.root, 'data/entities.json')).isSymbolicLink(), true);
    assert.equal(fs.readlinkSync(path.join(fixture.root, 'data/entities.json')), path.join(newReleaseRoot, 'data/entities.json'));
    assert.equal(fs.readFileSync(path.join(newReleaseRoot, 'data/entities.json'), 'utf8'), fs.readFileSync(path.join(fixture.releaseRoot, 'data/entities.json'), 'utf8'));
    completeCatalogPublicationRecovery(fixture.root);
    assert.equal(recoverCatalogPublication(fixture.root), false);
  } finally { disposeProductionLayoutFixture(fixture); }
});

test('production runtime overlay commits and rolls back multi-show, collection, and generated writes', async () => {
  const fixture = productionLayoutFixture();
  try {
    const before = readCatalogSource(fixture.root);
    const added = Array.from({ length: 8 }, (_value, index) => ({ id: `new-show-${index + 1}`, title: `New show ${index + 1}` }));
    const batch = [...added, { id: 'one', title: 'Updated one' }];
    const updatedCollection = {
      ...before.collections[0],
      showIds: ['one', added[0].id],
      showReasons: { one: 'Existing editorial route.', [added[0].id]: 'A newly published story.' },
    };
    const generatedShows = path.join(fixture.root, 'data/shows.json');
    const generatedCollections = path.join(fixture.root, 'data/collections.json');
    const publication = writeShowRecordsAtomically(fixture.root, batch, {
      deferCommit: true,
      recoveryData: { schema: 1, candidates: [], identities: [] },
    });
    await runWithCatalogPublication(publication.publicationToken, async () => {
      writeCollectionRecordsAtomically(fixture.root, [updatedCollection], { joinExisting: true });
      const next = readCatalogSource(fixture.root);
      writeJsonFileAtomic(generatedShows, next.shows);
      writeJsonFileAtomic(generatedCollections, next.collections);
      writeJsonFileAtomic(path.join(fixture.root, 'data/search-index.json'), next.shows.map(({ id, title }) => ({ id, title })));
    });
    publication.commit();

    const committed = readCatalogSource(fixture.root);
    assert.equal(committed.shows.length, 9);
    assert.equal(committed.shows.find((show) => show.id === 'one').title, 'Updated one');
    assert.ok(added.every((show) => committed.shows.some((entry) => entry.id === show.id)));
    assert.deepEqual(committed.collections[0].showIds, ['one', added[0].id]);
    assert.deepEqual(JSON.parse(fs.readFileSync(generatedShows, 'utf8')).map((show) => show.id).sort(), ['one', ...added.map((show) => show.id)].sort());
    assert.equal(JSON.parse(fs.readFileSync(generatedCollections, 'utf8'))[0].showIds[1], added[0].id);
    assert.equal(fs.readFileSync(path.join(fixture.releaseRoot, 'data/entities.json'), 'utf8'), 'original entities.json');

    const committedSource = readCatalogSource(fixture.root);
    const committedGenerated = fs.readFileSync(generatedShows);
    const interrupted = writeShowRecordsAtomically(fixture.root, [{ id: 'one', title: 'Interrupted update' }], {
      deferCommit: true,
      recoveryData: { schema: 1, candidates: [], identities: [] },
    });
    await runWithCatalogPublication(interrupted.publicationToken, async () => {
      writeCollectionRecordsAtomically(fixture.root, [{ ...updatedCollection, description: 'Interrupted route change.' }], { joinExisting: true });
      writeJsonFileAtomic(generatedShows, 'partial generated data');
    });
    interrupted.rollback();
    completeCatalogPublicationRecovery(fixture.root);
    assert.deepEqual(readCatalogSource(fixture.root), committedSource);
    assert.deepEqual(fs.readFileSync(generatedShows), committedGenerated);
    assert.equal(fs.readFileSync(path.join(fixture.releaseRoot, 'data/entities.json'), 'utf8'), 'original entities.json');
  } finally { disposeProductionLayoutFixture(fixture); }
});
test('read-only publication checks leave a missing import-staging directory absent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-publication-read-only-'));
  const stagingRoot = path.join(root, 'import-staging');
  try {
    assert.equal(fs.existsSync(stagingRoot), false);
    assert.equal(ownsCatalogPublication(root), false);
    assert.doesNotThrow(() => assertCatalogPublicationReadable(root));
    assert.equal(recoverCatalogPublication(root), false);
    completeCatalogPublicationRecovery(root);
    assert.equal(fs.existsSync(stagingRoot), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('SIGKILL between source replacements is detected by pure reads and recovered completely', () => {
  const root = fixture();
  try {
    const before = readCatalogSource(root);
    crash(root, `const fs=require('node:fs');const rename=fs.renameSync;fs.renameSync=(a,b)=>{rename(a,b);if(b.endsWith('/shows/one.json'))process.kill(process.pid,'SIGKILL')};require(${JSON.stringify(sourceModule)}).writeShowRecordsAtomically(process.env.CRASH_ROOT,[{id:'one',title:'Changed'},{id:'two',title:'Changed'}]);`);
    assert.match(fs.readFileSync(path.join(root, 'catalog-src/shows/one.json'), 'utf8'), /Changed/);
    assert.throws(() => readCatalogSource(root), { statusCode: 503 });
    assert.equal(recoverCatalogPublication(root), true);
    assert.deepEqual(readCatalogSource(root), before);
    assert.equal(recoverCatalogPublication(root), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('deferred publication restores generated data and retains database recovery metadata', () => {
  const root = fixture();
  try {
    const before = readCatalogSource(root);
    crash(root, `const fs=require('node:fs');const root=process.env.CRASH_ROOT;require(${JSON.stringify(sourceModule)}).writeShowRecordsAtomically(root,[{id:'one',title:'Changed'}],{deferCommit:true,recoveryData:{schema:1,candidates:[],identities:[]}});fs.writeFileSync(root+'/data/shows.json','partial generated data');process.kill(process.pid,'SIGKILL');`);
    const recovered = recoverCatalogPublication(root);
    assert.equal(recovered.pendingDatabaseRecovery.schema, 1);
    assert.deepEqual(readCatalogSource(root), before);
    assert.equal(fs.readFileSync(path.join(root, 'data/shows.json'), 'utf8'), 'original generated data');
    completeCatalogPublicationRecovery(root);
    assert.equal(recoverCatalogPublication(root), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('publication rollback restores trusted release-backed generated symlinks after atomic writes', () => {
  const { base, root, linkedGeneratedFiles } = overlayFixture();
  try {
    const publication = writeShowRecordsAtomically(root, [{ id: 'one', title: 'Changed one' }], {
      deferCommit: true,
      recoveryData: { schema: 1, candidates: [], identities: [] },
    });
    for (const [index, file] of linkedGeneratedFiles.entries()) {
      const temporary = `${file.overlayFile}.import-${index}`;
      fs.writeFileSync(temporary, `new generated ${index}`);
      fs.renameSync(temporary, file.overlayFile);
      assert.equal(fs.lstatSync(file.overlayFile).isFile(), true);
      assert.equal(fs.readFileSync(file.releaseFile, 'utf8'), `original ${path.basename(file.releaseFile)}`);
    }

    publication.rollback();
    completeCatalogPublicationRecovery(root);
    assert.equal(readCatalogSource(root).shows[0].title, 'Original one');
    for (const file of linkedGeneratedFiles) {
      assert.equal(fs.lstatSync(file.overlayFile).isSymbolicLink(), true);
      assert.equal(fs.readlinkSync(file.overlayFile), file.linkTarget);
      assert.equal(fs.readFileSync(file.overlayFile, 'utf8'), `original ${path.basename(file.releaseFile)}`);
      assert.equal(fs.readFileSync(file.releaseFile, 'utf8'), `original ${path.basename(file.releaseFile)}`);
    }
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('interrupted publication recovers generated symlinks to their matching immutable release files', () => {
  const { base, root, linkedGeneratedFiles } = overlayFixture();
  try {
    const files = linkedGeneratedFiles.map((file) => file.overlayFile);
    crash(root, `const fs=require('node:fs');const root=process.env.CRASH_ROOT;const publication=require(${JSON.stringify(sourceModule)}).writeShowRecordsAtomically(root,[{id:'one',title:'Interrupted update'}],{deferCommit:true,recoveryData:{schema:1,candidates:[],identities:[]}});for(const [index,file] of ${JSON.stringify(files)}.entries()){const temporary=file+'.import-'+index;fs.writeFileSync(temporary,'interrupted generated '+index);fs.renameSync(temporary,file)}process.kill(process.pid,'SIGKILL');`);
    const recovery = recoverCatalogPublication(root);
    assert.equal(recovery.pendingDatabaseRecovery.schema, 1);
    assert.equal(readCatalogSource(root).shows[0].title, 'Original one');
    for (const file of linkedGeneratedFiles) {
      assert.equal(fs.lstatSync(file.overlayFile).isSymbolicLink(), true);
      assert.equal(fs.readlinkSync(file.overlayFile), file.linkTarget);
      assert.equal(fs.readFileSync(file.releaseFile, 'utf8'), `original ${path.basename(file.releaseFile)}`);
    }
    completeCatalogPublicationRecovery(root);
    assert.equal(recoverCatalogPublication(root), false);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('publication still rejects symlinks outside the matching immutable release', () => {
  const root = fixture();
  const externalDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-publication-external-'));
  const external = path.join(externalDirectory, 'target.json');
  const linked = path.join(root, 'data/entities.json');
  try {
    fs.writeFileSync(external, 'external target');
    fs.symlinkSync(external, linked);
    assert.throws(() => writeShowRecordsAtomically(root, [{ id: 'one', title: 'Must not publish' }], {
      deferCommit: true,
      recoveryData: { schema: 1, candidates: [], identities: [] },
    }), /Publication recovery requires a regular target/);
    assert.equal(fs.readFileSync(external, 'utf8'), 'external target');
    assert.equal(fs.lstatSync(linked).isSymbolicLink(), true);
    assert.equal(fs.existsSync(journalPath(root)), false);
    assert.equal(readCatalogSource(root).shows[0].title, 'Original one');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(externalDirectory, { recursive: true, force: true });
  }
});

test('a committed publication survives process death without reverting valid data', () => {
  const root = fixture();
  try {
    crash(root, `require(${JSON.stringify(sourceModule)}).writeShowRecordsAtomically(process.env.CRASH_ROOT,[{id:'one',title:'Committed'}]);process.kill(process.pid,'SIGKILL');`);
    assert.equal(recoverCatalogPublication(root), false);
    assert.equal(readCatalogSource(root).shows[0].title, 'Committed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('another live publisher cannot be recovered or overwritten', () => {
  const root = fixture();
  try {
    const transaction = require(journalModule).beginCatalogPublication(root, [path.join(root, 'data/shows.json')]);
    const result = spawnSync(process.execPath, ['-e', `try{require(${JSON.stringify(journalModule)}).recoverCatalogPublication(process.env.CRASH_ROOT);process.exit(1)}catch(error){process.exit(error.statusCode===503?0:2)}`], { env: { ...process.env, CRASH_ROOT: root } });
    assert.equal(result.status, 0);
    transaction.rollback();
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('runtime snapshots serialize with catalogue writes through the publication journal', () => {
  const root = fixture();
  try {
    const snapshot = beginCatalogRuntimeSnapshot(root);
    const journalPath = path.join(root, '.echo-catalog-transaction');
    assert.equal(fs.statSync(journalPath).mode & 0o777, 0o755);
    assert.equal(fs.statSync(path.join(journalPath, 'manifest.json')).mode & 0o777, 0o644);
    assert.throws(
      () => require('../lib/catalog-source').writeShowRecordsAtomically(root, [{ id: 'one', title: 'Must wait' }]),
      { statusCode: 503 },
    );
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'catalog-src/shows/one.json'), 'utf8')).title, 'Original one');

    snapshot.release();
    require('../lib/catalog-source').writeShowRecordsAtomically(root, [{ id: 'one', title: 'After snapshot' }]);
    assert.equal(readCatalogSource(root).shows[0].title, 'After snapshot');
    assert.equal(fs.existsSync(journalPath), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('recovery retires an abandoned runtime snapshot without restoring catalogue files', () => {
  const root = fixture();
  const journalPath = path.join(root, '.echo-catalog-transaction');
  const sourcePath = path.join(root, 'catalog-src/shows/one.json');
  const before = fs.readFileSync(sourcePath);
  try {
    fs.mkdirSync(journalPath, { mode: 0o755 });
    fs.writeFileSync(path.join(journalPath, 'manifest.json'), JSON.stringify({
      schema: 1,
      kind: 'runtime-snapshot',
      pid: 2147483647,
      instance: 'abandoned-runtime-snapshot',
      phase: 'prepared',
      files: [],
      absentDirectories: [],
    }));
    assert.equal(recoverCatalogPublication(root), false);
    assert.equal(fs.existsSync(journalPath), false);
    assert.deepEqual(fs.readFileSync(sourcePath), before);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('recovery rejects snapshot journals carrying catalogue rollback data', () => {
  const root = fixture();
  const journalPath = path.join(root, '.echo-catalog-transaction');
  const sourcePath = path.join(root, 'catalog-src/shows/one.json');
  const before = fs.readFileSync(sourcePath);
  try {
    fs.mkdirSync(journalPath, { mode: 0o755 });
    fs.writeFileSync(path.join(journalPath, 'manifest.json'), JSON.stringify({
      schema: 1,
      kind: 'runtime-snapshot',
      pid: 2147483647,
      instance: 'invalid-runtime-snapshot',
      phase: 'prepared',
      files: [{ relative: 'catalog-src/shows/one.json', backup: '0.bin', existed: true, mode: 0o640 }],
      absentDirectories: [],
    }));
    assert.throws(() => recoverCatalogPublication(root), /Malformed runtime snapshot journal/);
    assert.equal(fs.existsSync(journalPath), true);
    assert.deepEqual(fs.readFileSync(sourcePath), before);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('SIGKILL after SQLite bookkeeping restores candidate state with source files', () => {
  const root = fixture();
  const databaseModule = require.resolve('../../backend/lib/store/database');
  const storeModule = require.resolve('../../backend/lib/store/import-store');
  const dbPath = path.join(root, 'imports.sqlite');
  try {
    crash(root, `const db=require(${JSON.stringify(databaseModule)}).openDatabase(${JSON.stringify(dbPath)});const store=require(${JSON.stringify(storeModule)}).createImportStore({db});const candidate=store.createCandidate({id:'candidate',status:'ready',preparedRecord:{id:'one',title:'Changed'}});const snapshot=store.publicationSnapshot([candidate]);require(${JSON.stringify(sourceModule)}).writeShowRecordsAtomically(process.env.CRASH_ROOT,[candidate.preparedRecord],{deferCommit:true,recoveryData:snapshot});store.withTransaction(()=>store.updateCandidate(candidate.id,{status:'published',publishedShowId:'one'}));process.kill(process.pid,'SIGKILL');`);
    const recovery = recoverCatalogPublication(root);
    const db = require(databaseModule).openDatabase(dbPath);
    try {
      const store = require(storeModule).createImportStore({ db });
      assert.equal(store.getCandidate('candidate').status, 'published');
      store.restorePublicationSnapshot(recovery.pendingDatabaseRecovery);
      completeCatalogPublicationRecovery(root);
      assert.equal(store.getCandidate('candidate').status, 'ready');
      assert.equal(store.getCandidate('candidate').publishedShowId, '');
      assert.equal(readCatalogSource(root).shows[0].title, 'Original one');
    } finally { db.close(); }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('interrupted rollback keeps backups and can be retried before a new publication', () => {
  const root = fixture();
  const target = path.join(root, 'data/shows.json');
  const rename = fs.renameSync;
  try {
    const transaction = require(journalModule).beginCatalogPublication(root, [target]);
    fs.writeFileSync(target, 'changed');
    fs.renameSync = (from, to) => {
      if (to === target) { const error = new Error('Simulated unavailable destination'); error.code = 'EROFS'; throw error; }
      return rename(from, to);
    };
    assert.throws(() => transaction.rollback(), { code: 'EROFS' });
    assert.throws(() => readCatalogSource(root), { statusCode: 503 });
    fs.renameSync = rename;
    assert.equal(recoverCatalogPublication(root), true);
    assert.equal(fs.readFileSync(target, 'utf8'), 'original generated data');
    const next = require(journalModule).beginCatalogPublication(root, [target]);
    fs.writeFileSync(target, 'new valid data');
    next.commit();
    assert.equal(fs.readFileSync(target, 'utf8'), 'new valid data');
  } finally { fs.renameSync = rename; fs.rmSync(root, { recursive: true, force: true }); }
});

test('backup failure leaves healthy files unchanged and releases the journal', () => {
  const root = fixture();
  const copy = fs.copyFileSync;
  try {
    const before = readCatalogSource(root);
    fs.copyFileSync = () => { const error = new Error('Simulated full backup disk'); error.code = 'ENOSPC'; throw error; };
    assert.throws(() => require(journalModule).beginCatalogPublication(root, [path.join(root, 'data/shows.json')]), { code: 'ENOSPC' });
    assert.deepEqual(readCatalogSource(root), before);
    assert.equal(fs.existsSync(journalPath(root)), false);
  } finally { fs.copyFileSync = copy; fs.rmSync(root, { recursive: true, force: true }); }
});

test('publication journals are created under import-staging, not the runtime root', () => {
  const root = fixture();
  const legacyPath = path.join(root, '.echo-catalog-transaction');
  const mkdir = fs.mkdirSync;
  try {
    fs.mkdirSync = (directory, ...args) => {
      if (path.resolve(directory) === legacyPath) {
        const error = new Error('runtime root is read-only');
        error.code = 'EROFS';
        throw error;
      }
      return mkdir(directory, ...args);
    };
    const transaction = require(journalModule).beginCatalogPublication(root, [path.join(root, 'data/shows.json')]);
    assert.equal(fs.existsSync(journalPath(root)), true);
    assert.equal(fs.existsSync(legacyPath), false);
    transaction.rollback();
  } finally {
    fs.mkdirSync = mkdir;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an outstanding runtime-root journal is migrated and recovered once from import-staging', () => {
  const root = fixture();
  const target = path.join(root, 'data/shows.json');
  const legacyPath = path.join(root, '.echo-catalog-transaction');
  const original = fs.readFileSync(target, 'utf8');
  const snapshotLegacy = () => fs.readdirSync(legacyPath).sort().map((name) => [name, fs.readFileSync(path.join(legacyPath, name))]);
  try {
    crash(root, `const fs=require('node:fs');const root=process.env.CRASH_ROOT;const journal=require(${JSON.stringify(journalModule)});journal.beginCatalogPublication(root,[root+'/data/shows.json'],{recoveryData:{schema:1,candidates:[],identities:[]}});fs.writeFileSync(root+'/data/shows.json','interrupted contents');fs.renameSync(root+'/import-staging/.echo-catalog-transaction',root+'/.echo-catalog-transaction');fs.rmdirSync(root+'/import-staging');process.kill(process.pid,'SIGKILL');`);
    assert.equal(fs.existsSync(legacyPath), true);
    assert.equal(fs.existsSync(path.join(root, 'import-staging')), false);
    const legacySnapshot = snapshotLegacy();
    assert.throws(() => readCatalogSource(root), { statusCode: 503 });
    assert.equal(fs.existsSync(path.join(root, 'import-staging')), false, 'read-only source validation does not migrate the legacy journal');
    assert.deepEqual(snapshotLegacy(), legacySnapshot);
    const recovery = recoverCatalogPublication(root);
    assert.equal(fs.existsSync(path.join(root, 'import-staging')), true, 'recovery creates staging to migrate the outstanding legacy journal');
    assert.deepEqual(recovery.pendingDatabaseRecovery, { schema: 1, candidates: [], identities: [] });
    assert.equal(fs.readFileSync(target, 'utf8'), original);
    assert.equal(fs.existsSync(legacyPath), true, 'the read-only legacy journal remains untouched');
    assert.deepEqual(snapshotLegacy(), legacySnapshot);
    completeCatalogPublicationRecovery(root);
    assert.equal(recoverCatalogPublication(root), false, 'the migrated journal marker prevents replaying the old journal');
    const next = require(journalModule).beginCatalogPublication(root, [target]);
    fs.writeFileSync(target, 'new publication');
    next.commit();
    assert.equal(fs.readFileSync(target, 'utf8'), 'new publication');
    assert.equal(fs.existsSync(legacyPath), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('SIGKILL after SQLite bookkeeping restores candidate state with source files', () => {
  const root = fixture();
  const databaseModule = require.resolve('../../backend/lib/store/database');
  const storeModule = require.resolve('../../backend/lib/store/import-store');
  const dbPath = path.join(root, 'imports.sqlite');
  try {
    crash(root, `const db=require(${JSON.stringify(databaseModule)}).openDatabase(${JSON.stringify(dbPath)});const store=require(${JSON.stringify(storeModule)}).createImportStore({db});const candidate=store.createCandidate({id:'candidate',status:'ready',preparedRecord:{id:'one',title:'Changed'}});const snapshot=store.publicationSnapshot([candidate]);require(${JSON.stringify(sourceModule)}).writeShowRecordsAtomically(process.env.CRASH_ROOT,[candidate.preparedRecord],{deferCommit:true,recoveryData:snapshot});store.withTransaction(()=>store.updateCandidate(candidate.id,{status:'published',publishedShowId:'one'}));process.kill(process.pid,'SIGKILL');`);
    const recovery = recoverCatalogPublication(root);
    const db = require(databaseModule).openDatabase(dbPath);
    try {
      const store = require(storeModule).createImportStore({ db });
      assert.equal(store.getCandidate('candidate').status, 'published');
      store.restorePublicationSnapshot(recovery.pendingDatabaseRecovery);
      completeCatalogPublicationRecovery(root);
      assert.equal(store.getCandidate('candidate').status, 'ready');
      assert.equal(store.getCandidate('candidate').publishedShowId, '');
      assert.equal(readCatalogSource(root).shows[0].title, 'Original one');
    } finally { db.close(); }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('interrupted rollback keeps backups and can be retried before a new publication', () => {
  const root = fixture();
  const target = path.join(root, 'data/shows.json');
  const rename = fs.renameSync;
  try {
    const transaction = require(journalModule).beginCatalogPublication(root, [target]);
    fs.writeFileSync(target, 'changed');
    fs.renameSync = (from, to) => {
      if (to === target) { const error = new Error('Simulated unavailable destination'); error.code = 'EROFS'; throw error; }
      return rename(from, to);
    };
    assert.throws(() => transaction.rollback(), { code: 'EROFS' });
    assert.throws(() => readCatalogSource(root), { statusCode: 503 });
    fs.renameSync = rename;
    assert.equal(recoverCatalogPublication(root), true);
    assert.equal(fs.readFileSync(target, 'utf8'), 'original generated data');
    const next = require(journalModule).beginCatalogPublication(root, [target]);
    fs.writeFileSync(target, 'new valid data');
    next.commit();
    assert.equal(fs.readFileSync(target, 'utf8'), 'new valid data');
  } finally { fs.renameSync = rename; fs.rmSync(root, { recursive: true, force: true }); }
});

test('backup failure leaves healthy files unchanged and releases the journal', () => {
  const root = fixture();
  const copy = fs.copyFileSync;
  try {
    const before = readCatalogSource(root);
    fs.copyFileSync = () => { const error = new Error('Simulated full backup disk'); error.code = 'ENOSPC'; throw error; };
    assert.throws(() => require(journalModule).beginCatalogPublication(root, [path.join(root, 'data/shows.json')]), { code: 'ENOSPC' });
    assert.deepEqual(readCatalogSource(root), before);
    assert.equal(fs.existsSync(journalPath(root)), false);
  } finally { fs.copyFileSync = copy; fs.rmSync(root, { recursive: true, force: true }); }
});
