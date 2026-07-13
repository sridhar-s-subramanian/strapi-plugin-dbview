# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing yet._

## [0.1.0] - 2026-07-13

Initial release: a read-only database browser and SQL query runner for the
Strapi v5 admin panel.

### Added

- **Database Browser** — browse every table with pagination, sorting, per-column
  filtering, row-detail view, and foreign-key preview. Export the current page as
  CSV or JSON.
- **Query Runner** — write and run `SELECT` queries in a CodeMirror SQL editor
  with syntax highlighting and `Cmd/Ctrl+Enter` to run. Supports `EXPLAIN` and
  `EXPLAIN ANALYZE`. Click a table in the sidebar to insert it at the cursor.
- **Saved queries** — save frequently-used queries by name and reload them.
- **Five-layer read-only security model** — lexer, AST parser (fail-closed),
  table-scope deny list, enforced `LIMIT` wrap, and an always-rollback
  transaction. Only `SELECT` / `WITH…SELECT` against allowed tables can run; no
  `INSERT`, `UPDATE`, `DELETE`, or DDL can execute regardless of how the SQL is
  crafted. An optional read-only database connection adds a fifth, DB-level layer.
- **Sensitive-column redaction** — columns matching configurable glob patterns
  (`password`, `*_token`, `*_secret`, …) are replaced with `[REDACTED]` before any
  data leaves the server.
- **Strapi RBAC** — three granular admin permissions (`browse`, `query`,
  `saved-queries.manage`); the menu link is hidden from users without `browse`.
- **Multi-database support** — PostgreSQL, MySQL/MySQL2, and SQLite3.
- **Configuration** — `defaultRowLimit`, `maxRowLimit`, `queryTimeoutSeconds`,
  `denyList`, `redactedColumnPatterns`, and `readOnlyConnection`.
- **Test suite** — 124 Vitest tests (lexer, AST parser, and an adversarial query-
  service suite) covering the read-only guarantee, run entirely on in-memory
  SQLite.

### Security

- The AST layer fails closed: any query the parser cannot positively confirm as a
  scoped `SELECT` is rejected, so an unparseable query can never bypass the
  table-scope deny list.
- The enforced-`LIMIT` wrapper places the closing paren and `LIMIT` on their own
  lines so a trailing single-line comment cannot comment out the row cap.
- Query executions are audited to the application log (blocked at `warn`,
  successful reads at `debug`) rather than a database table.

[Unreleased]: https://github.com/sridhar-s-subramanian/strapi-plugin-dbview/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/sridhar-s-subramanian/strapi-plugin-dbview/releases/tag/v0.1.0
