import type { Core } from '@strapi/strapi';

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async list(userId: number, limit = 20) {
    return strapi.db.query('plugin::strapi-dbview.query-history').findMany({
      where: { userId, allowed: true },
      orderBy: { createdAt: 'desc' },
      limit,
    });
  },

  /** Prune history entries older than the configured retention period. */
  async pruneOld() {
    const days = strapi.plugin('strapi-dbview').config<number>('historyRetentionDays') ?? 30;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    await strapi.db.query('plugin::strapi-dbview.query-history').deleteMany({
      where: { createdAt: { $lt: cutoff.toISOString() } },
    });
  },
});
