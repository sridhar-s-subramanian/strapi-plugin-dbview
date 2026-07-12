export default {
  kind: 'collectionType',
  collectionName: 'dbview_saved_queries',
  info: {
    singularName: 'saved-query',
    pluralName: 'saved-queries',
    displayName: 'DBView Saved Query',
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
    userId: { type: 'integer', required: true },
    name: { type: 'string', required: true },
    connection: { type: 'string', required: true, default: 'default' },
    sql: { type: 'text', required: true },
  },
};
