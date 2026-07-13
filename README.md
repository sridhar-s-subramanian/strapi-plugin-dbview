# @swamp-crocodile/strapi-plugin-dbview

A read-only database browser and SQL query runner for the Strapi v5 admin panel.

Inspired by [filament-dbview](https://github.com/sridhar-s-subramanian/filament-dbview) — the same tool, built for Strapi.

---

## Features

- **Database Browser** — Browse every table in your database with pagination, sorting, column filtering, row detail view, and FK preview. Export data as CSV or JSON.
- **Query Runner** — Write and run `SELECT` queries with a CodeMirror SQL editor. Supports `EXPLAIN` and `EXPLAIN ANALYZE`. Save queries for later.
- **Strictly read-only** — Five independent security layers enforce read-only access. No `INSERT`, `UPDATE`, `DELETE`, or DDL can ever execute, regardless of how the SQL is crafted.
- **Strapi RBAC** — Uses Strapi's built-in admin permission system. Access is scoped per role with three granular permissions.
- **Sensitive column redaction** — Columns matching patterns like `password`, `*_token`, `*_secret` are automatically replaced with `[REDACTED]` before any data leaves the server.
- **Multi-database** — Supports PostgreSQL, MySQL/MySQL2, and SQLite3.

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
export default {
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
      // readOnlyConnection: 'readonly', // optional: named Knex connection with SELECT-only DB user
    },
  },
};
```

### Configuration reference

| Option | Type | Default | Description |
|---|---|---|---|
| `defaultRowLimit` | `number` | `100` | Default number of rows returned per query/browse request |
| `maxRowLimit` | `number` | `5000` | Hard cap on rows. Requests above this are clamped, not rejected |
| `queryTimeoutSeconds` | `number` | `15` | Statement-level timeout applied inside the query transaction |
| `denyList` | `string[]` | `[]` | Additional table names to block. Merged with the built-in deny list |
| `redactedColumnPatterns` | `string[]` | see above | Glob patterns matched against column names. Matching columns show `[REDACTED]` |
| `readOnlyConnection` | `string` | — | Name of an alternative Knex connection configured in `config/database.ts`. Use this to point the plugin at a DB user with only `SELECT` privilege (Layer 5 security) |

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

All SQL execution passes through five independent layers. Every layer must pass before a query touches the database. Bypassing one layer does not bypass the others.

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

Configure `readOnlyConnection` to point the plugin at a database user with only `SELECT` privilege. This is a defence-in-depth measure at the database level independent of application logic.

---

## Database Browser vs Query Runner

| | Database Browser | Query Runner |
|---|---|---|
| Access | Point-and-click | Raw SQL |
| SQL injection risk | None (Knex query builder, no raw SQL) | Mitigated by 5-layer security model |
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

- **Lexer** and **AST parser** unit tests — keyword/comment/quote evasion, stacked statements, CTE and `UNION` table extraction, fail-closed behaviour.
- **Query service** integration tests, including an adversarial suite asserting that only read-only `SELECT` / `WITH…SELECT` statements against allowed tables can run — writes, DDL, CTE-smuggled writes, file/OS functions, deny-list evasion, and parser-defeating reads are all rejected.
- **Admin API layer** tests — the `useDbViewApi` request contract (endpoints, encoding, unwrapped request bodies) and request-error message extraction.

Tests live outside the compiled source tree (`server/tests`, `admin/tests`) so they never ship in the published package.

---

## License

MIT
