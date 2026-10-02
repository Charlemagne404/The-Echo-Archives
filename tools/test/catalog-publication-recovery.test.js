const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { writeCatalogSource, readCatalogSource } = require('../lib/catalog-source');
const { recoverCatalogPublication, completeCatalogPublicationRecovery } = require('../lib/catalog-publication-transaction');
const sourceModule = require.resolve('../lib/catalog-source');
const journalModule = require.resolve('../lib/catalog-publication-transaction');
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-publication-crash-'));
  writeCatalogSource(root, { mode: 'split', shows: [{ id: 'one', title: 'Original one' }, { id: 'two', title: 'Original two' }], collections: [], reviewsById: {} });
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data/shows.json'), 'original generated data');
  return root;
}
function crash(root, script) {
  const result = spawnSync(process.execPath, ['-e', script], { env: { ...process.env, CRASH_ROOT: root }, timeout: 10000 });
  assert.equal(result.signal, 'SIGKILL', result.stderr.toString());
}
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
    assert.equal(fs.existsSync(path.join(root, '.echo-catalog-transaction')), false);
  } finally { fs.copyFileSync = copy; fs.rmSync(root, { recursive: true, force: true }); }
});
