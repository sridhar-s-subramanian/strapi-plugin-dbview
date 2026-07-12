import type { Core } from '@strapi/strapi';
import type { Context } from 'koa';

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async list(ctx: Context) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized();

    const service = strapi.plugin('strapi-dbview').service('history') as {
      list(userId: number, limit?: number): Promise<unknown[]>;
    };

    const entries = await service.list(userId, 30);
    ctx.body = { entries };
  },
});
