import type { Core } from '@strapi/strapi';

export default ({ strapi: _strapi }: { strapi: Core.Strapi }) => {
  // No custom register logic needed; plugin config, routes, and services are
  // wired through the plugin index.
};
