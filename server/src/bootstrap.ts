import type { Core } from '@strapi/strapi';

const PLUGIN_NAME = 'strapi-dbview';

const ACTIONS = [
  {
    section: 'plugins',
    displayName: 'Browse Tables',
    uid: 'browse',
    subCategory: 'Database Browser',
    pluginName: PLUGIN_NAME,
  },
  {
    section: 'plugins',
    displayName: 'Execute Queries',
    uid: 'query',
    subCategory: 'Query Runner',
    pluginName: PLUGIN_NAME,
  },
  {
    section: 'plugins',
    displayName: 'Manage Saved Queries',
    uid: 'saved-queries.manage',
    subCategory: 'Query Runner',
    pluginName: PLUGIN_NAME,
  },
];

export default async ({ strapi }: { strapi: Core.Strapi }) => {
  await (strapi.admin as unknown as {
    services: { permission: { actionProvider: { registerMany(actions: typeof ACTIONS): Promise<void> } } };
  }).services.permission.actionProvider.registerMany(ACTIONS);

  // Layer 5: open the optional read-only pool (or confirm default). Fail closed
  // if readOnlyConnection is set but unreachable — better than silently using
  // the app's full-privilege connection.
  const connection = strapi.plugin(PLUGIN_NAME).service('connection') as {
    init(): Promise<void>;
  };
  await connection.init();
};
