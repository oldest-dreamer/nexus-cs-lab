import type { Module } from '../../types';

const raw = String.raw;

export const persistenceModule: Module = {
  id: 'app-persistence',
  title: 'On-Device Persistence & Embedded Databases',
  level: 'Intermediate',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'app-kv-vs-sqlite',
      title: 'Key-Value Storage (MMKV/SharedPreferences) vs Embedded SQLite (WAL, Indexes)',
      summary: 'Pick the right on-device store: tiny synchronous key-value storage for settings and flags, SQLite for real data you query, with WAL mode, indexes and batched transactions.',
      difficulty: 'Intermediate',
      minutes: 22,
      xp: 120,
      analogy:
        "Key-value storage is the sticky notes on your fridge: perfect for a few short facts you check constantly (theme, last tab, a feature flag). SQLite is a filing cabinet with an index: you would never write 50,000 messages on sticky notes and read every note to find the ones from Alex. WAL mode is a second inbox tray: new paperwork is dropped there so people can keep reading the cabinet while you file.",
      intuition: [
        { title: 'Key-value stores', body: "MMKV (memory-mapped, synchronous, very fast), SharedPreferences/DataStore (Android), UserDefaults (iOS) and AsyncStorage store small values by key. Great for settings, flags, tokens' metadata and small snapshots. They load or rewrite whole values, so big growing collections in one key get slower with every write." },
        { title: 'SQLite is a real database', body: "A single file with tables, indexes, transactions, constraints and SQL queries. It handles hundreds of thousands of rows on a phone, supports pagination, search (FTS5) and joins, and is what most offline-first apps use (directly, or via WatermelonDB, Drizzle, Room, Core Data)." },
        { title: 'WAL mode', body: "In the default rollback-journal mode, a writer cannot commit while a reader holds a read transaction (\"database is locked\"). With `PRAGMA journal_mode = WAL`, writes append to a write-ahead log, readers keep a consistent snapshot, and readers and the writer no longer block each other. Use WAL plus `synchronous = NORMAL` for apps." },
        { title: 'Indexes decide speed', body: "`EXPLAIN QUERY PLAN` shows `SCAN messages` (reads every row) or `SEARCH messages USING INDEX …` (jumps straight to matches). Index the columns you filter and sort by, e.g. `(conversation_id, created_at)` for a chat screen." },
        { title: 'Batch writes in transactions', body: "Each statement outside a transaction is its own transaction with its own disk sync. Inserting 5,000 synced messages one by one can take seconds; inside one transaction it takes milliseconds. Use prepared statements for repeated inserts." },
        { title: 'Keep the UI thread free', body: "Run database work off the UI thread (async APIs or a native/JSI driver), page results with LIMIT and cursors, and only load the columns a screen shows." },
      ],
      callouts: [
        { kind: 'architecture', title: 'What goes where', body: 'Choose by data shape and access pattern, not habit.', flow: ['settings, flags, last tab → MMKV / DataStore', 'secrets → Keychain / Keystore (Module 7)', 'collections you query → SQLite (WAL, indexes)', 'large files / media → file system + cache index', 'server data cache → query cache persisted to MMKV/SQLite'] },
        { kind: 'tip', title: 'Inspect the real file', body: 'Pull the database from a debug build (Android: adb exec-out run-as <package> cat databases/app.db > app.db; iOS: the app container in Xcode) and open it in any SQLite browser to check schema, indexes and plans.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'sqlite_wal_and_indexes.ts',
          explanation: 'Runnable TypeScript on Node\'s built-in SQLite (the same SQL runs unchanged in expo-sqlite or op-sqlite on device): WAL vs rollback-journal behaviour with a concurrent reader proven on a real file, EXPLAIN QUERY PLAN before and after a composite index, a 5,000-row batched insert in one transaction, and cursor-style pagination. All asserted.',
          code: raw`//  ROLLBACK JOURNAL vs WAL (reader holds an open read transaction)
//
//   journal_mode=DELETE:  reader [BEGIN; SELECT ...]   writer COMMIT -> "database is locked"
//   journal_mode=WAL:     reader [BEGIN; SELECT ...]   writer COMMIT -> ok (appended to -wal file)
//                         reader keeps its snapshot (2 rows) until it ends its transaction
//   EXPLAIN QUERY PLAN:   SCAN messages  -->  SEARCH messages USING INDEX messages_conv_created
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function concurrentWrite(mode: 'wal' | 'delete') {
  const file = join(mkdtempSync(join(tmpdir(), 'app-db-')), 'app.db');
  const writer = new DatabaseSync(file, { timeout: 0 });
  const journal = (writer.prepare('PRAGMA journal_mode = ' + mode).get() as { journal_mode: string }).journal_mode;
  writer.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL); INSERT INTO notes (body) VALUES (\'a\'), (\'b\')');
  const reader = new DatabaseSync(file, { timeout: 0 });
  reader.exec('BEGIN');
  const seenBefore = (reader.prepare('SELECT count(*) AS n FROM notes').get() as { n: number }).n;
  let commit = 'ok';
  try { writer.exec('INSERT INTO notes (body) VALUES (\'c\')'); } catch (e) { commit = (e as Error).message; }
  const seenDuring = (reader.prepare('SELECT count(*) AS n FROM notes').get() as { n: number }).n;
  reader.exec('COMMIT');
  return { journal, seenBefore, commit, seenDuring };
}
assert.deepEqual(concurrentWrite('delete'), { journal: 'delete', seenBefore: 2, commit: 'database is locked', seenDuring: 2 });
assert.deepEqual(concurrentWrite('wal'), { journal: 'wal', seenBefore: 2, commit: 'ok', seenDuring: 2 });   // snapshot isolation

// indexes + batched inserts
const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE messages (id INTEGER PRIMARY KEY, conversation_id INTEGER NOT NULL, created_at INTEGER NOT NULL, body TEXT NOT NULL)');
const insert = db.prepare('INSERT INTO messages (conversation_id, created_at, body) VALUES (?, ?, ?)');
db.exec('BEGIN');                                               // one transaction for the whole batch
for (let i = 0; i < 5000; i++) insert.run(i % 50, 1_700_000_000 + i, 'message ' + i);
db.exec('COMMIT');
assert.equal((db.prepare('SELECT count(*) AS n FROM messages').get() as { n: number }).n, 5000);

const query = 'SELECT id, body FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 30';
const plan = () => (db.prepare('EXPLAIN QUERY PLAN ' + query).all(7) as Array<{ detail: string }>).map((r) => r.detail).join(' | ');
assert.match(plan(), /SCAN messages/);
assert.match(plan(), /TEMP B-TREE FOR ORDER BY/);              // sorts every time without an index
db.exec('CREATE INDEX messages_conv_created ON messages (conversation_id, created_at)');
assert.match(plan(), /SEARCH messages USING INDEX messages_conv_created \(conversation_id=\?\)/);
assert.doesNotMatch(plan(), /TEMP B-TREE/);                     // index already returns rows in order

// cursor pagination: next page = rows older than the last one shown
const page1 = db.prepare(query).all(7) as Array<{ id: number }>;
const last = db.prepare('SELECT created_at FROM messages WHERE id = ?').get(page1[29].id) as { created_at: number };
const page2 = db.prepare('SELECT id FROM messages WHERE conversation_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT 30').all(7, last.created_at) as Array<{ id: number }>;
assert.equal(page2.length, 30);
assert.ok(page2.every((r) => !page1.some((p) => p.id === r.id)));
console.log('plan with index:', plan());`,
        },
        production: {
          language: 'ts',
          filename: 'db.ts',
          explanation: 'Production expo-sqlite (async API): open once, set PRAGMAs (WAL, NORMAL sync, foreign keys), create tables and indexes, batch inserts inside a transaction with a prepared statement, and read pages with a cursor. Small settings live in MMKV instead.',
          code: raw`import * as SQLite from 'expo-sqlite';
import { MMKV } from 'react-native-mmkv';

export const settings = new MMKV({ id: 'settings' });          // tiny, synchronous: theme, last tab, flags

export type Message = { id: string; conversation_id: string; created_at: number; body: string; status: string };

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
export function getDb() {
  dbPromise ??= (async () => {
    const db = await SQLite.openDatabaseAsync('app.db');
    await db.execAsync([
      'PRAGMA journal_mode = WAL;',                            // readers and the writer don't block each other
      'PRAGMA synchronous = NORMAL;',                          // safe with WAL, far fewer fsyncs
      'PRAGMA foreign_keys = ON;',
      'CREATE TABLE IF NOT EXISTS messages (',
      '  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, created_at INTEGER NOT NULL,',
      "  body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'synced');",
      'CREATE INDEX IF NOT EXISTS messages_conv_created ON messages (conversation_id, created_at);',
    ].join('\n'));
    return db;
  })();
  return dbPromise;
}

// thousands of rows from a sync response: one transaction, one prepared statement
export async function upsertMessages(rows: Message[]) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const stmt = await db.prepareAsync(
      'INSERT INTO messages (id, conversation_id, created_at, body, status) VALUES ($id, $conv, $at, $body, $status) ' +
      'ON CONFLICT(id) DO UPDATE SET body = excluded.body, status = excluded.status');
    try {
      for (const m of rows) {
        await stmt.executeAsync({ $id: m.id, $conv: m.conversation_id, $at: m.created_at, $body: m.body, $status: m.status });
      }
    } finally {
      await stmt.finalizeAsync();
    }
  });
}

// a screen reads one page at a time, newest first, using the index
export async function messagesPage(conversationId: string, before = Number.MAX_SAFE_INTEGER, limit = 30) {
  const db = await getDb();
  return db.getAllAsync<Message>(
    'SELECT id, conversation_id, created_at, body, status FROM messages ' +
    'WHERE conversation_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?',
    [conversationId, before, limit]);
}`,
        },
        bug: {
          explanation:
            'Storing every message as one JSON array under a single AsyncStorage key means each new message reads, parses, re-serialises and rewrites the whole history: writes get slower as the chat grows, searching requires loading everything, and on Android the default AsyncStorage size limits are eventually hit. Store collections in SQLite rows with an index.',
          buggy: {
            language: 'ts',
            filename: 'messagesStore.ts',
            code: raw`// ❌ O(total messages) work for every single new message
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function addMessage(m: Message) {
  const all: Message[] = JSON.parse((await AsyncStorage.getItem('messages')) ?? '[]');   // load everything
  all.push(m);
  await AsyncStorage.setItem('messages', JSON.stringify(all));                         // rewrite everything
}
export async function messagesFor(conv: string) {
  const all: Message[] = JSON.parse((await AsyncStorage.getItem('messages')) ?? '[]');
  return all.filter((x) => x.conversation_id === conv);                                 // full scan in JS
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'messagesStore.ts',
            code: raw`// ✅ One row per message, an index for the screen's query, paging with LIMIT
export async function addMessage(m: Message) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO messages (id, conversation_id, created_at, body, status) VALUES (?, ?, ?, ?, ?)',
    [m.id, m.conversation_id, m.created_at, m.body, m.status]);
}
export const messagesFor = (conv: string, before?: number) => messagesPage(conv, before);   // indexed, paged`,
          },
        },
      },
      takeaways: [
        'Key-value storage for small values; SQLite for collections you query, sort, page or search.',
        'Enable WAL: readers keep a snapshot and the writer can still commit; without it commits fail while a read is open.',
        'Check EXPLAIN QUERY PLAN: SEARCH … USING INDEX, not SCAN + TEMP B-TREE.',
        'Batch writes in one transaction with prepared statements; page reads with LIMIT and a cursor.',
        'Practice drill: in Tab 1, add an index on (body) and check whether EXPLAIN QUERY PLAN can SEARCH it for WHERE body LIKE \'%parcel%\' (no: a leading wildcard means at best a full SCAN; use FTS5 for text search).',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'app-sqlite-migrations',
      title: 'Zero-Data-Loss SQLite Schema Migrations',
      summary: 'Evolve the on-device schema across app updates without ever losing user data: versioned, transactional migrations with PRAGMA user_version, and the table-rebuild procedure for changes ALTER TABLE cannot do.',
      difficulty: 'Intermediate',
      minutes: 22,
      xp: 130,
      analogy:
        "A migration is renovating a house while the family still lives in it. You don't knock the house down and rebuild it empty (dropping tables); you build the new room next to the old one, carry every box across, check nothing is missing, and only then remove the old room. And you keep a renovation log on the door (user_version) so the next builder knows which steps are already done.",
      intuition: [
        { title: 'Users skip versions', body: "A user may update from version 1.2 straight to 3.0. Migrations must therefore be an ordered list (v1→v2, v2→v3, …) applied one by one from whatever version is on the device, never \"just create the latest schema\"." },
        { title: 'Track the version in the database', body: "`PRAGMA user_version` is an integer stored in the database header. Read it at startup, run every migration with a higher number in order, and set it after each step." },
        { title: 'Each step is a transaction', body: "Wrap a migration and its version bump in one transaction. If anything fails (disk full, the app is killed mid-migration), SQLite rolls back to the previous consistent state and the migration simply runs again on next launch." },
        { title: 'What ALTER TABLE can do', body: "SQLite supports `ADD COLUMN` (with a default), `RENAME COLUMN`, `RENAME TO` and `DROP COLUMN` (with restrictions). Changing a column's type, adding constraints or reordering requires the 12-step rebuild: create the new table, copy the data, drop the old table, rename the new one, recreate indexes, check foreign keys." },
        { title: 'Never drop user data on upgrade', body: "\"DROP TABLE + CREATE TABLE\" is the fastest way to delete every offline draft and unsynced change a user has. Only cached server data that can be refetched may be discarded, and even then prefer migrating." },
        { title: 'Test migrations like code', body: "Keep a fixture database for every shipped version; in CI, open each fixture, run the migrations, and assert row counts and values. Back up or export critical data before risky migrations." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Migration runner at app start', body: 'Runs before any screen touches the database.', flow: ['open db', 'read PRAGMA user_version', 'for each migration > version: BEGIN', 'apply DDL + data copy', 'PRAGMA user_version = n; COMMIT', 'failure → ROLLBACK, report, retry next launch'] },
        { kind: 'warning', title: 'Unsynced data is irreplaceable', body: 'The outbox and local drafts exist only on this device. A migration bug that drops them is permanent data loss, not a cache miss.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'migrations_from_scratch.ts',
          explanation: 'Runnable TypeScript on Node\'s built-in SQLite: a migration runner driven by PRAGMA user_version that upgrades a populated v1 database through ADD COLUMN, a full table rebuild (TEXT timestamps → INTEGER with a NOT NULL constraint) and an index, preserving every row; a deliberately failing migration rolls back atomically; and the naive drop-and-recreate approach is shown losing data. All asserted.',
          code: raw`//  MIGRATING A REAL USER DATABASE (user_version 1 -> 3)
//
//   v1: notes(id, title, created TEXT)                 3 rows of user data
//   v2: + body TEXT NOT NULL DEFAULT ''                ALTER TABLE ADD COLUMN
//   v3: created TEXT -> created_at INTEGER NOT NULL    12-step rebuild: new table -> copy -> drop -> rename
//       BEGIN ... PRAGMA user_version = n ... COMMIT    (any error -> ROLLBACK, nothing half-applied)
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

type Migration = { version: number; up: (db: DatabaseSync) => void };
const MIGRATIONS: Migration[] = [
  { version: 2, up: (db) => db.exec("ALTER TABLE notes ADD COLUMN body TEXT NOT NULL DEFAULT ''") },
  { version: 3, up: (db) => db.exec([
      'CREATE TABLE notes_new (id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT \'\', created_at INTEGER NOT NULL);',
      "INSERT INTO notes_new (id, title, body, created_at) SELECT id, title, body, CAST(strftime('%s', created) AS INTEGER) FROM notes;",
      'DROP TABLE notes;',
      'ALTER TABLE notes_new RENAME TO notes;',
      'CREATE INDEX notes_created ON notes (created_at);',
    ].join('\n')) },
];

const version = (db: DatabaseSync) => (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
function migrate(db: DatabaseSync, migrations = MIGRATIONS) {
  for (const m of migrations.filter((x) => x.version > version(db)).sort((a, b) => a.version - b.version)) {
    db.exec('BEGIN');
    try {
      m.up(db);
      db.exec('PRAGMA user_version = ' + m.version);          // version bump is part of the same transaction
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');                                     // the database is exactly as before this step
      throw e;
    }
  }
}

function v1Database() {
  const db = new DatabaseSync(':memory:');
  db.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY, title TEXT NOT NULL, created TEXT NOT NULL); PRAGMA user_version = 1;");
  db.exec("INSERT INTO notes (title, created) VALUES ('Groceries', '2026-01-05 09:00:00'), ('Ideas', '2026-02-10 12:30:00'), ('Trip', '2026-03-01 08:15:00')");
  return db;
}

// happy path: v1 -> v3 with every row preserved and converted
const db = v1Database();
migrate(db);
assert.equal(version(db), 3);
const rows = db.prepare('SELECT title, body, created_at FROM notes ORDER BY id').all() as Array<{ title: string; body: string; created_at: number }>;
assert.deepEqual(rows.map((r) => r.title), ['Groceries', 'Ideas', 'Trip']);
assert.equal(rows[0].created_at, Date.UTC(2026, 0, 5, 9) / 1000);
assert.ok(rows.every((r) => r.body === ''));
assert.ok((db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'notes_created'").get()) !== undefined);
migrate(db);                                                    // idempotent: nothing left to run
assert.equal(version(db), 3);

// a broken migration (e.g. app killed / bad SQL) rolls back completely
const db2 = v1Database();
const broken: Migration[] = [MIGRATIONS[0], { version: 3, up: (d) => d.exec('CREATE TABLE notes_new (id INTEGER); INSERT INTO notes_new SELECT nonexistent FROM notes;') }];
assert.throws(() => migrate(db2, broken), /no such column/);
assert.equal(version(db2), 2);                                  // v2 committed, v3 not applied at all
assert.equal((db2.prepare('SELECT count(*) AS n FROM notes').get() as { n: number }).n, 3);
assert.equal(db2.prepare("SELECT name FROM sqlite_master WHERE name = 'notes_new'").get(), undefined);

// the naive approach: drop and recreate the latest schema
const db3 = v1Database();
db3.exec('DROP TABLE notes; CREATE TABLE notes (id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT \'\', created_at INTEGER NOT NULL)');
assert.equal((db3.prepare('SELECT count(*) AS n FROM notes').get() as { n: number }).n, 0);   // all user data gone
console.log('migrated rows:', rows.map((r) => r.title + '@' + r.created_at).join(', '));`,
        },
        production: {
          language: 'ts',
          filename: 'migrate.ts',
          explanation: 'Production migration runner for expo-sqlite: ordered migrations keyed by user_version, each applied in an exclusive transaction together with its version bump, foreign keys checked after table rebuilds, and failures reported without leaving a half-migrated database. Call it once before rendering any data screens.',
          code: raw`import type { SQLiteDatabase } from 'expo-sqlite';

type Migration = { version: number; name: string; sql: string };

// Append-only list. Never edit a migration that has shipped; add a new one.
const MIGRATIONS: Migration[] = [
  { version: 1, name: 'init', sql: [
    'CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT NOT NULL, created TEXT NOT NULL);',
    'CREATE TABLE outbox (id TEXT PRIMARY KEY, op TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL);',
  ].join('\n') },
  { version: 2, name: 'notes.body', sql: "ALTER TABLE notes ADD COLUMN body TEXT NOT NULL DEFAULT '';" },
  { version: 3, name: 'notes.created_at integer (rebuild)', sql: [
    "CREATE TABLE notes_new (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);",
    "INSERT INTO notes_new (id, title, body, created_at) SELECT id, title, body, CAST(strftime('%s', created) AS INTEGER) * 1000 FROM notes;",
    'DROP TABLE notes;',
    'ALTER TABLE notes_new RENAME TO notes;',
    'CREATE INDEX notes_created ON notes (created_at);',
  ].join('\n') },
];

export async function migrate(db: SQLiteDatabase, report: (e: unknown, step: string) => void) {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let current = row?.user_version ?? 0;

  for (const m of MIGRATIONS.filter((x) => x.version > current)) {
    try {
      await db.withExclusiveTransactionAsync(async (tx) => {
        await tx.execAsync(m.sql);
        const fk = await tx.getAllAsync('PRAGMA foreign_key_check');    // rebuilds must not orphan rows
        if (fk.length) throw new Error('foreign key check failed after ' + m.name);
        await tx.execAsync('PRAGMA user_version = ' + m.version);       // same transaction as the change
      });
      current = m.version;
    } catch (e) {
      report(e, m.name);                                                // rolled back: data untouched
      throw e;                                                          // show a recovery screen, retry next launch
    }
  }
  return current;
}`,
        },
        bug: {
          explanation:
            'On any schema change the "migration" drops the tables and recreates the newest schema, which silently deletes every note, draft and unsynced outbox entry on the device when users update. Upgrade the existing tables step by step inside transactions and keep the data.',
          buggy: {
            language: 'ts',
            filename: 'migrate.ts',
            code: raw`// ❌ "Migration" by demolition: every update wipes offline data
const SCHEMA_VERSION = 3;
export async function migrate(db: SQLiteDatabase) {
  const { user_version } = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))!;
  if (user_version !== SCHEMA_VERSION) {
    await db.execAsync('DROP TABLE IF EXISTS notes; DROP TABLE IF EXISTS outbox;');   // user data gone
    await db.execAsync(LATEST_SCHEMA_SQL);
    await db.execAsync('PRAGMA user_version = ' + SCHEMA_VERSION);
  }
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'migrate.ts',
            code: raw`// ✅ Ordered, transactional, data-preserving steps from whatever version is installed
export async function migrate(db: SQLiteDatabase) {
  const { user_version } = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))!;
  for (const m of MIGRATIONS.filter((x) => x.version > user_version)) {
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(m.sql);                                   // ADD COLUMN or rebuild-and-copy
      await tx.execAsync('PRAGMA user_version = ' + m.version);
    });
  }
}`,
          },
        },
      },
      takeaways: [
        'Track the schema with PRAGMA user_version and apply ordered migrations from the installed version.',
        'Run each migration and its version bump in one transaction so failures roll back cleanly.',
        'Use ADD COLUMN where possible; use the create-copy-drop-rename rebuild for type or constraint changes.',
        'Never drop user tables on upgrade; test migrations against fixture databases from every shipped version.',
        'Practice drill: add a v4 migration in Tab 1 that adds a pinned INTEGER NOT NULL DEFAULT 0 column, run the full chain from v1, and assert all 3 notes have pinned = 0.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'app-media-cache',
      title: 'Disk-Backed Image & Media Caching',
      summary: 'Load images fast and cheaply: request the right size, cache to disk with a byte budget and LRU eviction, revalidate with ETags, and keep lists smooth with recycling-aware image components.',
      difficulty: 'Intermediate',
      minutes: 20,
      xp: 110,
      analogy:
        "An image cache is a photo album with a fixed number of pages. Photos you look at often stay in the album; when it is full, the photo you haven't looked at for the longest time is removed to make room (LRU). And you don't print a poster-sized photo to put in a passport-sized slot: you ask the lab for the size you actually need.",
      intuition: [
        { title: 'Two cache levels', body: "Memory cache: decoded bitmaps for what is on screen or just off it (fast, small, cleared under memory pressure). Disk cache: compressed files that survive restarts (bigger, slower). A good image component checks memory → disk → network." },
        { title: 'Request the size you display', body: "A 4000 × 3000 photo is ~48 MB once decoded (4 bytes per pixel). A 64 pt avatar at 3× needs 192 × 192 px, about 147 kB decoded. Ask your image CDN for the exact width (`?w=192&format=webp`) instead of downscaling on the phone." },
        { title: 'Budget and evict', body: "Give the disk cache a byte budget (for example 200 MB) and evict least-recently-used entries when it is exceeded. Key entries by URL (plus size) or by content hash for deduplication." },
        { title: 'Revalidate instead of re-downloading', body: "Store the response's ETag. When the entry is stale, send `If-None-Match`: a `304 Not Modified` refreshes the entry without transferring the image again. Versioned/immutable URLs need no revalidation at all." },
        { title: 'Lists need recycling-aware images', body: "Virtualised lists reuse row views; an image still loading for an old row must not appear in a recycled one. Pass a recycling key (the item id), show a placeholder (blurhash) and fade in." },
        { title: 'Large media', body: "Video and big downloads go to the file system with resumable downloads, progress, and cleanup. Use the platform cache directory (the OS may clear it) for re-downloadable data and the documents directory only for user-created content." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Image request path', body: 'Most images should never reach the network twice.', flow: ['component requests url@192w', 'memory cache (decoded)', 'disk cache (LRU, byte budget)', 'stale? If-None-Match → 304 / 200', 'network → write disk → decode → display'] },
        { kind: 'tip', title: 'Prefetch with intent', body: 'Prefetch the next screen\'s hero image when the user starts a navigation (press-in) or the first few items of the next page, not entire galleries on launch over cellular.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'image_cache_from_scratch.ts',
          explanation: 'Runnable TypeScript: decoded-memory math for full-size vs correctly sized images, a disk cache with a byte budget and LRU eviction, and ETag revalidation where a 304 refreshes an entry without re-downloading it. Bytes transferred are counted and asserted.',
          code: raw`//  DISK CACHE (budget 1,000 kB, LRU)
//
//   put a(400) b(400) -> [a b] 800 kB      get a -> order [b a]
//   put c(400)        -> 1,200 kB > budget -> evict LRU (b) -> [a c] 800 kB
//   stale a: GET If-None-Match: "v1" -> 304 (0 kB transferred) -> fresh again
import assert from 'node:assert/strict';

const decodedBytes = (w: number, h: number) => w * h * 4;        // RGBA, 4 bytes per pixel
assert.equal(decodedBytes(4000, 3000), 48_000_000);               // a full photo: 48 MB in memory
assert.equal(decodedBytes(64 * 3, 64 * 3), 147_456);              // a 64 pt avatar at 3x: ~147 kB
assert.ok(decodedBytes(4000, 3000) / decodedBytes(192, 192) > 300);

type Entry = { kb: number; etag: string; fetchedAt: number };
class DiskCache {
  private map = new Map<string, Entry>();                         // insertion order = LRU order
  used = 0;
  constructor(private budgetKb: number) {}
  get(key: string) {
    const e = this.map.get(key);
    if (e) { this.map.delete(key); this.map.set(key, e); }        // mark as most recently used
    return e;
  }
  put(key: string, e: Entry) {
    if (this.map.has(key)) this.used -= this.map.get(key)!.kb;
    this.map.delete(key); this.map.set(key, e); this.used += e.kb;
    while (this.used > this.budgetKb) {
      const [oldest, entry] = this.map.entries().next().value as [string, Entry];
      this.map.delete(oldest); this.used -= entry.kb;
    }
  }
  keys() { return [...this.map.keys()]; }
}

let transferredKb = 0;
const server: Record<string, { kb: number; etag: string }> = { a: { kb: 400, etag: '"v1"' }, b: { kb: 400, etag: '"v1"' }, c: { kb: 400, etag: '"v1"' } };
function fetchImage(cache: DiskCache, key: string, now: number, maxAgeMs = 60_000) {
  const hit = cache.get(key);
  if (hit && now - hit.fetchedAt < maxAgeMs) return 'memory/disk hit';
  if (hit && hit.etag === server[key].etag) { cache.put(key, { ...hit, fetchedAt: now }); return '304 revalidated'; }   // If-None-Match
  transferredKb += server[key].kb;
  cache.put(key, { ...server[key], fetchedAt: now });
  return '200 downloaded';
}

const cache = new DiskCache(1000);
assert.equal(fetchImage(cache, 'a', 0), '200 downloaded');
assert.equal(fetchImage(cache, 'b', 0), '200 downloaded');
assert.equal(fetchImage(cache, 'a', 10), 'memory/disk hit');
assert.equal(fetchImage(cache, 'c', 20), '200 downloaded');
assert.deepEqual(cache.keys(), ['a', 'c']);                       // b was least recently used -> evicted
assert.equal(cache.used, 800);
assert.equal(fetchImage(cache, 'a', 120_000), '304 revalidated');   // stale but unchanged
assert.equal(transferredKb, 1200);                                // 3 downloads, the 304 cost nothing
server.a.etag = '"v2"';
assert.equal(fetchImage(cache, 'a', 300_000), '200 downloaded');    // changed on the server
console.log('cache keys', cache.keys(), '| used', cache.used, 'kB | transferred', transferredKb, 'kB');`,
        },
        production: {
          language: 'tsx',
          filename: 'Avatar.tsx',
          explanation: 'Production React Native with expo-image: a CDN URL sized to the rendered pixels (points × screen scale), memory+disk caching, a recycling key for virtualised lists, a blurhash placeholder with a short transition, and prefetching the next screen\'s hero image on press-in.',
          code: raw`import { PixelRatio, Pressable } from 'react-native';
import { Image } from 'expo-image';

// Ask the image CDN for exactly the pixels we draw (and a modern format)
export const sized = (url: string, points: number) =>
  url + (url.includes('?') ? '&' : '?') + 'w=' + PixelRatio.getPixelSizeForLayoutSize(points) + '&format=webp';

export function Avatar({ id, url, blurhash, size = 48 }: { id: string; url: string; blurhash?: string; size?: number }) {
  return (
    <Image
      source={{ uri: sized(url, size) }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      cachePolicy="memory-disk"                  // decoded in memory, compressed file on disk
      recyclingKey={id}                          // never flash the previous row's image in a recycled cell
      placeholder={blurhash ? { blurhash } : undefined}
      transition={120}
      contentFit="cover"
      accessibilityIgnoresInvertColors
    />
  );
}

export function ProductCard({ id, image, onOpen }: { id: string; image: string; onOpen: () => void }) {
  return (
    <Pressable
      onPressIn={() => { void Image.prefetch(sized(image, 390), 'disk'); }}   // warm the detail hero on intent
      onPress={onOpen}
      style={{ minHeight: 64 }}
    >
      <Avatar id={id} url={image} size={56} />
    </Pressable>
  );
}

// Settings → "Clear cached images" (and on logout for user-specific media)
export async function clearImageCaches() {
  await Promise.all([Image.clearMemoryCache(), Image.clearDiskCache()]);
}`,
        },
        bug: {
          explanation:
            'Every 48 pt avatar downloads and decodes the original multi-megapixel upload. Scrolling a list of them downloads tens of megabytes on cellular, spikes memory (48 MB per decoded photo) until the OS kills the app, and the plain Image component has no disk cache policy or recycling key. Request sized images and use a caching image component.',
          buggy: {
            language: 'tsx',
            filename: 'Avatar.tsx',
            code: raw`// ❌ Original 4000x3000 upload for a 48 pt circle, no disk cache, flashes in recycled rows
import { Image } from 'react-native';

export function Avatar({ url }: { url: string }) {
  return <Image source={{ uri: url }} style={{ width: 48, height: 48, borderRadius: 24 }} />;
}`,
          },
          fixed: {
            language: 'tsx',
            filename: 'Avatar.tsx',
            code: raw`// ✅ Right-sized URL, memory + disk cache, recycling-safe
import { PixelRatio } from 'react-native';
import { Image } from 'expo-image';

export function Avatar({ id, url }: { id: string; url: string }) {
  const px = PixelRatio.getPixelSizeForLayoutSize(48);            // 144 px on a 3x screen
  return (
    <Image source={{ uri: url + '?w=' + px + '&format=webp' }} cachePolicy="memory-disk"
           recyclingKey={id} style={{ width: 48, height: 48, borderRadius: 24 }} />
  );
}`,
          },
        },
      },
      takeaways: [
        'Decoded images cost width × height × 4 bytes: request the pixels you draw.',
        'Cache in memory (decoded) and on disk (compressed) with a byte budget and LRU eviction.',
        'Revalidate stale entries with ETags (304 = no re-download); immutable URLs need no revalidation.',
        'Use recycling keys and placeholders in virtualised lists; prefetch on intent, not everything.',
        'Practice drill: compute the decoded size of a 1080 × 1920 screenshot (8,294,400 bytes ≈ 8.3 MB) and how many fit in a 64 MiB (67,108,864-byte) memory cache (8).',
      ],
    },
  ],
};
