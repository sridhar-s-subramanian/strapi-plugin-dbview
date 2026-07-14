import type { Core } from '@strapi/strapi';
import type { Knex } from 'knex';
import type { ReadOnlyConnectionConfig } from '../types';
import { buildReadOnlyKnexConfig } from '../utils/readOnlyConnection';

function loadKnexFactory(): typeof import('knex') {
  // Host Strapi apps always provide knex; resolve from the app install tree.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('knex') as typeof import('knex');
}

type ConnectionService = {
  /** Create the optional RO pool (or no-op) and verify connectivity. Fail closed on error. */
  init(): Promise<void>;
  /** Knex used for all plugin reads (RO pool when configured, else Strapi default). */
  getKnex(): Knex;
  /** Stable label for audit logs: `read-only` or `default`. */
  getConnectionLabel(): string;
  /** Whether a dedicated RO connection is active. */
  isUsingReadOnly(): boolean;
  /** Destroy the dedicated pool if one was created. */
  destroy(): Promise<void>;
};

/**
 * Resolves which Knex instance the plugin uses for schema / browse / query.
 *
 * Layer 5: when `readOnlyConnection` is set, builds a separate pool pointed at a
 * SELECT-only DB user. The client never picks the pool — only plugin config does.
 */
export default ({ strapi }: { strapi: Core.Strapi }): ConnectionService => {
  let customKnex: Knex | null = null;
  let initialized = false;
  let usingReadOnly = false;

  function getDefaultKnex(): Knex {
    return strapi.db.connection as unknown as Knex;
  }

  return {
    async init() {
      if (initialized) return;

      const raw = strapi.plugin('strapi-dbview').config('readOnlyConnection') as
        | ReadOnlyConnectionConfig
        | undefined
        | null;

      if (raw === undefined || raw === null || raw === '') {
        initialized = true;
        usingReadOnly = false;
        customKnex = null;
        strapi.log.info('[dbview] Using the default Strapi database connection (no readOnlyConnection configured)');
        return;
      }

      let knexConfig: Knex.Config;
      try {
        knexConfig = buildReadOnlyKnexConfig(raw);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`strapi-dbview: invalid readOnlyConnection config — ${message}`);
      }

      const knexFactory = loadKnexFactory();
      // knex default export is the factory function
      const factory = (knexFactory as unknown as { default?: typeof knexFactory }).default ?? knexFactory;
      let instance: Knex;

      try {
        instance = factory(knexConfig);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `strapi-dbview: failed to create readOnlyConnection pool — ${message}. ` +
            'Fix the config or remove readOnlyConnection to use the default Strapi connection.'
        );
      }

      try {
        await instance.raw('SELECT 1 AS dbview_healthcheck');
      } catch (err) {
        try {
          await instance.destroy();
        } catch {
          // ignore destroy errors after failed health check
        }
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `strapi-dbview: readOnlyConnection is configured but the database is unreachable — ${message}. ` +
            'Strapi will not start until this is fixed (fail closed). ' +
            'Remove readOnlyConnection to fall back to the default connection.'
        );
      }

      customKnex = instance;
      usingReadOnly = true;
      initialized = true;
      strapi.log.info(
        '[dbview] Using dedicated read-only database connection (Layer 5). ' +
          'Ensure this DB user has SELECT-only privileges.'
      );
    },

    getKnex() {
      // Lazy-safe for tests / code paths that run before bootstrap: if RO was
      // never initialized, use the default connection rather than throwing mid-request.
      if (!initialized) {
        return getDefaultKnex();
      }
      return customKnex ?? getDefaultKnex();
    },

    getConnectionLabel() {
      return usingReadOnly ? 'read-only' : 'default';
    },

    isUsingReadOnly() {
      return usingReadOnly;
    },

    async destroy() {
      if (customKnex) {
        try {
          await customKnex.destroy();
        } catch (err) {
          strapi.log.warn(
            `[dbview] Error destroying read-only connection pool: ${err instanceof Error ? err.message : String(err)}`
          );
        }
        customKnex = null;
      }
      usingReadOnly = false;
      initialized = false;
    },
  };
};
