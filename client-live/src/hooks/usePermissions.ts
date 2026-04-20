import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuth } from './useAuth';

const LEVEL = { reader: 1, exporter: 1, editor: 2, manager: 3, owner: 3 } as const;
type Level = keyof typeof LEVEL;

export function usePermissions() {
  const { currentUser } = useAuth();

  const { data: permissions = [], isPending } = useQuery({
    queryKey: ['me-permissions'],
    queryFn: async () => {
      const r = await api.get('/users/me/permissions');
      return r.data.data as Array<{ module: string; access_level: string }>;
    },
    enabled: !!currentUser,
    staleTime: 5 * 60 * 1000,
  });

  function hasPermission(module: string, minLevel: Level = 'reader'): boolean {
    if (currentUser?.role === 'system_admin') return true;
    const p = permissions.find(p => p.module === module);
    return !!p && ((LEVEL[p.access_level as Level] ?? 0) >= LEVEL[minLevel]);
  }

  const canView   = hasPermission('liveops', 'reader');
  const canManage = hasPermission('liveops', 'manager');

  // isPending is true while no data (including when query is disabled / currentUser not yet loaded)
  return { hasPermission, canView, canManage, permissionsLoading: isPending };
}
