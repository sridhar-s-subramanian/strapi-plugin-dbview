import type { Core } from '@strapi/strapi';
import type { Context } from 'koa';

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async listTables(ctx: Context) {
    const service = strapi.plugin('strapi-dbview').service('schema') as {
      listTables(): Promise<Array<{ name: string; rowCount: number | null; columnCount: number }>>;
    };
    const tables = await service.listTables();
    ctx.body = { tables };
  },

  async getStructure(ctx: Context) {
    const { tableName } = ctx.params as { tableName: string };

    if (!tableName || typeof tableName !== 'string') {
      return ctx.badRequest('tableName is required');
    }

    const service = strapi.plugin('strapi-dbview').service('schema') as {
      getTableStructure(t: string): Promise<unknown>;
    };
    const structure = await service.getTableStructure(tableName);

    if (!structure) {
      return ctx.notFound('Table not found or not accessible');
    }

    ctx.body = { structure };
  },
});
