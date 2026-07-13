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
};
