import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Youtube, ChevronDown, ChevronUp, Globe } from 'lucide-react';

interface YoutubeUrl { label: string; url: string }
interface Program {
  id: string; name: string; jstream_lpid: string | null;
  youtube_urls: YoutubeUrl[]; hasSingularToken: boolean;
  project_name?: string; gls_number?: string;
}

const emptyForm = { name: '', jstreamLpid: '', singularAppToken: '', youtubeUrls: [{ label: '', url: '' }] as YoutubeUrl[] };

export default function ProgramsPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Program | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: programs = [] } = useQuery({
    queryKey: ['programs'],
    queryFn: () => api.get('/liveops/programs').then(r => r.data.data as Program[]),
  });

  const openCreate = () => { setEditing(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (p: Program) => {
    setEditing(p);
    setForm({
      name: p.name,
      jstreamLpid: p.jstream_lpid ?? '',
      singularAppToken: '',
      youtubeUrls: p.youtube_urls.length > 0 ? p.youtube_urls : [{ label: '', url: '' }],
    });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name,
        jstreamLpid: form.jstreamLpid || null,
        singularAppToken: form.singularAppToken || undefined,
        youtubeUrls: form.youtubeUrls.filter(u => u.url.trim()),
      };
      if (editing) return api.put(`/liveops/programs/${editing.id}`, body);
      return api.post('/liveops/programs', body);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['programs'] }); setDialogOpen(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/liveops/programs/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['programs'] }),
  });

  const addYtUrl = () => setForm(f => ({ ...f, youtubeUrls: [...f.youtubeUrls, { label: '', url: '' }] }));
  const removeYtUrl = (i: number) => setForm(f => ({ ...f, youtubeUrls: f.youtubeUrls.filter((_, idx) => idx !== i) }));
  const updateYtUrl = (i: number, key: 'label' | 'url', v: string) =>
    setForm(f => ({ ...f, youtubeUrls: f.youtubeUrls.map((u, idx) => idx === i ? { ...u, [key]: v } : u) }));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b bg-card px-4 py-2">
        <h1 className="text-sm font-bold">番組管理</h1>
        <Button size="sm" className="h-7 text-xs" onClick={openCreate}>
          <Plus className="h-3 w-3 mr-1" /> 新規
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {programs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <p className="text-sm">番組がありません</p>
            <Button className="mt-3" size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />作成</Button>
          </div>
        )}

        {programs.map(p => (
          <div key={p.id} className="rounded-xl border bg-card">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  className="flex items-center gap-2 min-w-0"
                  onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                >
                  {expanded === p.id ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <span className="font-medium text-sm truncate">{p.name}</span>
                </button>
                <div className="flex flex-wrap gap-1">
                  {p.youtube_urls.length > 0 && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <Youtube className="h-3 w-3 text-red-500" />{p.youtube_urls.length}
                    </Badge>
                  )}
                  {p.jstream_lpid && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <Globe className="h-3 w-3 text-cyan-500" />JS
                    </Badge>
                  )}
                  {p.hasSingularToken && (
                    <Badge variant="secondary" className="text-xs">SL</Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(p)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  onClick={() => { if (confirm('削除しますか？')) deleteMutation.mutate(p.id); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {expanded === p.id && (
              <div className="border-t px-4 py-3 space-y-1.5 text-xs text-muted-foreground">
                {p.youtube_urls.map((u, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Youtube className="h-3 w-3 text-red-500 shrink-0" />
                    <span className="font-medium">{u.label || `URL ${i + 1}`}:</span>
                    <span className="truncate">{u.url}</span>
                  </div>
                ))}
                {p.jstream_lpid && (
                  <div className="flex items-center gap-2">
                    <Globe className="h-3 w-3 text-cyan-500 shrink-0" />
                    <span className="font-medium">Jstream LPID:</span>
                    <span>{p.jstream_lpid}</span>
                  </div>
                )}
                {p.project_name && (
                  <div>案件: {p.gls_number ? `[${p.gls_number}] ` : ''}{p.project_name}</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? '番組を編集' : '番組を作成'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>番組名</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ライブ配信番組名" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>YouTube URL</Label>
                <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={addYtUrl}>
                  <Plus className="h-3 w-3 mr-1" />追加
                </Button>
              </div>
              {form.youtubeUrls.map((u, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder="ラベル"
                    value={u.label}
                    onChange={e => updateYtUrl(i, 'label', e.target.value)}
                    className="w-24 shrink-0"
                  />
                  <Input
                    placeholder="https://youtube.com/watch?v=..."
                    value={u.url}
                    onChange={e => updateYtUrl(i, 'url', e.target.value)}
                    className="flex-1"
                  />
                  {form.youtubeUrls.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={() => removeYtUrl(i)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label>Jstream LPID</Label>
              <Input
                value={form.jstreamLpid}
                onChange={e => setForm(f => ({ ...f, jstreamLpid: e.target.value }))}
                placeholder="例: 123456"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Singular Live App Token{editing?.hasSingularToken ? ' (変更する場合のみ入力)' : ''}</Label>
              <Input
                type="password"
                value={form.singularAppToken}
                onChange={e => setForm(f => ({ ...f, singularAppToken: e.target.value }))}
                placeholder={editing?.hasSingularToken ? '変更する場合のみ入力' : 'App Token'}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={!form.name || saveMutation.isPending}>
                {editing ? '保存' : '作成'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
