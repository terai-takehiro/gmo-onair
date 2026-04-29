import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Link } from 'react-router-dom';
import { Timer, Tv2, Search, Settings, ChevronRight, FolderOpen } from 'lucide-react';

interface Project { id: string; name: string; gls_number?: string | null }
interface TimerItem  { id: string; project_id?: string | null }
interface ProgramItem { id: string; project_id?: string | null }

export default function ProjectSelectorPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const { data: projects = [], isLoading: projLoading } = useQuery({
    queryKey: ['projects-list'],
    queryFn: async () => {
      const r = await api.get('/projects?limit=200');
      const raw = r.data.data;
      return (Array.isArray(raw) ? raw : (raw?.items ?? [])) as Project[];
    },
    staleTime: 60_000,
  });

  const { data: timers = [] } = useQuery({
    queryKey: ['timers'],
    queryFn: () => api.get('/liveops/timers').then(r => r.data.data as TimerItem[]),
    staleTime: 30_000,
  });

  const { data: programs = [] } = useQuery({
    queryKey: ['programs'],
    queryFn: () => api.get('/liveops/programs').then(r => r.data.data as ProgramItem[]),
    staleTime: 30_000,
  });

  const timerCountByProject = timers.reduce<Record<string, number>>((acc, t) => {
    if (t.project_id) acc[t.project_id] = (acc[t.project_id] ?? 0) + 1;
    return acc;
  }, {});

  const programCountByProject = programs.reduce<Record<string, number>>((acc, p) => {
    if (p.project_id) acc[p.project_id] = (acc[p.project_id] ?? 0) + 1;
    return acc;
  }, {});

  const filtered = projects.filter(p =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.gls_number ?? '').toLowerCase().includes(search.toLowerCase())
  );

  // Sort: projects with existing liveops data first
  const sorted = [...filtered].sort((a, b) => {
    const aHas = (timerCountByProject[a.id] ?? 0) + (programCountByProject[a.id] ?? 0);
    const bHas = (timerCountByProject[b.id] ?? 0) + (programCountByProject[b.id] ?? 0);
    return bHas - aHas;
  });

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Page header */}
      <div className="border-b border-border px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
              <Timer className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-bold">計時LIVE</h1>
              <p className="text-xs text-muted-foreground">案件を選択して配信管理を開始</p>
            </div>
          </div>
          <Link to="/settings" className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">設定</span>
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="案件名・GLS番号で検索..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-card pl-9 pr-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {projLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-7 w-7 animate-spin rounded-full border-3 border-primary border-t-transparent" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FolderOpen className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm">{search ? '該当する案件がありません' : '案件がありません'}</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {sorted.map(p => {
                const tc = timerCountByProject[p.id] ?? 0;
                const pc = programCountByProject[p.id] ?? 0;
                const hasData = tc + pc > 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/p/${p.id}`)}
                    className="group w-full flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3.5 text-left transition-all hover:border-primary/40 hover:bg-accent"
                  >
                    {/* GLS badge */}
                    <div className={`shrink-0 rounded-md px-2 py-1 text-xs  font-bold ${hasData ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {p.gls_number ?? '---'}
                    </div>

                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      {hasData && (
                        <div className="flex items-center gap-3 mt-0.5">
                          {tc > 0 && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Timer className="h-3 w-3" />{tc}
                            </span>
                          )}
                          {pc > 0 && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Tv2 className="h-3 w-3" />{pc}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Arrow */}
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
