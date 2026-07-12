import { useRBAC } from '@strapi/strapi/admin';
import { PLUGIN_ID } from '../pluginId';

const ACTION = (uid: string) => `plugin::${PLUGIN_ID}.${uid}`;

const PERMISSIONS = {
  browse: [{ action: ACTION('browse') }],
  query: [{ action: ACTION('query') }],
  historyRead: [{ action: ACTION('history.read') }],
  savedQueriesManage: [{ action: ACTION('saved-queries.manage') }],
};

export const useBrowsePermission = () => {
  const { allowedActions, isLoading } = useRBAC(PERMISSIONS.browse);
  return { canBrowse: allowedActions.canBrowse ?? false, isLoading };
};

export const useQueryPermission = () => {
  const { allowedActions, isLoading } = useRBAC(PERMISSIONS.query);
  return { canQuery: allowedActions.canQuery ?? false, isLoading };
};

export const useHistoryPermission = () => {
  const { allowedActions, isLoading } = useRBAC(PERMISSIONS.historyRead);
  return { canViewHistory: allowedActions.canHistoryRead ?? false, isLoading };
};

export const useSavedQueriesPermission = () => {
  const { allowedActions, isLoading } = useRBAC(PERMISSIONS.savedQueriesManage);
  return { canManageSavedQueries: allowedActions.canSavedQueriesManage ?? false, isLoading };
};
