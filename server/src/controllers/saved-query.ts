import type { Core } from '@strapi/strapi';
import type { Context } from 'koa';

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async list(ctx: Context) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized();

    const service = strapi.plugin('strapi-dbview').service('saved-query') as {
      list(userId: number): Promise<unknown[]>;
    };

    const queries = await service.list(userId);
    ctx.body = { queries };
  },

  async create(ctx: Context) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized();

    const { name, sql, connection } = ctx.request.body as {
      name?: string;
      sql?: string;
      connection?: string;
    };

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return ctx.badRequest('name is required');
    }
    if (!sql || typeof sql !== 'string' || sql.trim() === '') {
      return ctx.badRequest('sql is required');
    }

    const service = strapi.plugin('strapi-dbview').service('saved-query') as {
      create(userId: number, name: string, sql: string, connection: string): Promise<unknown>;
    };

    const saved = await service.create(userId, name.trim(), sql, connection ?? 'default');
    ctx.status = 201;
    ctx.body = { query: saved };
  },

  async delete(ctx: Context) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized();

    const id = parseInt(ctx.params.id as string, 10);
    if (isNaN(id)) return ctx.badRequest('invalid id');

    const service = strapi.plugin('strapi-dbview').service('saved-query') as {
      delete(id: number, userId: number): Promise<unknown>;
    };

    const deleted = await service.delete(id, userId);
    if (!deleted) return ctx.notFound();

    ctx.body = { success: true };
  },
});
