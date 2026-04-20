import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Radio, Plus, ChevronRight, Settings, Search, FolderOpen,
  Youtube, Globe, Link2, Unlink,
} from 'lucide-react';

interface LiveProgram {
  id: string;
  name: string;
  project_id: string | null;
  project_name?: string;
  gls_number?: string | null;
  youtube_urls: Array<{ label: string; url: string }>;
  jstream_lpid: string | null;
  hasSingularToken: boolean;
}
interface Project { id: string; name: string; gls_number?: string | null }

type CreateMode = 'gls' | 'standalone';

export default function SessionHomePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [mode, setMode] = useState<CreateMode>('gls');
  const [search, setSearch] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [programName, setProgramName] = useState('');

  const { data: programs = [], isLoading } = useQuery({
    queryKey: ['programs-all'],
    queryFn: () => api.get('/liveops/programs').then(r => r.data.data as LiveProgram[]),
    staleTime: 30_000,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list'],
    queryFn: async () => {
      const r = await api.get('/projects?limit=200');
      const raw = r.data.data;
      return (Array.isArray(raw) ? raw : (raw?.items ?? [])) as Project[];
    },
    enabled: dialogOpen && mode === 'gls',
    staleTime: 60_000,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/liveops/programs', {
      name: programName,
      projectId: mode === 'gls' ? (selectedProject?.id ?? null) : null,
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['programs-all'] });
      navigate(`/program/${res.data.data.id}`);
    },
  });

  const openDialog = () => {
    setMode('gls');
    setSearch('');
    setProjectSearch('');
    setSelectedProject(null);
    setProgramName('');
    setDialogOpen(true);
  };

  const filteredPrograms = programs.filter(p =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.gls_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (p.project_name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const filteredProjects = projects.filter(p =>
    !projectSearch ||
    p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
    (p.gls_number ?? '').toLowerCase().includes(projectSearch.toLowerCase())
  );

  const canCreate = programName.trim().length > 0;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Page header */}
      <div className="border-b border-border px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between max-w-3xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
              <Radio className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-bold">計時LIVE</h1>
              <p className="text-xs text-muted-foreground">配信セッションを選択または作成</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/settings" className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
              <Settings className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">設定</span>
            </Link>
            <Button size="sm" onClick={openDialog}>
              <Plus className="h-4 w-4 mr-1.5" />新規作成
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {/* Search */}
          {programs.length > 0 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="番組名・GLS番号で検索..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full rounded-lg border border-border bg-card pl-9 pr-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-7 w-7 animate-spin rounded-full border-3 border-primary border-t-transparent" />
            </div>
          ) : filteredPrograms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground space-y-4">
              <FolderOpen className="h-10 w-10 opacity-40" />
              <p className="text-sm">{search ? '該当する番組がありません' : 'セッションがまだありません'}</p>
              {!search && (
                <Button onClick={openDialog}>
                  <Plus className="h-4 w-4 mr-1.5" />最初のセッションを作成
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredPrograms.map(p => (
                <button
                  key={p.id}
                  onClick={() => navigate(`/program/${p.id}`)}
                  className="group w-full flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3.5 text-left transition-all hover:border-primary/40 hover:bg-accent"
                >
                  {/* GLS badge or standalone indicator */}
                  <div className={`shrink-0 rounded-md px-2 py-1 text-xs font-mono font-bold ${
                    p.gls_number ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                  }`}>
                    {p.gls_number ?? 'STA'}
                  </div>

                  {/* Name + meta */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {p.project_name && (
                        <span className="text-xs text-muted-foreground truncate">{p.project_name}</span>
                      )}
                      <div className="flex items-center gap-2 shrink-0">
                        {p.youtube_urls.length > 0 && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Youtube className="h-3 w-3" />{p.youtube_urls.length}
                          </span>
                        )}
                        {p.jstream_lpid && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Globe className="h-3 w-3" />JS
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Creation dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新規セッション作成</DialogTitle>
          </DialogHeader>

          {/* Mode selector */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { setMode('gls'); setSelectedProject(null); }}
              className={`flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors ${
                mode === 'gls'
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border hover:bg-accent'
              }`}
            >
              <Link2 className="h-4 w-4 shrink-0" />
              GLS案件に紐づける
            </button>
            <button
              onClick={() => { setMode('standalone'); setSelectedProject(null); }}
              className={`flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors ${
                mode === 'standalone'
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border hover:bg-accent'
              }`}
            >
              <Unlink className="h-4 w-4 shrink-0" />
              スタンドアロン
            </button>
          </div>

          {/* GLS project picker */}
          {mode === 'gls' && (
            <div className="space-y-2">
              <Label>GLS案件を選択</Label>
              {selectedProject ? (
                <div className="flex items-center justify-between rounded-lg border border-primary bg-primary/10 px-3 py-2">
                  <div className="min-w-0">
                    <span className="text-xs font-mono text-primary mr-2">{selectedProject.gls_number ?? '---'}</span>
                    <span className="text-sm font-medium truncate">{selectedProject.name}</span>
                  </div>
                  <button
                    onClick={() => setSelectedProject(null)}
                    className="ml-2 text-xs text-muted-foreground hover:text-foreground shrink-0"
                  >
                    変更
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      type="text"
                      placeholder="案件名・GLS番号で検索..."
                      value={projectSearch}
                      onChange={e => setProjectSearch(e.target.value)}
                      className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-md border border-border">
                    {filteredProjects.length === 0 ? (
                      <div className="py-6 text-center text-xs text-muted-foreground">案件が見つかりません</div>
                    ) : filteredProjects.map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setSelectedProject(p);
                          if (!programName) setProgramName(p.name);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent transition-colors border-b border-border last:border-0"
                      >
                        <span className="font-mono text-xs text-muted-foreground w-16 shrink-0">{p.gls_number ?? '---'}</span>
                        <span className="truncate">{p.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Program name */}
          <div className="space-y-1.5">
            <Label>番組名</Label>
            <Input
              placeholder="例: 定期ライブ配信、社内イベント..."
              value={programName}
              onChange={e => setProgramName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && canCreate) createMutation.mutate(); }}
              autoFocus={mode === 'standalone'}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!canCreate || createMutation.isPending}
            >
              作成して開始
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
