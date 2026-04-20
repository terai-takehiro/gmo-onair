import { useAuth } from './useAuth';

export function usePermissions() {
  const { loading, hasPermission } = useAuth();

  return {
    hasPermission,
    canView:           hasPermission('liveops', 'reader'),
    canManage:         hasPermission('liveops', 'manager'),
    permissionsLoading: loading,
  };
}
