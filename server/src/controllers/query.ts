import type { Core } from '@strapi/strapi';
import type { Context } from 'koa';

const MAX_SQL_LENGTH = 50_000;

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async execute(ctx: Context) {
    const { sql, limit, connection } = ctx.request.body as {
      sql?: string;
      limit?: number;
      connection?: string;
    };

    if (!sql || typeof sql !== 'string' || sql.trim() === '') {
      return ctx.badRequest('sql is required');
    }

    if (sql.length > MAX_SQL_LENGTH) {
      return ctx.badRequest('sql exceeds maximum allowed length');
    }

    const userId = ctx.state.user?.id ?? null;
    const service = strapi.plugin('strapi-dbview').service('query') as {
      executeQuery(sql: string, limit: number, userId: number | null, connection?: string): Promise<{ rejected?: true; reason?: string; data?: unknown }>;
    };

    const result = await service.executeQuery(
      sql,
      typeof limit === 'number' ? limit : 100,
      userId,
      typeof connection === 'string' ? connection : 'default'
    );

    // A policy rejection is an expected result the user should see, not a
    // transport error. Return 200 with an { error } field so the client renders
    // the reason instead of throwing on a non-2xx status.
    if ('rejected' in result && result.rejected) {
      ctx.body = { error: result.reason };
      return;
    }

    ctx.body = result;
  },

  async explain(ctx: Context) {
    const { sql, type, connection } = ctx.request.body as {
      sql?: string;
      type?: 'explain' | 'explain-analyze';
      connection?: string;
    };

    if (!sql || typeof sql !== 'string' || sql.trim() === '') {
      return ctx.badRequest('sql is required');
    }

    if (sql.length > MAX_SQL_LENGTH) {
      return ctx.badRequest('sql exceeds maximum allowed length');
    }

    const explainType = type === 'explain-analyze' ? 'explain-analyze' : 'explain';
    const userId = ctx.state.user?.id ?? null;
    const service = strapi.plugin('strapi-dbview').service('query') as {
      explainQuery(sql: string, type: 'explain' | 'explain-analyze', userId: number | null, connection?: string): Promise<{ rejected?: true; reason?: string; type?: string; columns?: string[]; rows?: unknown[]; durationMs?: number }>;
    };

    const result = await service.explainQuery(
      sql,
      explainType,
      userId,
      typeof connection === 'string' ? connection : 'default'
    );

    if ('rejected' in result && result.rejected) {
      ctx.body = { error: result.reason };
      return;
    }

    ctx.body = result;
  },
});
