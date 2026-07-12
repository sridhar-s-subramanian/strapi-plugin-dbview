const PLUGIN_UID = 'plugin::strapi-dbview';

const perm = (uid: string) => ({
  name: 'admin::hasPermissions',
  config: { actions: [`${PLUGIN_UID}.${uid}`] },
});

export default {
  type: 'admin',
  routes: [
    // ── Schema ───────────────────────────────────────────────────────────────
    {
      method: 'GET',
      path: '/schema/tables',
      handler: 'schema.listTables',
      config: { policies: [perm('browse')] },
    },
    {
      method: 'GET',
      path: '/schema/tables/:tableName/structure',
      handler: 'schema.getStructure',
      config: { policies: [perm('browse')] },
    },

    // ── Data browser ─────────────────────────────────────────────────────────
    {
      method: 'GET',
      path: '/data/:tableName',
      handler: 'data.browse',
      config: { policies: [perm('browse')] },
    },
    {
      method: 'GET',
      path: '/data/:tableName/related/:column',
      handler: 'data.relatedRows',
      config: { policies: [perm('browse')] },
    },

    // ── Query runner ──────────────────────────────────────────────────────────
    {
      method: 'POST',
      path: '/query/execute',
      handler: 'query.execute',
      config: { policies: [perm('query')] },
    },
    {
      method: 'POST',
      path: '/query/explain',
      handler: 'query.explain',
      config: { policies: [perm('query')] },
    },

    // ── History ───────────────────────────────────────────────────────────────
    {
      method: 'GET',
      path: '/history',
      handler: 'history.list',
      config: { policies: [perm('history.read')] },
    },

    // ── Saved queries ─────────────────────────────────────────────────────────
    {
      method: 'GET',
      path: '/saved-queries',
      handler: 'saved-query.list',
      config: { policies: [perm('saved-queries.manage')] },
    },
    {
      method: 'POST',
      path: '/saved-queries',
      handler: 'saved-query.create',
      config: { policies: [perm('saved-queries.manage')] },
    },
    {
      method: 'DELETE',
      path: '/saved-queries/:id',
      handler: 'saved-query.delete',
      config: { policies: [perm('saved-queries.manage')] },
    },
  ],
};
