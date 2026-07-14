# @swamp-crocodile/strapi-plugin-dbview

[![npm version](https://img.shields.io/npm/v/@swamp-crocodile/strapi-plugin-dbview.svg?logo=npm)](https://www.npmjs.com/package/@swamp-crocodile/strapi-plugin-dbview)
[![npm downloads](https://img.shields.io/npm/dm/@swamp-crocodile/strapi-plugin-dbview.svg)](https://www.npmjs.com/package/@swamp-crocodile/strapi-plugin-dbview)
[![CI](https://github.com/sridhar-s-subramanian/strapi-plugin-dbview/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/sridhar-s-subramanian/strapi-plugin-dbview/actions/workflows/ci.yml)
[![Strapi v5](https://img.shields.io/badge/Strapi-v5-4945ff.svg?logo=strapi&logoColor=white)](https://strapi.io)
[![Node.js](https://img.shields.io/node/v/@swamp-crocodile/strapi-plugin-dbview.svg?logo=node.js&logoColor=white)](https://nodejs.org)
[![types](https://img.shields.io/npm/types/@swamp-crocodile/strapi-plugin-dbview.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![license](https://img.shields.io/npm/l/@swamp-crocodile/strapi-plugin-dbview.svg)](./LICENSE)

A read-only database browser and SQL query runner for the Strapi v5 admin panel.

Inspired by [filament-dbview](https://github.com/sridhar-s-subramanian/filament-dbview) — the same tool, built for Strapi.

---

## Features

- **Database Browser** — Browse every table in your database with pagination, sorting, column filtering, row detail view, and FK preview. Export data as CSV or JSON.
- **Query Runner** — Write and run `SELECT` queries with a CodeMirror SQL editor. Supports `EXPLAIN` and `EXPLAIN ANALYZE`. Save queries for later.
- **Strictly read-only** — Multiple independent security layers enforce read-only access. No `INSERT`, `UPDATE`, `DELETE`, or DDL can ever execute, regardless of how the SQL is crafted.
- **Strapi RBAC** — Uses Strapi's built-in admin permission system. Access is scoped per role with three granular permissions.
- **Sensitive column protection** — Columns matching patterns like `password`, `*_token`, `*_secret` cannot be named in Query Runner SQL (including under aliases, expressions, or WHERE/JOIN clauses). `SELECT *` still works; matching values are replaced with `[REDACTED]` in the result set.
- **Multi-database** — Supports PostgreSQL, MySQL/MySQL2, and SQLite3.
- **Optional read-only DB connection (Layer 5)** — Point the plugin at a SELECT-only database user you create. All browse/query/schema traffic uses that pool; the admin UI cannot pick a different connection.

---

## Requirements

| Requirement | Version |
|---|---|
| Strapi | `^5.0.0` |
| Node.js | `>=20.0.0 <=26.x.x` |
| npm | `>=6.0.0` |

> **Strapi v4 is not supported.** This plugin targets Strapi v5 and above only.

---

## Installation

```bash
npm install @swamp-crocodile/strapi-plugin-dbview
```

The plugin reuses the host admin's `@strapi/design-system` and `@strapi/icons` rather than bundling its own copy — sharing them is what keeps React context intact. They are declared as peer dependencies, so if your app does not already have them as direct dependencies, install them alongside:

```bash
npm install @strapi/design-system @strapi/icons
```

pnpm installs peers automatically by default; npm and yarn do not, and will fail the admin build with `Could not resolve "@strapi/icons"`.

---

## Configuration

Register the plugin in your Strapi app's `config/plugins.ts` (or `.js`):

```ts
// config/plugins.ts
export default ({ env }) => ({
  'strapi-dbview': {
    enabled: true,
    config: {
      // All options are optional — defaults shown below
      defaultRowLimit: 100,
      maxRowLimit: 5000,
      queryTimeoutSeconds: 15,
      denyList: [],
      redactedColumnPatterns: [
        'password',
        '*_token',
        '*_secret',
        'hash',
        'salt',
        'secret',
        'private_key',
        'reset_password_token',
        'confirm_token',
      ],

      // Optional Layer 5 — dedicated SELECT-only DB user (you create the role + grants).
      // When set, ALL plugin reads (browser, query runner, schema) use this pool.
      // When omitted, the plugin uses Strapi's default database connection.
      //
      // URL form (Postgres / MySQL):
      // readOnlyConnection: env('DBVIEW_DATABASE_URL'),
      //
      // Or full Knex config:
      // readOnlyConnection: {
      //   client: 'postgres', // or 'pg', 'mysql2', 'better-sqlite3', …
      //   connection: {
      //     host: env('DBVIEW_HOST', env('DATABASE_HOST', 'localhost')),
      //     port: env.int('DBVIEW_PORT', env.int('DATABASE_PORT', 5432)),
      //     database: env('DBVIEW_NAME', env('DATABASE_NAME')),
      //     user: env('DBVIEW_USER', 'dbview_ro'),
      //     password: env('DBVIEW_PASSWORD'),
      //     ssl: env.bool('DATABASE_SSL', false) && { rejectUnauthorized: false },
      //   },
      //   pool: { min: 0, max: 5 },
      // },
    },
  },
});
```

### Configuration reference

| Option | Type | Default | Description |
|---|---|---|---|
| `defaultRowLimit` | `number` | `100` | Default number of rows returned per query/browse request |
| `maxRowLimit` | `number` | `5000` | Hard cap on rows. Requests above this are clamped, not rejected |
| `queryTimeoutSeconds` | `number` | `15` | Statement-level timeout applied inside the query transaction |
| `denyList` | `string[]` | `[]` | Additional table names to block. Merged with the built-in deny list |
| `redactedColumnPatterns` | `string[]` | see above | Glob patterns for sensitive columns. Query Runner **rejects** SQL that references matching column names; result sets still mask matching output keys as `[REDACTED]` |
| `readOnlyConnection` | `string` \| `Knex.Config` | — | Optional dedicated connection for all plugin DB reads (Layer 5). See below. |

### Optional read-only connection (`readOnlyConnection`)

This is **opt-in defence-in-depth**. The plugin cannot create a database user for you — your ops/DBA must create a role with only the privileges you want (typically `SELECT`), then point the plugin at it.

**Supported forms:**

| Form | Example |
|---|---|
| Postgres URL | `postgres://dbview_ro:secret@localhost:5432/myapp` |
| MySQL URL | `mysql://dbview_ro:secret@localhost:3306/myapp` |
| Knex config object | `{ client: 'pg', connection: { host, user, password, database }, pool? }` |

**Behaviour:**

- **Unset** — plugin uses Strapi’s default `strapi.db.connection` (same as your app).
- **Set** — plugin opens a **separate Knex pool** at bootstrap, runs `SELECT 1` as a health check, and uses that pool for schema listing, Database Browser, FK preview, Query Runner, and EXPLAIN.
- **Fail closed** — if the config is invalid or the database is unreachable, **Strapi will not start**. Fix the credentials or remove `readOnlyConnection` to fall back to the default connection. The plugin never silently ignores a broken RO config and falls back to the full-privilege app user.
- **Client cannot choose a pool** — request body / saved-query `connection` fields are labels only; they do not switch databases.

**Example: PostgreSQL SELECT-only role**

```sql
-- Run as a superuser / owner against your app database
CREATE ROLE dbview_ro LOGIN PASSWORD 'choose-a-strong-password';
GRANT CONNECT ON DATABASE your_database TO dbview_ro;
GRANT USAGE ON SCHEMA public TO dbview_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO dbview_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO dbview_ro;

-- Optional: revoke tables you never want visible even via SELECT *
-- REVOKE SELECT ON TABLE admin_users FROM dbview_ro;
```

```ts
// config/plugins.ts
readOnlyConnection: env('DBVIEW_DATABASE_URL'),
// e.g. DBVIEW_DATABASE_URL=postgres://dbview_ro:...@db-host:5432/your_database
```

> **Production recommendation:** use `readOnlyConnection` with a true SELECT-only role. Application-layer checks (lexer, AST, deny list, redaction, rollback) still apply on top.

---

## Permissions

After enabling the plugin, go to **Settings → Roles** in the Strapi admin and assign permissions to the roles that need access.

| Permission | What it unlocks |
|---|---|
| `plugin::strapi-dbview.browse` | Database Browser page + schema/structure endpoints |
| `plugin::strapi-dbview.query` | Query Runner — execute SELECT, EXPLAIN, EXPLAIN ANALYZE |
| `plugin::strapi-dbview.saved-queries.manage` | Save, load, and delete saved queries |

Roles without `browse` or `query` permission see a "no permissions" screen. The DB View menu link itself is hidden from the sidebar for users who lack `browse`.

---

## Usage

After installation and configuration:

1. Restart your Strapi server.
2. Log in to the admin panel.
3. **DB View** appears in the left sidebar.

### Database Browser

- Select a table from the left sidebar to load its data.
- Click column headers to sort; click the filter icon to add per-column filters.
- Click any row to open a detail panel showing all column values.
- For columns that reference another table (foreign keys), click the link icon to preview related rows.
- Use **CSV** and **JSON** buttons to export the current page.
- Click **Query** or **Structure** in the header to jump to the Query Runner for the selected table.

### Query Runner

- Type a `SELECT` query in the editor. Press **Cmd+Enter** (macOS) or **Ctrl+Enter** (Windows/Linux) to run it.
- Use the **EXPLAIN** button to see the query plan without executing it.
- Use the **EXPLAIN ANALYZE** button to see the plan with actual execution stats (runs and rolls back).
- Adjust the **row limit** dropdown to control result size (capped at `maxRowLimit`).
- Click a table name in the left sidebar to insert it at the cursor (or to start a `SELECT * FROM …` when the editor is empty).
- Click the structure icon next to a table to view its columns and indexes inline.
- Use the **Saved Queries** panel to save frequently-used queries by name and reload them later.

> Queries are not persisted to a history table. Executions are written to the application log instead — blocked queries at `warn` level, successful reads at `debug`.

---

## Security model

All SQL execution passes through independent security layers. Every layer must pass before a query touches the database. Bypassing one layer does not bypass the others.

### Layer 1a — Lexer

A character-by-character state machine strips all string literals, quoted identifiers, comments (including MySQL `/*!...*/` executable comments), and dollar-quoted strings before scanning. The stripped text is then checked for:

- First keyword must be `SELECT` or `WITH`
- ~30 forbidden statement keywords: `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `DROP`, `CREATE`, `ALTER`, `GRANT`, `REVOKE`, `EXEC`, `CALL`, `PRAGMA`, `VACUUM`, `SET`, `COMMIT`, `ROLLBACK`, and more
- ~20 forbidden functions: `SLEEP`, `BENCHMARK`, `PG_SLEEP`, `PG_READ_FILE`, `LOAD_FILE`, `XP_CMDSHELL`, `UTL_HTTP`, `DBMS_SQL`, and more
- Stacked statements (multiple `;`)
- MySQL executable comments

### Layer 1b — AST parser

[node-sql-parser](https://github.com/taozhi8848/node-sql-parser) parses the SQL and verifies:

- The AST root is a `SELECT` statement
- Extracts real table names (CTE names are excluded so `WITH cte AS (...) SELECT * FROM cte` works correctly), including every branch of a `UNION` and the real tables behind a CTE alias
- Extracts **source column identifiers** used anywhere in the statement (SELECT list, expressions, `WHERE`, `JOIN`, CTEs, subqueries), including quoted identifiers. Aliases are not treated as source columns — `SELECT password AS pwd` still reports `password`.

This layer **fails closed**: if the parser cannot positively confirm the statement is a SELECT — whether because it is a detected non-SELECT or because no supported dialect could parse it — the query is rejected. Allowing an unparseable query through would skip the table-scope check below (which runs on the parsed table list), so a query the parser cannot understand could otherwise reach a deny-listed table.

### Layer 2 — Table scope

Every table referenced in the query must:

1. Actually exist in the database (checked against a 5-second cached table list)
2. Not appear in the deny list

**Built-in deny list** (cannot be overridden by config):

```
strapi_core_store_settings   strapi_database_schema      strapi_migrations
strapi_migrations_internal   admin_users                 admin_passwords
strapi_api_tokens            strapi_api_token_permissions
strapi_transfer_tokens       strapi_transfer_token_permissions
strapi_webhooks              strapi_history_versions
strapi_releases              strapi_release_actions
```

### Layer 2b — Sensitive column references

Result-column redaction alone is not enough: renaming a secret in the SELECT list (for example `SELECT password AS pwd` or `SELECT password || '' AS x`) would otherwise return the cleartext under a non-matching key.

After the AST is verified, every **source** column identifier from the parse is checked against `redactedColumnPatterns`. If any match, the query is **rejected** before execution — including when the name appears only inside a CTE, subquery, function call, or `WHERE`/`JOIN` clause.

`SELECT *` (and `table.*`) does not expand to concrete column names in the AST list, so those queries are allowed; sensitive values are still replaced with `[REDACTED]` in the result set (see below).

**Result redaction** (always applied after a successful execute): any result key whose name matches a redaction pattern is replaced with `[REDACTED]`. This covers `SELECT *` and any residual name-based leakage.

> Prefer the **Database Browser** when you need a filtered view of tables that contain sensitive columns — it never accepts raw column expressions and redacts on the real schema names.

### Layer 3 — Enforced LIMIT

Every query is wrapped before execution:

```sql
SELECT * FROM (
<your query>
) AS _dbview_sub LIMIT <N>
```

`N` is an integer constant derived from config, never from user input. The closing paren and `LIMIT` sit on their own lines so a trailing single-line comment (`-- …`) inside the inner query cannot comment out the enforced limit.

### Layer 4 — Always-rollback transaction

All queries — including `EXPLAIN ANALYZE` which actually executes the plan — run inside a transaction that unconditionally rolls back via a private sentinel exception:

```ts
await knex.transaction(async (trx) => {
  rows = await trx.raw(wrappedSql);
  throw new RollbackSignal(); // always rolls back
});
```

Nothing a query does can ever persist, even if all other layers were somehow bypassed.

### Layer 5 — Optional read-only connection

When `readOnlyConnection` is configured, every plugin read uses a **dedicated Knex pool** aimed at a DB user you provision with only `SELECT` (or tighter) grants. This is enforced at the database engine, independent of application logic.

- Initialized at plugin bootstrap with a connectivity check (`SELECT 1`).
- Misconfiguration or an unreachable RO database **aborts Strapi startup** (fail closed).
- Unset → default Strapi connection (Layers 1–4 still apply).

See [Optional read-only connection](#optional-read-only-connection-readonlyconnection) for config shapes and grant examples.

---

## Database Browser vs Query Runner

| | Database Browser | Query Runner |
|---|---|---|
| Access | Point-and-click | Raw SQL |
| SQL injection risk | None (Knex query builder, no raw SQL) | Mitigated by multi-layer security model |
| Sensitive columns | Redacted in results; cannot filter/sort on them | Cannot be named in SQL; `SELECT *` redacts in results |
| Supported operations | Paginated read with sort/filter | SELECT, EXPLAIN, EXPLAIN ANALYZE |
| Export | CSV, JSON | CSV, JSON |
| Requires permission | `browse` | `query` |

---

## Development

```bash
# Clone the repo
git clone https://github.com/sridhar-s-subramanian/strapi-plugin-dbview.git
cd strapi-plugin-dbview

# Install dependencies
npm install

# Type-check
npm run test:ts:back
npm run test:ts:front

# Run the test suite (Vitest)
npm test

# Build
npm run build

# Verify plugin structure
npm run verify

# Watch mode (for development with a linked Strapi app)
npm run watch:link
```

### Linking to a local Strapi app

```bash
# In this repo
npm run watch:link

# In your Strapi app
npx yalc add @swamp-crocodile/strapi-plugin-dbview
```

### Tests

```bash
npm test          # run once
npm run test:watch
```

The suite (Vitest) runs entirely on in-memory SQLite with no external database required:

- **Lexer** and **AST parser** unit tests — keyword/comment/quote evasion, stacked statements, CTE and `UNION` table extraction, column extraction (aliases/expressions), fail-closed behaviour.
- **Query service** integration tests, including an adversarial suite asserting that only read-only `SELECT` / `WITH…SELECT` statements against allowed tables can run — writes, DDL, CTE-smuggled writes, file/OS functions, deny-list evasion, parser-defeating reads, and **sensitive-column alias/expression exfiltration** are all rejected.
- **Redaction** unit tests — glob matching and sensitive-column reference detection.
- **Admin API layer** tests — the `useDbViewApi` request contract (endpoints, encoding, unwrapped request bodies) and request-error message extraction.

Tests live outside the compiled source tree (`server/tests`, `admin/tests`) so they never ship in the published package.

---

## License

MIT
