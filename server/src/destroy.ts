import type { Core } from '@strapi/strapi';

export default ({ strapi: _strapi }: { strapi: Core.Strapi }) => {
  // No cleanup needed on destroy.
};
