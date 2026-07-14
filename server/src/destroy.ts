import type { Core } from '@strapi/strapi';

export default async ({ strapi }: { strapi: Core.Strapi }) => {
  try {
    const connection = strapi.plugin('strapi-dbview').service('connection') as {
      destroy(): Promise<void>;
    };
    await connection.destroy();
  } catch {
    // Plugin may already be torn down; never block process exit.
  }
};
