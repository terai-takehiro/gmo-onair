/**
 * 制作技術支援のトップ（`/qsheet/top`）。
 *
 * 「制作技術支援」の入口は**まず番組・イベントを選ぶこと**（2026-08-22・ご指摘で
 * 構成を訂正）。選び方は2つ:
 *
 *   ① 案件管理で管理している番組・イベント（GLS案件）を選ぶ
 *   ② 案件管理に無い、ここだけの番組を作る／選ぶ（マニュアル・`qsheet_programs`）
 *
 * どちらを選んでも、その先は**同じハブ画面**（`JourneyPage.tsx`・
 * `/qsheet/projects/:id` または `/qsheet/programs/:id`）に着地する。ハブ画面が
 * ミニアプリ（進行台本＝Qシート・スケジュール表・収録設定・配信設定…）への
 * 入口をタイルで見せる。**ミニアプリの一覧を直接ここに並べない** — 押しても
 * 「どの番組の？」が定まらないため（旧実装の誤り。当時の記録は git 履歴参照）。
 *
 * ミニアプリの名前・並び順は `shared/src/production/miniapps.ts` の
 * `MINI_APPS`（唯一の正）から読む。
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Building2, Sparkles, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import { Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifyError } from '@/lib/notify';
import * as programsApi from '@/lib/programsApi';
import type { GlsProject } from './sheets/types';

export default function ProductionTopPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const projectsQuery = useQuery({
    queryKey: ['gls-options'],
    queryFn: async () => (await api.get<{ success: boolean; data: GlsProject[] }>('/lookup/gls-options')).data.data,
  });
  const programsQuery = useQuery({
    queryKey: ['qsheet-programs'],
    queryFn: () => programsApi.listPrograms(),
  });

  const q = search.trim();
  const projects = (projectsQuery.data ?? []).filter((p) =>
    !q || p.gls_number.includes(q) || p.name.includes(q) || (p.customer_name ?? '').includes(q));
  const programs = (programsQuery.data ?? []).filter((p) => !q || p.name.includes(q));

  const loading = projectsQuery.isLoading || programsQuery.isLoading;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader title="制作技術支援" sub="番組・イベントを選ぶと、台本づくり・スケジュール表・収録配信の設定が開けます" />

      <div className="mt-4">
        <Input
          className="min-h-[44px]"
          placeholder="案件名・GLS番号・番組名でさがす"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && (
        <div className="mt-6"><Delayed><SkeletonRows rows={4} /></Delayed></div>
      )}

      {!loading && (
        <div className="mt-6 flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <div className="flex items-baseline gap-1.5">
              <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-h2">案件管理の番組・イベント</h2>
            </div>
            {projects.length === 0 ? (
              <EmptyState
                title={q ? '該当する案件がありません' : 'GLS番号の付いた案件がまだありません'}
                description={q ? '別の言葉でさがすか、下の「ここだけの番組」を使ってください。' : '受注が確定するとここに出るようになります。'}
              />
            ) : (
              <div className="flex flex-col overflow-hidden rounded-card border border-border">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => navigate(`/qsheet/projects/${p.id}`)}
                    className="flex min-h-[52px] items-center gap-3 border-b border-border-faint px-4 py-2.5 text-left last:border-b-0 hover:bg-muted/50 active:bg-muted"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="text-list block truncate font-bold">{p.name}</span>
                      <span className="text-sub-sm block text-muted-foreground">
                        {p.gls_number}{p.customer_name ? ` ・ ${p.customer_name}` : ''}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-baseline gap-1.5">
                <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <h2 className="text-h2">ここだけの番組（マニュアル）</h2>
              </div>
              <Button size="sm" className="min-h-[44px]" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1 h-4 w-4" />番組を作る
              </Button>
            </div>
            <p className="text-sub text-muted-foreground">案件管理に登録していない番組・イベント用です。案件が決まったら案件管理側で改めて登録してください。</p>
            {programs.length === 0 ? (
              <EmptyState
                title={q ? '該当する番組がありません' : 'ここだけの番組はまだありません'}
                description="「番組を作る」から作れます。"
              />
            ) : (
              <div className="flex flex-col overflow-hidden rounded-card border border-border">
                {programs.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => navigate(`/qsheet/programs/${p.id}`)}
                    className="flex min-h-[52px] items-center gap-3 border-b border-border-faint px-4 py-2.5 text-left last:border-b-0 hover:bg-muted/50 active:bg-muted"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="text-list block truncate font-bold">{p.name}</span>
                      {p.event_date && <span className="text-sub-sm block text-muted-foreground">{p.event_date}</span>}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <CreateProgramDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(p) => navigate(`/qsheet/programs/${p.id}`)} />
    </div>
  );
}

function CreateProgramDialog({
  open, onOpenChange, onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (program: programsApi.ProgramRow) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [eventDate, setEventDate] = useState('');

  const createMutation = useMutation({
    mutationFn: () => programsApi.createProgram({ name: name.trim(), event_date: eventDate || null }),
    onSuccess: (program) => {
      queryClient.invalidateQueries({ queryKey: ['qsheet-programs'] });
      onOpenChange(false);
      setName('');
      setEventDate('');
      onCreated(program);
    },
    onError: () => notifyError('作成に失敗しました'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>ここだけの番組を作る</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (name.trim()) createMutation.mutate(); }}>
          <div>
            <Label htmlFor="new-program-name">番組名 <span className="text-destructive">*</span></Label>
            <Input id="new-program-name" className="mt-1 min-h-[44px]" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="例：サンプル情報バラエティ" />
          </div>
          <div>
            <Label htmlFor="new-program-date">実施日（任意）</Label>
            <Input id="new-program-date" type="date" className="mt-1 min-h-[44px]" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" className="min-h-[44px]" disabled={!name.trim() || createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : '作る'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
