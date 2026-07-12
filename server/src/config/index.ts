import type { DbViewConfig } from '../types';

export const BUILT_IN_DENY_LIST: string[] = [
  'strapi_core_store_settings',
  'strapi_database_schema',
  'strapi_migrations',
  'strapi_migrations_internal',
  'admin_users',
  'admin_passwords',
  'strapi_api_tokens',
  'strapi_api_token_permissions',
  'strapi_transfer_tokens',
  'strapi_transfer_token_permissions',
  'strapi_webhooks',
  'strapi_history_versions',
  'strapi_releases',
  'strapi_release_actions',
];

const defaults: DbViewConfig = {
  defaultRowLimit: 100,
  maxRowLimit: 5000,
  denyList: [],
  redactedColumnPatterns: ['password', '*_token', '*_secret', 'hash', 'salt', 'secret', 'private_key', 'reset_password_token', 'confirm_token'],
  historyRetentionDays: 30,
  queryTimeoutSeconds: 15,
};

export default {
  default: defaults,
  validator(config: Partial<DbViewConfig>) {
    if (config.defaultRowLimit !== undefined && config.defaultRowLimit < 1) {
      throw new Error('strapi-dbview: defaultRowLimit must be >= 1');
    }
    if (config.maxRowLimit !== undefined && config.maxRowLimit < 1) {
      throw new Error('strapi-dbview: maxRowLimit must be >= 1');
    }
    if (config.queryTimeoutSeconds !== undefined && config.queryTimeoutSeconds < 1) {
      throw new Error('strapi-dbview: queryTimeoutSeconds must be >= 1');
    }
  },
};
