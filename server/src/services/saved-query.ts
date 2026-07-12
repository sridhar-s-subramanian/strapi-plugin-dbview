import type { Core } from '@strapi/strapi';

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async list(userId: number, limit = 50) {
    return strapi.db.query('plugin::strapi-dbview.saved-query').findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      limit,
    });
  },

  async create(userId: number, name: string, sql: string, connection: string) {
    return strapi.db.query('plugin::strapi-dbview.saved-query').create({
      data: { userId, name, sql, connection },
    });
  },

  async delete(id: number, userId: number) {
    // Scope deletion to owner to prevent cross-user deletion
    const existing = await strapi.db.query('plugin::strapi-dbview.saved-query').findOne({
      where: { id, userId },
    });
    if (!existing) return null;

    return strapi.db.query('plugin::strapi-dbview.saved-query').delete({ where: { id } });
  },
});
