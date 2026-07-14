import { useAuth } from './useAuth';

export function usePermissions() {
  const { loading, hasPermission } = useAuth();

  return {
    hasPermission,
    canView:            hasPermission('dailyops', 'reader'),
    canEdit:            hasPermission('dailyops', 'editor'),
    canManage:          hasPermission('dailyops', 'manager'),
    permissionsLoading: loading,
  };
}
