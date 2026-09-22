import { useAuth } from './useAuth';

/**
 * Wiki の権限（区分 `wiki`）。閲覧は全員の既定（docs/design/v4/wiki.md §8）。
 * 段A では canView しか使わないが、段B 以降で editor / manager を見るので
 * 3段そろえて出しておく（あとから足すと呼ぶ側の import が散る）。
 */
export function usePermissions() {
  const { loading, hasPermission } = useAuth();

  return {
    hasPermission,
    canView:            hasPermission('wiki', 'reader'),
    canEdit:            hasPermission('wiki', 'editor'),
    canManage:          hasPermission('wiki', 'manager'),
    permissionsLoading: loading,
  };
}
