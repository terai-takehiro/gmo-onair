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
 * 1本で返す。
 *
 * ── 何を・どの順で出すか（2026-09-08 のご指示で整理し直した）──────────
 *
 *   ① **制作物にならない案件は出さない。** 工事・構築のプロジェクト（旧 `GLS-B###`・
 *      改番後の `GMO-####`）と失注は**サーバー側**で外す（`top.routes.ts`）。
 *      「番組・イベントを選ぶ入口」に第3本社プロジェクトのような案件が混ざっていた
 *   ② **並びは放送順**（本番日の昇順）。日程が未定のものだけ最後にまとめる
 *   ③ **行には必ず本番日を出す**（未定なら「日程未定」と書く）。以前は日付を
 *      1つも出していなかったため、なぜその順なのかが画面から読めなかった
 *   ④ **終わったものはアーカイブへ畳む**（`view: 'archive'` で見る）。最後の回の
 *      翌日から。**日付を1つも持たない案件はステージで判断する**（実施済・完了は
 *      畳む）— 以前は日付が無いだけで永久に本体へ残っていた
 *
 * ①以外の組み立て（絞り込み・並び替え・アーカイブ判定・「いつ」の決め方）は
 * `pages/top/topHelpers.ts` に切り出した純粋関数を使う。
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
  eligibleRecents,
} from './top/topHelpers';

export default function ProductionTopPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState<Segment>('all');
  const [view, setView] = useState<TopView>('active');
  const [createOpen, setCreateOpen] = useState(false);

  const itemsQuery = useQuery({ queryKey: ['qsheet-top-items'], queryFn: listTopItems });
  /**
   * ⚠️ **`?? []` をそのまま置かないこと。** 読み込み中は毎回**別の空配列**になり、
   * これを見ている `useMemo`（絞り込み・並び・履歴の突き合わせ）が描き直しのたびに
   * 走り直します（履歴は `localStorage` を読むので特に無駄）。
   */
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const loading = itemsQuery.isLoading;

  const bySegment = useMemo(() => items.filter((it) => matchesSegment(it, segment)), [items, segment]);
  const active = useMemo(() => bySegment.filter((it) => !isArchived(it)), [bySegment]);
  const archived = useMemo(() => bySegment.filter((it) => isArchived(it)), [bySegment]);

  const upNext = useMemo(() => upcomingItems(active), [active]);
  /**
   * 「最近開いた項目」は端末の履歴（`localStorage`）だが、**この一覧に出ないものは出さない**
   * （サーバーで外した工事・構築のプロジェクト・失注が履歴にだけ残るため・Codex P2）。
   * 絞り込み（`segment`）やアーカイブとは無関係に、`items` 全体と突き合わせる —
   * 終わった番組でも「さっき開いたもの」には出てよい。
   */
  const recentEntries = useMemo(
    () => eligibleRecents(listRecentTop(), items).slice(0, 4),
    [items],
  );

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
    <div className="px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="制作技術支援"
        sub="番組・イベントを選ぶと、台本制作・スケジュール表・収録配信の設定が開けます"
        primaryAction={(
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />番組を作成
          </Button>
        )}
      />

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          className="min-h-[44px] sm:max-w-sm"
          placeholder="案件名・GLS番号・番組名で検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <SegmentControl value={segment} onChange={setSegment} />
      </div>

      {loading && (
        <div className="mt-6"><Delayed><SkeletonRows rows={4} /></Delayed></div>
      )}

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
    </div>
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
    <div className="mt-6 flex flex-col gap-6">
      <UpNextSection items={upNext} onNavigate={onNavigate} />
      <RecentSection entries={recentEntries} onNavigate={onNavigate} />

      <section className="flex flex-col gap-2">
        {mainList.length > 0 && (
          <h2 className="text-sub-sm font-bold tracking-wide text-muted-foreground">
            本番・放送の予定（日付順）
          </h2>
        )}
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
    <div className="mt-6 flex flex-col gap-3">
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
            <TopItemRow key={`${it.kind}-${it.id}`} item={it} onNavigate={onNavigate} />
          ))}
        </div>
      )}

      <p className="text-note text-muted-foreground">
        本番日（実施日）の翌日から、自動でここに入ります。日付が入っていないものは、
        案件が「実施済」「完了」になった時点でここへ移ります。
      </p>
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
