# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing yet._

## [0.1.3] - 2026-07-13

### Performance

- **Query Runner** no longer re-renders the table sidebar, results grid, and
  saved-queries panel on every keystroke. Typing in the SQL editor now only
  updates the editor, making it feel responsive even with a large table list or
  result set loaded. Achieved by memoizing the heavy panels and keeping their
  props referentially stable.

### Documentation

- Added npm version, downloads, CI, Strapi, Node, TypeScript, and license badges
  to the README.

## [0.1.2] - 2026-07-13

Admin UI improvements to the Database Browser and Query Runner.

### Fixed

- **Column filters** now render in a popover anchored to the filter icon
  instead of an inline box that overlapped rows (or was hidden below short
  tables). Reopening a filtered column shows the applied operator and value
  instead of an empty form, and the fields/buttons inside are aligned.

### Changed

- **Sortable columns** show an always-visible sort indicator; the active
  sort direction is highlighted.
- **Query editor** font increased to 15px for readability.
- **Saved Queries** list is capped in height with its own scroll so it no
  longer grows unbounded.
- **Table sidebars** (both pages) are wider and scroll horizontally, showing
  full table names instead of truncating them.

## [0.1.1] - 2026-07-13

Maintenance release. No changes to runtime behaviour or the published bundle —
this adds test coverage and release tooling only.

### Added

- Test suite (Vitest, 139 tests) covering the security-critical server code —
  lexer, AST parser, and an adversarial query-service suite — plus the admin API
  layer (`useDbViewApi` request contract and request-error handling). Runs on
  in-memory SQLite with no external database.
- Automated publishing to npm on release via GitHub Actions using Trusted
  Publishing (OIDC) with build provenance — no long-lived tokens.
- Commit-hygiene pre-commit hook that blocks secrets, credential/env files, and
  build artifacts.

### Changed

- Tests live outside the compiled source tree (`server/tests`, `admin/tests`) so
  they are never included in the published package.

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

[Unreleased]: https://github.com/sridhar-s-subramanian/strapi-plugin-dbview/compare/v0.1.3...HEAD
[0.1.3]: https://github.com/sridhar-s-subramanian/strapi-plugin-dbview/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/sridhar-s-subramanian/strapi-plugin-dbview/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/sridhar-s-subramanian/strapi-plugin-dbview/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/sridhar-s-subramanian/strapi-plugin-dbview/releases/tag/v0.1.0
