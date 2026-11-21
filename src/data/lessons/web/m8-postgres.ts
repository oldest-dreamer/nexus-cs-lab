import type { Module } from '../../types';

const raw = String.raw;

export const postgresModule: Module = {
  id: 'web-postgres',
  title: 'PostgreSQL & Database Performance',
  level: 'Advanced',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'web-sql-modeling-joins',
      title: 'Relational Modeling: Normalization, Foreign Keys & JOINs',
      summary: 'Design tables that cannot drift out of sync, let constraints reject bad data, and write INNER, LEFT and anti-joins that return exactly the rows you mean.',
      difficulty: 'Intermediate',
      minutes: 22,
      xp: 120,
      analogy:
        "A normalized database is a well-run library. Each fact is written on exactly one card: an author's name lives on the author card, and books only point to it. If the author changes their name, you fix one card and every book is correct. A JOIN is the librarian following those pointers to assemble the answer; constraints are the rules that stop anyone filing a book under an author who doesn't exist.",
      intuition: [
        { title: 'Normalize to remove duplicated facts', body: "1NF: atomic values (no comma-separated lists in a column). 2NF/3NF: every non-key column depends on the key, the whole key and nothing but the key. Practically: customer email lives in `customers`, not copied into every order, so it can't disagree with itself." },
        { title: 'Constraints are free correctness', body: "`PRIMARY KEY`, `NOT NULL`, `UNIQUE`, `CHECK (qty > 0)` and `FOREIGN KEY` are enforced by the database for every writer: your API, scripts, migrations and future services. Application-only validation eventually gets bypassed." },
        { title: 'Foreign keys and ON DELETE', body: "`REFERENCES customers(id)` stops orphans. Choose the delete behaviour deliberately: `RESTRICT` (default-like, refuse), `CASCADE` (delete children, e.g. order_items with their order) or `SET NULL`. Index foreign-key columns: Postgres does not do it automatically." },
        { title: 'INNER vs LEFT JOIN', body: "INNER JOIN keeps only rows with a match on both sides. LEFT JOIN keeps every row from the left and fills missing right-side columns with NULL, which is how you list customers with zero orders." },
        { title: 'The WHERE-clause trap', body: "Filtering a LEFT JOIN's right-hand table in WHERE (`WHERE o.status = 'paid'`) removes the NULL rows and silently turns it into an INNER JOIN. Put conditions about the right table in the ON clause." },
        { title: 'Anti-joins and aggregates', body: "\"Customers with no orders\" is `LEFT JOIN … WHERE o.id IS NULL` or `NOT EXISTS (…)`. With GROUP BY, use `COUNT(o.id)` (counts non-NULL) rather than `COUNT(*)`, and `COALESCE(SUM(...), 0)` for empty groups." },
      ],
      callouts: [
        { kind: 'architecture', title: 'A normalized order schema', body: 'Each fact lives in one table; relationships are foreign keys.', flow: ['customers (id, email UNIQUE)', 'orders (id, customer_id → customers)', 'order_items (order_id → orders ON DELETE CASCADE, product_id → products)', 'products (id, sku UNIQUE, price_cents CHECK > 0)'] },
        { kind: 'tip', title: 'Denormalize on purpose, later', body: 'Start normalized. Add a denormalized column or materialized view only when a measured query needs it, and keep it in sync with a trigger or a refresh job.' },
      ],
      code: {
        basic: {
          language: 'sql',
          filename: 'modeling_and_joins.sql',
          explanation: 'Runs as-is on PostgreSQL (verified in PGlite): a normalized schema with PK/FK/UNIQUE/CHECK constraints, constraint violations caught by SQLSTATE, INNER vs LEFT JOIN row counts, the LEFT JOIN + WHERE trap, an anti-join and NULL-safe aggregates. Every result is checked with ASSERT.',
          code: raw`--  JOINS ON customers (3) x orders (3)
--
--   customers: Ada(2 orders)  Lin(1 order)  Sam(0 orders)
--   INNER JOIN         -> 3 rows   (Sam missing)
--   LEFT JOIN          -> 4 rows   (Sam with NULL order)
--   LEFT JOIN ... WHERE o.status = 'paid'  -> Sam disappears again (the trap)

CREATE TABLE customers (id int PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE);
CREATE TABLE products  (id int PRIMARY KEY, sku text NOT NULL UNIQUE, price_cents int NOT NULL CHECK (price_cents > 0));
CREATE TABLE orders (
  id int PRIMARY KEY,
  customer_id int NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('pending', 'paid', 'shipped'))
);
CREATE TABLE order_items (
  order_id int NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id int NOT NULL REFERENCES products(id),
  qty int NOT NULL CHECK (qty > 0),
  PRIMARY KEY (order_id, product_id)
);
CREATE INDEX ON orders (customer_id);              -- FK columns are not indexed automatically
CREATE INDEX ON order_items (product_id);

INSERT INTO customers VALUES (1, 'Ada', 'ada@x.test'), (2, 'Lin', 'lin@x.test'), (3, 'Sam', 'sam@x.test');
INSERT INTO products VALUES (1, 'A-100', 1500), (2, 'B-200', 4000);
INSERT INTO orders VALUES (10, 1, 'paid'), (11, 1, 'pending'), (12, 2, 'paid');
INSERT INTO order_items VALUES (10, 1, 2), (10, 2, 1), (11, 1, 1), (12, 2, 3);

DO $$ BEGIN
  -- constraints reject bad data with specific SQLSTATEs
  BEGIN INSERT INTO orders VALUES (99, 42, 'paid'); RAISE EXCEPTION 'orphan accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;                  -- 23503
  BEGIN INSERT INTO customers VALUES (4, 'Dup', 'ada@x.test'); RAISE EXCEPTION 'duplicate accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;                       -- 23505
  BEGIN INSERT INTO order_items VALUES (12, 1, 0); RAISE EXCEPTION 'qty 0 accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;                        -- 23514
  BEGIN DELETE FROM customers WHERE id = 1; RAISE EXCEPTION 'customer with orders deleted';
  EXCEPTION WHEN restrict_violation THEN NULL; END;                     -- 23001: ON DELETE RESTRICT

  -- INNER vs LEFT
  ASSERT (SELECT count(*) FROM customers c JOIN orders o ON o.customer_id = c.id) = 3;
  ASSERT (SELECT count(*) FROM customers c LEFT JOIN orders o ON o.customer_id = c.id) = 4;

  -- the trap: a WHERE filter on the right table removes customers without matching orders
  ASSERT (SELECT count(DISTINCT c.id) FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
          WHERE o.status = 'paid') = 2;
  ASSERT (SELECT count(DISTINCT c.id) FROM customers c LEFT JOIN orders o
          ON o.customer_id = c.id AND o.status = 'paid') = 3;

  -- anti-join: customers who never ordered
  ASSERT (SELECT array_agg(c.name) FROM customers c
          WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)) = ARRAY['Sam'];

  -- NULL-safe aggregates per customer (revenue of paid orders)
  ASSERT (SELECT json_object_agg(name, revenue ORDER BY name)::text FROM (
            SELECT c.name, COALESCE(SUM(oi.qty * p.price_cents), 0) AS revenue
            FROM customers c
            LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'paid'
            LEFT JOIN order_items oi ON oi.order_id = o.id
            LEFT JOIN products p ON p.id = oi.product_id
            GROUP BY c.name) t) = '{ "Ada" : 7000, "Lin" : 12000, "Sam" : 0 }';

  -- CASCADE removes children with the parent
  DELETE FROM orders WHERE id = 11;
  ASSERT (SELECT count(*) FROM order_items WHERE order_id = 11) = 0;
END $$;`,
        },
        production: {
          language: 'sql',
          filename: 'schema.sql',
          explanation: 'Production schema patterns (runs on PostgreSQL in its own schema): identity keys, citext-free case-insensitive uniqueness via an expression index, money in integer cents, timestamptz with defaults, an updated_at trigger, FK indexes, a generated column, and a reporting view built on LEFT JOINs with conditions in ON.',
          code: raw`CREATE SCHEMA IF NOT EXISTS shop;
SET search_path TO shop;

CREATE TABLE customers (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email       text NOT NULL,
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX customers_email_ci ON customers (lower(email));   -- unique, case-insensitive

CREATE TABLE products (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sku          text NOT NULL UNIQUE,
  price_cents  integer NOT NULL CHECK (price_cents >= 0),             -- never float for money
  active       boolean NOT NULL DEFAULT true
);

CREATE TABLE orders (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id  bigint NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'shipped', 'cancelled')),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_customer_id ON orders (customer_id);

CREATE TABLE order_items (
  order_id     bigint NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   bigint NOT NULL REFERENCES products(id),
  qty          integer NOT NULL CHECK (qty BETWEEN 1 AND 999),
  unit_cents   integer NOT NULL CHECK (unit_cents >= 0),             -- price at time of purchase
  line_cents   integer GENERATED ALWAYS AS (qty * unit_cents) STORED,
  PRIMARY KEY (order_id, product_id)
);
CREATE INDEX order_items_product_id ON order_items (product_id);

CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER customers_touch BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- every customer, including those with no paid orders
CREATE VIEW customer_revenue AS
SELECT c.id, c.email,
       COUNT(DISTINCT o.id)              AS paid_orders,
       COALESCE(SUM(oi.line_cents), 0)   AS revenue_cents
FROM customers c
LEFT JOIN orders o       ON o.customer_id = c.id AND o.status = 'paid'   -- condition in ON, not WHERE
LEFT JOIN order_items oi ON oi.order_id = o.id
GROUP BY c.id, c.email;`,
        },
        bug: {
          explanation:
            'The report is meant to list every customer with their paid-order count, but the WHERE clause filters on the right-hand table, which discards the NULL rows a LEFT JOIN produced for customers without paid orders. Those customers vanish from the report instead of showing 0. Move the condition into the ON clause.',
          buggy: {
            language: 'sql',
            filename: 'report.sql',
            code: raw`-- ❌ Sam (no paid orders) silently disappears: the LEFT JOIN became an INNER JOIN
SELECT c.name, COUNT(o.id) AS paid_orders
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.status = 'paid'
GROUP BY c.name
ORDER BY c.name;`,
          },
          fixed: {
            language: 'sql',
            filename: 'report.sql',
            code: raw`-- ✅ Filter the joined rows in ON: every customer is kept, Sam shows 0
SELECT c.name, COUNT(o.id) AS paid_orders
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'paid'
GROUP BY c.name
ORDER BY c.name;`,
          },
        },
      },
      takeaways: [
        'Normalize so each fact lives in one place; denormalize later, deliberately.',
        'Constraints (PK, FK, UNIQUE, CHECK, NOT NULL) protect data from every writer; index FK columns yourself.',
        'INNER JOIN drops unmatched rows; LEFT JOIN keeps them with NULLs.',
        'Right-table conditions belong in ON; use NOT EXISTS for anti-joins and COUNT(col)/COALESCE for aggregates.',
        'Practice drill: write a query listing products that were never ordered (anti-join on order_items) and predict its result for the Tab 1 data (none: both products were ordered).',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'web-indexes-explain',
      title: 'B-Tree & GIN Indexes and Reading EXPLAIN ANALYZE',
      summary: 'How indexes turn full-table scans into lookups, how to design composite, expression, partial and GIN indexes, and how to read a query plan to prove an index is used.',
      difficulty: 'Advanced',
      minutes: 25,
      xp: 140,
      analogy:
        "A table without an index is a novel with no table of contents: to find one character's scenes you read every page (a sequential scan). A B-tree index is the alphabetical index at the back: jump straight to the right page, and because it is sorted, you can also read a range in order. A GIN index is a cookbook's ingredient index: for each ingredient it lists every recipe that contains it, perfect for \"which documents contain these keys or words?\"",
      intuition: [
        { title: 'B-tree: sorted, balanced, logarithmic', body: "A B-tree keeps keys sorted in pages a few levels deep, so finding one key among 100 million rows touches only 3–4 pages. It serves `=`, `<`, `>`, `BETWEEN`, `IN`, prefix `LIKE 'abc%'` and `ORDER BY` on the indexed columns." },
        { title: 'Composite indexes and the leftmost prefix', body: "An index on `(customer_id, created_at DESC)` serves `WHERE customer_id = ?` and `WHERE customer_id = ? ORDER BY created_at DESC LIMIT 10` (no sort step), but not `WHERE created_at > ?` alone. Put equality columns first, then range/sort columns." },
        { title: 'Expression and partial indexes', body: "`WHERE lower(email) = ?` can't use an index on `email`; create one on `lower(email)`. A partial index (`WHERE status = 'pending'`) indexes only the rows you query often, so it is small and fast." },
        { title: 'GIN for \"contains\"', body: "GIN maps each element (JSON key/value, array element, word) to the rows containing it. Use it for `jsonb @>`, array `&&`/`@>` and full-text search (`to_tsvector(...) @@ query`). `jsonb_path_ops` is smaller and faster when you only need `@>`." },
        { title: 'Reading EXPLAIN ANALYZE', body: "Read the plan inside-out. `Seq Scan` reads every row; `Index Scan` follows the index; `Bitmap Index Scan` + `Bitmap Heap Scan` collect many matches then visit pages in order. Compare estimated `rows` with actual rows: big mismatches mean stale statistics (run ANALYZE). Look at `actual time`, `loops` and, with BUFFERS, pages read." },
        { title: 'Indexes are not free', body: "Every index slows writes and takes space. Check `pg_stat_user_indexes` for indexes that are never used, and create new indexes with `CREATE INDEX CONCURRENTLY` in production to avoid blocking writes." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Plan shapes you will see', body: 'Read from the innermost node outwards.', flow: ['Seq Scan (no usable index)', 'Index Scan (few rows, or ordered output for LIMIT)', 'Bitmap Index Scan → Bitmap Heap Scan (many rows)', 'Sort / Limit / Aggregate on top', 'compare estimated vs actual rows'] },
        { kind: 'tip', title: 'Paste plans into a visualizer', body: 'EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) output pasted into a plan visualizer highlights the slowest node and estimate errors immediately. Always test with production-like data volumes: on tiny tables the planner correctly prefers Seq Scan.' },
      ],
      code: {
        basic: {
          language: 'sql',
          filename: 'indexes_and_plans.sql',
          explanation: 'Runs as-is on PostgreSQL (verified in PGlite): 100,000 orders, a plan_of() helper that returns the JSON plan, and ASSERTs proving Seq Scan → index use after CREATE INDEX, a composite index serving ORDER BY … LIMIT without a Sort, the leftmost-prefix limitation, an expression index for lower(email), GIN for jsonb containment, a partial index, and actual row counts from EXPLAIN ANALYZE.',
          code: raw`--  WHERE customer_id = 42   (100,000 rows, 100 matches)
--
--   no index:   Seq Scan on orders  (reads all 100,000 rows)
--   index:      Bitmap Heap Scan
--                 -> Bitmap Index Scan on orders_customer_created  (100 row pointers)
--   ORDER BY created_at DESC LIMIT 10:  Limit -> Index Scan  (already sorted: no Sort node)

CREATE TABLE orders (
  id bigint PRIMARY KEY, customer_id int NOT NULL, status text NOT NULL,
  created_at timestamptz NOT NULL, email text NOT NULL, attrs jsonb NOT NULL
);
INSERT INTO orders
SELECT g, g % 1000,
       CASE WHEN g % 50 = 0 THEN 'pending' ELSE 'shipped' END,
       timestamptz '2026-01-01' + g * interval '1 minute',
       'User' || g || '@Example.com',
       jsonb_build_object('color', (ARRAY['red', 'green', 'blue', 'black'])[1 + g % 4], 'gift', g % 97 = 0)
FROM generate_series(1, 100000) AS g;
ANALYZE orders;                                    -- fresh statistics for the planner

CREATE FUNCTION plan_of(q text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE p json;
BEGIN EXECUTE 'EXPLAIN (FORMAT JSON) ' || q INTO p; RETURN p::text; END $$;

CREATE FUNCTION actual_rows(q text) RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE p json;
BEGIN EXECUTE 'EXPLAIN (ANALYZE, FORMAT JSON) ' || q INTO p; RETURN (p -> 0 -> 'Plan' ->> 'Actual Rows')::numeric; END $$;

DO $$ BEGIN
  ASSERT plan_of('SELECT * FROM orders WHERE customer_id = 42') LIKE '%"Seq Scan"%', 'no index yet';
END $$;

CREATE INDEX orders_customer_created ON orders (customer_id, created_at DESC);
CREATE INDEX orders_email_lower ON orders (lower(email));
CREATE INDEX orders_attrs_gin ON orders USING gin (attrs jsonb_path_ops);
CREATE INDEX orders_pending ON orders (created_at) WHERE status = 'pending';

DO $$ BEGIN
  ASSERT plan_of('SELECT * FROM orders WHERE customer_id = 42') LIKE '%"Bitmap Index Scan"%orders_customer_created%';
  ASSERT actual_rows('SELECT * FROM orders WHERE customer_id = 42') = 100;

  -- composite index returns rows already ordered: Limit over Index Scan, no Sort
  ASSERT plan_of('SELECT * FROM orders WHERE customer_id = 42 ORDER BY created_at DESC LIMIT 10')
         LIKE '%"Limit"%"Index Scan"%orders_customer_created%';
  ASSERT plan_of('SELECT * FROM orders WHERE customer_id = 42 ORDER BY created_at DESC LIMIT 10') NOT LIKE '%"Sort"%';

  -- leftmost prefix: created_at alone cannot seek into (customer_id, created_at)
  ASSERT plan_of($q$SELECT * FROM orders WHERE created_at >= '2026-02-01' AND created_at < '2026-02-02'$q$)
         LIKE '%"Seq Scan"%';

  -- expression index matches the expression exactly
  ASSERT plan_of($q$SELECT * FROM orders WHERE lower(email) = 'user77@example.com'$q$) LIKE '%orders_email_lower%';
  ASSERT plan_of($q$SELECT * FROM orders WHERE email = 'User77@Example.com'$q$) LIKE '%"Seq Scan"%';

  -- GIN answers jsonb containment
  ASSERT plan_of($q$SELECT id FROM orders WHERE attrs @> '{"gift": true}'$q$) LIKE '%orders_attrs_gin%';
  ASSERT actual_rows($q$SELECT id FROM orders WHERE attrs @> '{"gift": true}'$q$) > 0;

  -- partial index: small, and used when the query repeats its predicate
  ASSERT plan_of($q$SELECT id FROM orders WHERE status = 'pending' ORDER BY created_at LIMIT 20$q$)
         LIKE '%orders_pending%';
  ASSERT pg_relation_size('orders_pending') < pg_relation_size('orders_customer_created') / 10;
END $$;`,
        },
        production: {
          language: 'sql',
          filename: 'index-strategy.sql',
          explanation: 'Production index strategy for an orders table (runs on PostgreSQL after the Tab 1 table exists): a covering index with INCLUDE for an index-only list query, a full-text GIN index on a generated tsvector, the EXPLAIN options to use, and the monitoring query that finds unused indexes. In production, run each CREATE INDEX as CREATE INDEX CONCURRENTLY, outside a transaction.',
          code: raw`-- 1) Covering index: the list page reads only indexed columns -> Index Only Scan
CREATE INDEX IF NOT EXISTS orders_customer_list
  ON orders (customer_id, created_at DESC) INCLUDE (status, id);

-- 2) Full-text search over a generated column + GIN
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS search tsvector
  GENERATED ALWAYS AS (to_tsvector('english', email || ' ' || notes)) STORED;
CREATE INDEX IF NOT EXISTS orders_search_gin ON orders USING gin (search);

ANALYZE orders;                                  -- fresh statistics; also run VACUUM orders (outside a
                                                 -- transaction) so the visibility map allows Index Only Scans

-- 3) How to look at a slow query (BUFFERS shows pages read from cache vs disk)
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, status, created_at
FROM orders
WHERE customer_id = 42
ORDER BY created_at DESC
LIMIT 20;

EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM orders
WHERE search @@ websearch_to_tsquery('english', 'user77');

-- 4) Indexes that cost write time but are never read
SELECT schemaname, relname AS table_name, indexrelname AS index_name,
       idx_scan, pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;`,
        },
        bug: {
          explanation:
            'Wrapping an indexed column in a function or cast (date(created_at), lower(email)) makes the predicate non-sargable: the B-tree is sorted by the raw column, so Postgres must compute the expression for every row with a Seq Scan. Rewrite as a range on the raw column, or index the exact expression.',
          buggy: {
            language: 'sql',
            filename: 'daily-report.sql',
            code: raw`-- ❌ The function on the column hides it from the index: full table scan
SELECT count(*) FROM orders
WHERE date(created_at AT TIME ZONE 'UTC') = '2026-02-01';

SELECT * FROM orders WHERE lower(email) LIKE 'user7%';   -- no index on lower(email) prefix`,
          },
          fixed: {
            language: 'sql',
            filename: 'daily-report.sql',
            code: raw`-- ✅ Sargable range on the raw column (+ an index whose leading column is created_at)
CREATE INDEX IF NOT EXISTS orders_created_at ON orders (created_at);
SELECT count(*) FROM orders
WHERE created_at >= timestamptz '2026-02-01 00:00+00'
  AND created_at <  timestamptz '2026-02-02 00:00+00';

-- ✅ Expression index with text_pattern_ops supports the prefix LIKE
CREATE INDEX IF NOT EXISTS orders_email_lower_prefix ON orders (lower(email) text_pattern_ops);
SELECT * FROM orders WHERE lower(email) LIKE 'user7%';`,
          },
        },
      },
      takeaways: [
        'B-trees serve equality, ranges, prefixes and ORDER BY; composite indexes follow the leftmost prefix rule.',
        'Expression indexes match exact expressions; partial indexes cover hot subsets cheaply; GIN serves "contains".',
        'Read EXPLAIN ANALYZE inside-out: node types, estimated vs actual rows, time, loops, buffers.',
        'Keep predicates sargable, drop unused indexes, and build new ones CONCURRENTLY.',
        'Practice drill: predict the plan for WHERE customer_id IN (1, 2, 3) ORDER BY created_at DESC LIMIT 5 on the Tab 1 data, then run EXPLAIN ANALYZE and compare.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'web-transactions-n-plus-one',
      title: 'ACID Transactions, Isolation Levels & Killing N+1 Queries',
      summary: 'Keep data correct under concurrency with transactions, row locks and atomic updates, know what each isolation level does and does not prevent, and replace query-per-row loops with set-based queries.',
      difficulty: 'Advanced',
      minutes: 25,
      xp: 140,
      analogy:
        "A transaction is a bank teller's sealed envelope: either every slip inside is processed or none is. Isolation levels decide how much two tellers can see of each other's half-finished envelopes. An N+1 query is a shopper who drives to the store once for the list and then once more for every single item on it, instead of buying everything in one trip.",
      intuition: [
        { title: 'ACID', body: "Atomicity: all statements commit or none do. Consistency: constraints hold after every commit. Isolation: concurrent transactions don't see each other's uncommitted work. Durability: committed data survives crashes (write-ahead log)." },
        { title: 'The lost update', body: "Two requests read stock = 5, each subtracts 1 in application code and writes 4. One sale vanished. Read-modify-write in application code is unsafe under concurrency, even inside a transaction at the default isolation level." },
        { title: 'Three fixes', body: "1) An atomic statement: `UPDATE products SET stock = stock - 1 WHERE id = $1 AND stock >= 1` (check affected rows). 2) Lock the row first: `SELECT … FOR UPDATE`. 3) Optimistic concurrency: a `version` column and `WHERE version = $old`, retrying on conflict." },
        { title: 'Isolation levels in Postgres', body: "READ COMMITTED (default): each statement sees data committed before it started. REPEATABLE READ: the whole transaction sees one snapshot; conflicting writes fail with a serialization error. SERIALIZABLE: transactions behave as if run one at a time; the app must retry on SQLSTATE 40001." },
        { title: 'The N+1 problem', body: "Loading 50 orders and then querying items once per order makes 51 round trips. At 1 ms each that is 51 ms of pure latency, and ORMs hide it behind innocent-looking property access." },
        { title: 'Set-based fixes', body: "One JOIN, or one batched query with `WHERE order_id = ANY($1)` and grouping in code, or `json_agg` to return nested data in a single query. DataLoader-style batching collects keys requested in the same tick into one query." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Safe checkout transaction', body: 'Short transactions, atomic conditional updates, retry only on serialization/deadlock errors.', flow: ['BEGIN', 'UPDATE stock … WHERE stock >= qty (row locked)', '0 rows? → ROLLBACK, "sold out"', 'INSERT order + items', 'COMMIT', 'on 40001 / 40P01 → retry with backoff'] },
        { kind: 'warning', title: 'Keep transactions short', body: 'Never wait on a network call (payment provider, email) while holding row locks inside a transaction. Do external calls before or after, and use an outbox table for side effects that must follow a commit.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'concurrency_and_n_plus_one.ts',
          explanation: 'Runnable TypeScript with a deterministic scheduler: two interleaved read-modify-write transactions lose an update, while the atomic conditional update and the optimistic version check stay correct; an oversell is refused. Then an N+1 loader is compared with a batched loader by counting queries. All asserted.',
          code: raw`//  LOST UPDATE (stock = 5, two buyers)
//
//   T1: read 5 ............ write 4
//   T2:        read 5 ............... write 4      -> stock 4, but 2 items sold
//   atomic: UPDATE ... SET stock = stock - 1 WHERE stock >= 1   -> stock 3
//   N+1: 1 query for orders + 1 per order  vs  batched: 2 queries total
import assert from 'node:assert/strict';

// ---- concurrency model: each step is one statement; we choose the interleaving
type Db = { stock: number; version: number };

function lostUpdate(): Db {
  const db: Db = { stock: 5, version: 1 };
  const t1 = db.stock;           // T1 reads
  const t2 = db.stock;           // T2 reads the same value
  db.stock = t1 - 1;             // T1 writes
  db.stock = t2 - 1;             // T2 overwrites T1's write
  return db;
}
assert.equal(lostUpdate().stock, 4);

function atomicDecrement(db: Db, qty: number): number {   // UPDATE ... SET stock = stock - $qty WHERE stock >= $qty
  if (db.stock < qty) return 0;                            // the row lock makes check+write one step
  db.stock -= qty;
  return 1;                                                // affected rows
}
const atomic: Db = { stock: 5, version: 1 };
atomicDecrement(atomic, 1); atomicDecrement(atomic, 1);
assert.equal(atomic.stock, 3);
assert.equal(atomicDecrement({ stock: 1, version: 1 }, 2), 0);   // oversell refused

function optimistic(db: Db, readVersion: number, newStock: number): boolean {   // ... WHERE version = $read
  if (db.version !== readVersion) return false;            // someone else wrote first: retry
  db.stock = newStock; db.version++;
  return true;
}
const opt: Db = { stock: 5, version: 1 };
const r1 = { stock: opt.stock, v: opt.version }, r2 = { stock: opt.stock, v: opt.version };
assert.equal(optimistic(opt, r1.v, r1.stock - 1), true);
assert.equal(optimistic(opt, r2.v, r2.stock - 1), false);  // conflict detected instead of lost
const again = { stock: opt.stock, v: opt.version };
assert.equal(optimistic(opt, again.v, again.stock - 1), true);
assert.equal(opt.stock, 3);

// ---- N+1 vs batching
const ITEMS = new Map<number, string[]>(Array.from({ length: 50 }, (_, i) => [i + 1, ['sku-' + (i + 1)]]));
let queries = 0;
const db = {
  orders: () => { queries++; return Array.from({ length: 50 }, (_, i) => ({ id: i + 1 })); },
  itemsFor: (id: number) => { queries++; return ITEMS.get(id) ?? []; },
  itemsForMany: (ids: number[]) => { queries++; return ids.flatMap((id) => (ITEMS.get(id) ?? []).map((sku) => ({ orderId: id, sku }))); },
};

queries = 0;
const nPlusOne = db.orders().map((o) => ({ ...o, items: db.itemsFor(o.id) }));
assert.equal(queries, 51);

queries = 0;
const orders = db.orders();
const rows = db.itemsForMany(orders.map((o) => o.id));        // WHERE order_id = ANY($1)
const byOrder = new Map<number, string[]>();
for (const r of rows) byOrder.set(r.orderId, [...(byOrder.get(r.orderId) ?? []), r.sku]);
const batched = orders.map((o) => ({ ...o, items: byOrder.get(o.id) ?? [] }));
assert.equal(queries, 2);
assert.deepEqual(batched, nPlusOne);                           // same result, 25x fewer round trips
console.log('lost update stock', lostUpdate().stock, '| atomic', atomic.stock, '| queries N+1 = 51, batched = 2');`,
        },
        production: {
          language: 'ts',
          filename: 'checkout.ts',
          explanation: 'Production node-postgres: a transaction helper that retries only on serialization failures and deadlocks, a checkout that decrements stock atomically per item (refusing oversells) and inserts the order in the same transaction, and a single json_agg query that returns orders with nested items instead of N+1 lookups.',
          code: raw`import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const RETRYABLE = new Set(['40001', '40P01']);          // serialization_failure, deadlock_detected

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>, isolation = 'READ COMMITTED', attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN ISOLATION LEVEL ' + isolation);
      const result = await fn(c);
      await c.query('COMMIT');
      return result;
    } catch (e) {
      await c.query('ROLLBACK');
      const code = (e as { code?: string }).code;
      if (!code || !RETRYABLE.has(code) || attempt >= attempts) throw e;
      await new Promise((r) => setTimeout(r, 20 * 2 ** attempt + Math.random() * 20));   // backoff + jitter
    } finally {
      c.release();
    }
  }
}

export class SoldOutError extends Error {}

export function checkout(customerId: number, items: { productId: number; qty: number }[]) {
  return tx(async (c) => {
    for (const it of [...items].sort((a, b) => a.productId - b.productId)) {   // fixed lock order avoids deadlocks
      const r = await c.query(
        'UPDATE products SET stock = stock - $2 WHERE id = $1 AND stock >= $2 RETURNING price_cents',
        [it.productId, it.qty]);
      if (r.rowCount === 0) throw new SoldOutError('product ' + it.productId + ' is sold out');
    }
    const { rows: [order] } = await c.query(
      'INSERT INTO orders (customer_id, status) VALUES ($1, $2) RETURNING id', [customerId, 'pending']);
    await c.query(
      'INSERT INTO order_items (order_id, product_id, qty, unit_cents) ' +
      'SELECT $1, p.id, i.qty, p.price_cents FROM unnest($2::bigint[], $3::int[]) AS i(product_id, qty) ' +
      'JOIN products p ON p.id = i.product_id',
      [order.id, items.map((i) => i.productId), items.map((i) => i.qty)]);   // one statement for all items
    return order.id as number;
  });
}

// One round trip for a page of orders with their items (no N+1)
export async function ordersWithItems(customerId: number) {
  const { rows } = await pool.query(
    'SELECT o.id, o.status, o.created_at, ' +
    "  COALESCE(json_agg(json_build_object('sku', p.sku, 'qty', oi.qty)) FILTER (WHERE oi.order_id IS NOT NULL), '[]') AS items " +
    'FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id LEFT JOIN products p ON p.id = oi.product_id ' +
    'WHERE o.customer_id = $1 GROUP BY o.id ORDER BY o.created_at DESC LIMIT 50', [customerId]);
  return rows;
}`,
        },
        bug: {
          explanation:
            'The loop issues one query per order (and the ORM hides another per product), so a page of 50 orders costs 51+ database round trips; latency grows linearly with page size and the database connection pool saturates under load. Fetch the related rows in one batched query and group them in memory (or use a JOIN with json_agg).',
          buggy: {
            language: 'ts',
            filename: 'orders-page.ts',
            code: raw`// ❌ N+1: 1 query for orders + 1 query per order
export async function ordersPage(customerId: number) {
  const { rows: orders } = await pool.query('SELECT * FROM orders WHERE customer_id = $1 LIMIT 50', [customerId]);
  for (const order of orders) {
    const { rows } = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
    order.items = rows;                              // 50 sequential round trips
  }
  return orders;
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'orders-page.ts',
            code: raw`// ✅ 2 queries total, regardless of page size
export async function ordersPage(customerId: number) {
  const { rows: orders } = await pool.query('SELECT * FROM orders WHERE customer_id = $1 LIMIT 50', [customerId]);
  const { rows: items } = await pool.query(
    'SELECT * FROM order_items WHERE order_id = ANY($1::bigint[])', [orders.map((o) => o.id)]);
  const byOrder = Map.groupBy(items, (i) => i.order_id);   // Node 21+ / ES2024
  return orders.map((o) => ({ ...o, items: byOrder.get(o.id) ?? [] }));
}`,
          },
        },
      },
      takeaways: [
        'Transactions give all-or-nothing writes; isolation decides what concurrent transactions can see.',
        'Read-modify-write in app code loses updates: use atomic conditional UPDATEs, FOR UPDATE, or version checks.',
        'Under REPEATABLE READ/SERIALIZABLE, retry on 40001; always keep transactions short and lock rows in a fixed order.',
        'Replace N+1 loops with JOINs, ANY($1) batching or json_agg; count queries in tests.',
        'Practice drill: in Tab 1, run three buyers against stock = 2 with atomicDecrement(…, 1) and assert exactly two succeed and stock ends at 0.',
      ],
    },
  ],
};
