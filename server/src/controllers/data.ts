import type { Core } from '@strapi/strapi';
import type { Context } from 'koa';
import type { BrowseOptions } from '../types';

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async browse(ctx: Context) {
    const { tableName } = ctx.params as { tableName: string };
    const q = ctx.query as Record<string, string>;

    if (!tableName || typeof tableName !== 'string') {
      return ctx.badRequest('tableName is required');
    }

    const page = Math.max(1, parseInt(q.page ?? '1', 10) || 1);
    const pageSize = Math.max(1, parseInt(q.pageSize ?? '50', 10) || 50);

    let sort: BrowseOptions['sort'];
    if (q.sortColumn) {
      sort = {
        column: q.sortColumn,
        direction: q.sortDirection === 'desc' ? 'desc' : 'asc',
      };
    }

    let filters: BrowseOptions['filters'];
    if (q.filters) {
      try {
        filters = JSON.parse(q.filters) as BrowseOptions['filters'];
      } catch {
        filters = undefined;
      }
    }

    const userId = ctx.state.user?.id ?? null;
    const service = strapi.plugin('strapi-dbview').service('data') as {
      browseTable(table: string, opts: BrowseOptions, userId: number | null): Promise<unknown>;
    };

    const result = await service.browseTable(tableName, { page, pageSize, sort, filters }, userId);

    if (!result) {
      return ctx.notFound('Table not found or not accessible');
    }

    ctx.body = result;
  },

  async relatedRows(ctx: Context) {
    const { tableName, column } = ctx.params as { tableName: string; column: string };
    const { value } = ctx.query as { value?: string };

    if (!tableName || !column) {
      return ctx.badRequest('tableName and column are required');
    }

    const service = strapi.plugin('strapi-dbview').service('data') as {
      relatedRows(table: string, col: string, val: unknown): Promise<unknown[]>;
    };

    const rows = await service.relatedRows(tableName, column, value);
    ctx.body = { rows };
  },
});
