/**
 * 制作技術支援のトップ（`/techops/top`）。
 *
 * 「制作技術支援」の入口は**まず番組・イベントを選ぶこと**（2026-08-22・ご指摘で
 * 構成を訂正）。選び方は2つ:
 *
 *   ① 案件管理で管理している番組・イベント（GLS案件）を選ぶ
 *   ② 案件管理に無い、ここだけの番組を作る／選ぶ（マニュアル・`qsheet_programs`）
 *
 * どちらを選んでも、その先は**同じハブ画面**（`JourneyPage.tsx`・
 * `/techops/projects/:id` または `/techops/programs/:id`）に着地する。ハブ画面が
 * ミニアプリ（進行台本＝Qシート・スケジュール表・収録設定・配信設定…）への
 * 入口をタイルで見せる。**ミニアプリの一覧を直接ここに並べない** — 押しても
 * 「どの番組の？」が定まらないため（旧実装の誤り。当時の記録は git 履歴参照）。
 *
 * データは `listTopItems()`（`/techops/top-items`）が GLS案件＋ここだけの番組を
 * 1本で返す。**「最後の回の翌日」を過ぎた項目はアーカイブ扱い**にし、既定では
 * 隠す（`view: 'archive'` で切り替えて見る）。`last_date` が無い項目（GLS-B系・
 * 実施日未定の番組）は終了しない扱い。
 *
 * 一覧の組み立て（絞り込み・並び替え・アーカイブ判定）は `pages/top/topHelpers.ts`
 * に切り出した純粋関数を使う。
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { PageShell } from '@gmo-onair/shared/src/client/ui/pageShell';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import { Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifyError } from '@/lib/notify';
import * as programsApi from '@/lib/programsApi';
import { listTopItems } from '@/lib/topApi';
import { listRecentTop } from '@/lib/recentTop';
import { SegmentControl } from './top/SegmentControl';
import { UpNextSection } from './top/UpNextRow';
import { RecentSection } from './top/RecentRow';
import { TopItemRow, ArchiveFooterRow, ArchiveSearchHintRow } from './top/TopListSection';
import {
  type Segment, type TopView,
  isArchived, matchesSegment, matchesSearch, sortMainList, upcomingItems, sortArchive,
} from './top/topHelpers';

export default function ProductionTopPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState<Segment>('all');
  const [view, setView] = useState<TopView>('active');
  const [createOpen, setCreateOpen] = useState(false);

  const itemsQuery = useQuery({ queryKey: ['qsheet-top-items'], queryFn: listTopItems });
  const items = itemsQuery.data ?? [];
  const loading = itemsQuery.isLoading;

  const bySegment = useMemo(() => items.filter((it) => matchesSegment(it, segment)), [items, segment]);
  const active = useMemo(() => bySegment.filter((it) => !isArchived(it)), [bySegment]);
  const archived = useMemo(() => bySegment.filter((it) => isArchived(it)), [bySegment]);

  const upNext = useMemo(() => upcomingItems(active), [active]);
  const recentEntries = useMemo(() => listRecentTop().slice(0, 4), []);

  const mainList = useMemo(() => {
    const sorted = sortMainList(active);
    return search.trim() ? sorted.filter((it) => matchesSearch(it, search)) : sorted;
  }, [active, search]);

  const archiveList = useMemo(
    () => sortArchive(archived.filter((it) => matchesSearch(it, search))),
    [archived, search],
  );

  const archiveSearchHits = useMemo(
    () => (search.trim() ? archived.filter((it) => matchesSearch(it, search)).length : 0),
    [archived, search],
  );

  const goTo = (href: string) => navigate(href);

  return (
    <PageShell>
      <PageHeader
        title="制作技術支援"
        sub="番組・イベントを選ぶと、台本制作・スケジュール表・収録配信の設定が開けます"
        primaryAction={(
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />番組を作成
          </Button>
        )}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          className="min-h-tap sm:max-w-sm"
          placeholder="案件名・GLS番号・番組名で検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <SegmentControl value={segment} onChange={setSegment} />
      </div>

      {loading && <Delayed><SkeletonRows rows={4} /></Delayed>}

      {!loading && view === 'archive' && (
        <ArchiveView
          items={archiveList}
          onNavigate={goTo}
          onBack={() => setView('active')}
        />
      )}

      {!loading && view === 'active' && (
        <ActiveView
          upNext={upNext}
          recentEntries={recentEntries}
          mainList={mainList}
          archivedCount={archived.length}
          archiveSearchHits={archiveSearchHits}
          searching={!!search.trim()}
          onNavigate={goTo}
          onOpenArchive={() => setView('archive')}
        />
      )}

      <CreateProgramDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(p) => navigate(`/techops/programs/${p.id}`)} />
    </PageShell>
  );
}

function ActiveView({
  upNext, recentEntries, mainList, archivedCount, archiveSearchHits, searching, onNavigate, onOpenArchive,
}: {
  upNext: ReturnType<typeof upcomingItems>;
  recentEntries: ReturnType<typeof listRecentTop>;
  mainList: ReturnType<typeof sortMainList>;
  archivedCount: number;
  archiveSearchHits: number;
  searching: boolean;
  onNavigate: (href: string) => void;
  onOpenArchive: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <UpNextSection items={upNext} onNavigate={onNavigate} />
      <RecentSection entries={recentEntries} onNavigate={onNavigate} />

      <section className="flex flex-col gap-2">
        {mainList.length > 0 ? (
          <div className="flex flex-col overflow-hidden rounded-card border border-border">
            {mainList.map((it) => (
              <TopItemRow key={`${it.kind}-${it.id}`} item={it} onNavigate={onNavigate} />
            ))}
            {archivedCount > 0 && (
              <ArchiveFooterRow count={archivedCount} onOpenArchive={onOpenArchive} />
            )}
          </div>
        ) : searching && archiveSearchHits > 0 ? (
          <ArchiveSearchHintRow count={archiveSearchHits} onOpenArchive={onOpenArchive} />
        ) : (
          <EmptyState
            title={searching ? '条件に合う番組・イベントはありません' : 'まだ番組・イベントがありません'}
            description={searching ? '別の言葉で検索するか、「番組を作成」から新しく作れます。' : '受注が確定するか、「番組を作成」から作るとここに出ます。'}
          />
        )}
      </section>
    </div>
  );
}

function ArchiveView({
  items, onNavigate, onBack,
}: {
  items: ReturnType<typeof sortArchive>;
  onNavigate: (href: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onBack}
          className="min-h-tap inline-flex items-center gap-1 rounded-control-md px-1.5 text-sub font-bold text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />戻る
        </button>
      </div>
      <h2 className="text-h2">アーカイブ（終了した番組・イベント）</h2>

      {items.length === 0 ? (
        <EmptyState
          title="条件に合う番組・イベントはありません"
          description="別の言葉で検索するか、絞り込みを変えてみてください。"
        />
      ) : (
        <div className="flex flex-col overflow-hidden rounded-card border border-border">
          {items.map((it) => (
            <TopItemRow key={`${it.kind}-${it.id}`} item={it} onNavigate={onNavigate} showLastDate />
          ))}
        </div>
      )}

      <p className="text-note text-muted-foreground">本番日（実施日）の翌日から、自動でここに入ります。</p>
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
      queryClient.invalidateQueries({ queryKey: ['qsheet-top-items'] });
      onOpenChange(false);
      setName('');
      setEventDate('');
      onCreated(program);
    },
    onError: () => notifyError('番組を作れませんでした。少し待ってから、もう一度お試しください。'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>番組を作成</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (name.trim()) createMutation.mutate(); }}>
          <div>
            <Label htmlFor="new-program-name">番組名 <span className="text-destructive">*</span></Label>
            <Input id="new-program-name" className="mt-1 min-h-tap" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="例：サンプル情報バラエティ" />
          </div>
          <div>
            <Label htmlFor="new-program-date">実施日（任意）</Label>
            <Input id="new-program-date" type="date" className="mt-1 min-h-tap" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" className="min-h-tap" disabled={!name.trim() || createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : '作る'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
