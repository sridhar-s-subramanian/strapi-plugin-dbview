export default {
  kind: 'collectionType',
  collectionName: 'dbview_query_history',
  info: {
    singularName: 'query-history',
    pluralName: 'query-histories',
    displayName: 'DBView Query History',
  },
  options: {
    draftAndPublish: false,
    increments: true,
    timestamps: true,
  },
  pluginOptions: {
    'content-manager': { visible: false },
    'content-type-builder': { visible: false },
  },
  attributes: {
    userId: { type: 'integer' },
    connection: { type: 'string', required: true, default: 'default' },
    sql: { type: 'text', required: true },
    rowCount: { type: 'integer' },
    durationMs: { type: 'integer' },
    allowed: { type: 'boolean', required: true, default: true },
    reason: { type: 'string' },
  },
};
