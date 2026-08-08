/**
 * ③ 案件一覧 (v4)
 *
 * モックの「リスト・ボード・ネタの3つの見え方。切り替えても絞り込みは効いたまま」を
 * そのまま実装しています。**同じ問い合わせの結果を並べ替えているだけ**なので、
 * リストとボードで件数・金額が食い違いません
 * (旧実装はボードが別画面 `/sales/pipeline` で別のエンドポイントを叩いており、
 *  一覧は確定売上・ボードは想定金額を合計していて数字が合いませんでした)。
 *
 * ── 「ネタ」の見え方 ────────────────────────────────────────
 *
 * 3つ目の見え方は**列が違います**（お客様 ／ 要点 ／ 入口 ／ 確信 ／ 状態 ／ 受けた日）。
 * ネタは金額も実施日もほとんど空なので、リストと同じ列だと空欄が並ぶだけです。
 * 入口と確信は migration 165 で足した列で、**AI が起票したときだけ入っています**。
 *
 * この見え方は**ステージを「ネタ」に固定します**（見送りも見えるように失注も含む）。
 * ステージのチップは押せなくなります — 「ネタの見え方」で「受注済」を選ぶのは
 * 意味を持たないためです。
 *
 * ── スマホ（③・モックの端末枠 3枚目） ──────────────────────
 *
 * **絞り込みと問い合わせは1つのまま、行の描き方だけ差し替えます**
 * （`projectList/ProjectCards.tsx`）。画面をもう1枚作ると、
 * 検索・ステージ・並び順・期間の4つを2か所で直すことになります。
 *
 * スマホで変えるのは3つだけ:
 *   ① 行 → **カード**（PC の行は狭いと実施日・次のタスク・最後の動きが消え、
 *      「次に何をするか」が読めなくなる）
 *   ② **ボードを出さない。** 5列のかんばんは 375px では1列ぶんも入らない。
 *      押せるように見せて横スクロールにすると、指の当たり所が無くなる
 *   ③ **Excel の書き出しを出さない**（端末に落としても開く先が無い）
 */
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, List, LayoutGrid, Inbox } from 'lucide-react';
import api from '@/lib/api';
import { localDateStr } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { EmptyState, NoSearchResults, Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import ExcelToolbar from '@/components/ExcelToolbar';
import { STAGE_CHIPS } from './projectList/stages';
import { ProjectRow, ProjectRowsHeader } from './projectList/ProjectRows';
import { ProjectBoard } from './projectList/ProjectBoard';
import { SeedRow, SeedRowsHeader } from './projectList/SeedRows';
import { FilterBar, TermHint, SORT_OPTIONS, type EventPeriodMode } from './projectList/FilterBar';
import { MobileFilterBar } from './projectList/MobileFilterBar';
import { ProjectCards } from './projectList/ProjectCards';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { PcOnlyNote } from '@gmo-onair/shared/src/client-v4/pcOnly';
import type { ProjectListResponse } from './projectList/types';

/** 1ページの件数。ボードは列に並べるので**まとめて取る** (5列に 20 件だと各列 4 件しか出ない) */
const PAGE_SIZE = 20;
const BOARD_SIZE = 200;

export default function ProjectListPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const rawView = params.get('view');
  const rawViewKey: 'list' | 'board' | 'seed' =
    rawView === 'board' ? 'board' : rawView === 'seed' ? 'seed' : 'list';
  // **スマホではボードをリストに落とす。** `/sales/pipeline` からの転送で
  // `?view=board` が付いたままスマホで開かれることがある
  const view: 'list' | 'board' | 'seed' =
    isMobile && rawViewKey === 'board' ? 'list' : rawViewKey;
  const setView = (v: 'list' | 'board' | 'seed') => {
    const next = new URLSearchParams(params);
    if (v === 'list') next.delete('view'); else next.set('view', v);
    setParams(next, { replace: true });
  };

  const [stageKey, setStageKey] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(SORT_OPTIONS[0].value);
  const [aiOnly, setAiOnly] = useState(false);
  const [aiUnreviewedOnly, setAiUnreviewedOnly] = useState(true);
  const [termOpen, setTermOpen] = useState(false);

  const now = useMemo(() => new Date(), []);
  const today = localDateStr(now);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const [eventMode, setEventMode] = useState<EventPeriodMode>('half');
  const [eventMonth, setEventMonth] = useState(`${now.getFullYear()}-${pad2(now.getMonth() + 1)}`);
  const [eventYear, setEventYear] = useState(now.getFullYear());
  const [eventQuarter, setEventQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);

  // 何か触ったら1ページ目に戻す。戻さないと「3ページ目のまま 0 件」になる
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  /** 実施期間 (YYYY-MM-DD)。'all' は絞らない */
  const eventRange = useMemo(() => {
    if (eventMode === 'all') return null;
    if (eventMode === 'month') return { from: `${eventMonth}-01`, to: `${eventMonth}-31` };
    if (eventMode === 'quarter') {
      const sm = (eventQuarter - 1) * 3 + 1;
      return { from: `${eventYear}-${pad2(sm)}-01`, to: `${eventYear}-${pad2(sm + 2)}-31` };
    }
    if (eventMode === 'year') return { from: `${eventYear}-01-01`, to: `${eventYear}-12-31` };
    // half: 今月〜半年先 (今月初日 〜 6ヶ月先の月末)
    const end = new Date(now.getFullYear(), now.getMonth() + 7, 0);
    return { from: `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`, to: localDateStr(end) };
  }, [eventMode, eventMonth, eventYear, eventQuarter, now]);

  // **「ネタ」の見え方はステージを固定する。** 見送り (`e_lost`) も出すのは、
  // モックが「過去のネタと見送りもここで探せます」と書いているため
  const stages = view === 'seed'
    ? ['neta', 'e_lost']
    : STAGE_CHIPS.find((c) => c.key === stageKey)?.stages ?? [];
  const [sortKey, sortDir] = sort.split(':');
  const limit = view === 'board' ? BOARD_SIZE : PAGE_SIZE;

  const { data, isLoading } = useQuery<ProjectListResponse>({
    queryKey: ['projects', view, page, limit, search, stageKey, sort, eventRange?.from, eventRange?.to, aiOnly, aiUnreviewedOnly],
    queryFn: async () => {
      // **GLS-A（案件）だけ** (migration 179)。GLS-B はプロジェクト管理の一覧に出る。
      // サーバー側でも受付・タスク一覧・ダッシュボードに同じ絞り込みを入れてある
      const q: Record<string, string | number> = {
        page: view === 'board' ? 1 : page, limit, gls_category: 'A',
      };
      if (search) q.search = search;
      if (stages.length > 0) q.stage = stages.join(',');
      if (eventRange) { q.event_from = eventRange.from; q.event_to = eventRange.to; }
      if (aiOnly) {
        q.ai_created = 1;
        if (aiUnreviewedOnly) q.ai_reviewed = 'unreviewed';
      }
      q.sort_by = sortKey;
      q.sort_dir = sortDir;
      return (await api.get('/projects', { params: q })).data;
    },
  });

  const rows = data?.data ?? [];
  const pagination = data?.pagination;
  const counts = data?.stage_counts ?? {};
  const totalAll = STAGE_CHIPS.filter((c) => c.key !== 'all')
    .reduce((s, c) => s + c.stages.reduce((n, st) => n + (counts[st] ?? 0), 0), 0);

  const chips = STAGE_CHIPS.map((c) => ({
    key: c.key,
    label: c.label,
    // 件数はサーバーが「ステージ以外の絞り込みだけ」を掛けて数えたもの。
    // まだ読み込んでいないときは数字を出さない (0 と紛らわしいため)
    count: data ? (c.key === 'all' ? totalAll : c.stages.reduce((n, st) => n + (counts[st] ?? 0), 0)) : null,
  }));

  // 0件のときに「どれを外せば出るのか」を名指しするための一覧
  const activeFilters = [
    search ? `探している言葉: ${search}` : null,
    stageKey !== 'all' ? `ステージ: ${STAGE_CHIPS.find((c) => c.key === stageKey)?.label}` : null,
    eventMode !== 'all' ? '実施日: ' + (eventMode === 'half' ? '今月〜半年先' : '選んだ期間') : null,
    aiOnly ? `AI 作成のみ${aiUnreviewedOnly ? ' (未確認)' : ''}` : null,
  ].filter((f): f is string => f !== null);

  const clearFilters = () => {
    setSearch(''); setStageKey('all'); setEventMode('all'); setAiOnly(false); setPage(1);
  };

  return (
    <div className="space-y-3.5 p-4 lg:px-6 lg:pb-6 lg:pt-5">
      <PageHeader
        title="案件一覧"
        sub={pagination ? `${pagination.total}件 ・ 全員が同じものを見ています` : '全員が同じものを見ています'}
        primaryAction={
          <Button onClick={() => navigate('/sales/projects/new')}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />案件をつくる
          </Button>
        }
      >
        <div className="flex shrink-0 items-center gap-2">
          {!isMobile && <ExcelToolbar resource="/projects" name="案件" queryKey={['projects']} />}
          <div className="inline-flex overflow-hidden rounded-control border border-border" role="group" aria-label="見え方を切り替える">
            {(isMobile
              ? ([['list', 'リスト', List], ['seed', 'ネタ', Inbox]] as const)
              : ([['list', 'リスト', List], ['board', 'ボード', LayoutGrid], ['seed', 'ネタ', Inbox]] as const)
            ).map(([v, label, Icon], i) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`min-h-tap text-sub inline-flex items-center gap-1.5 px-3.5 lg:min-h-[40px] ${i > 0 ? 'border-l border-border' : ''} ${
                  view === v ? 'bg-primary-surface font-bold text-primary' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />{label}
              </button>
            ))}
          </div>
        </div>
      </PageHeader>

      {/* **「ネタ」の見え方ではステージのチップを出さない。** ステージは固定なので、
          押せるように見せると「押しても変わらない」ことになる */}
      {view !== 'seed' && (
        <FilterChips label="ステージで絞り込む" items={chips} value={stageKey} onChange={reset(setStageKey)} />
      )}

      {/*
        **スマホは絞り込みを1行に畳む**（M6）。PC の帯をそのまま縦に積むと
        約 450px になり、最初の案件に着くまで1画面の7割が枠でした（実測）。
        中身は同じ props を渡すだけで、絞り込みの仕組みは1つのままです
      */}
      {isMobile ? (
        <MobileFilterBar
          search={search} onSearch={reset(setSearch)}
          sort={sort} onSort={reset(setSort)}
          eventMode={eventMode} onEventMode={reset(setEventMode)}
          eventMonth={eventMonth} onEventMonth={reset(setEventMonth)}
          eventYear={eventYear} onEventYear={reset(setEventYear)}
          eventQuarter={eventQuarter} onEventQuarter={reset(setEventQuarter)}
          aiOnly={aiOnly} onAiOnly={reset(setAiOnly)}
          aiUnreviewedOnly={aiUnreviewedOnly} onAiUnreviewedOnly={reset(setAiUnreviewedOnly)}
          termOpen={termOpen} onTermOpen={setTermOpen}
        />
      ) : (
      <FilterBar
        search={search} onSearch={reset(setSearch)}
        sort={sort} onSort={reset(setSort)}
        eventMode={eventMode} onEventMode={reset(setEventMode)}
        eventMonth={eventMonth} onEventMonth={reset(setEventMonth)}
        eventYear={eventYear} onEventYear={reset(setEventYear)}
        eventQuarter={eventQuarter} onEventQuarter={reset(setEventQuarter)}
        aiOnly={aiOnly} onAiOnly={reset(setAiOnly)}
        aiUnreviewedOnly={aiUnreviewedOnly} onAiUnreviewedOnly={reset(setAiUnreviewedOnly)}
        termOpen={termOpen} onTermOpen={setTermOpen}
      />
      )}
      {termOpen && <TermHint onClose={() => setTermOpen(false)} />}

      {isLoading ? (
        <Delayed><SkeletonRows rows={6} /></Delayed>
      ) : rows.length === 0 ? (
        activeFilters.length > 0 ? (
          <NoSearchResults activeFilters={activeFilters} onClearFilters={clearFilters} />
        ) : (
          <EmptyState
            title="案件がまだありません"
            description="引き合いが届いたら受付から案件にします。ここから直接つくることもできます。"
            action={<Button onClick={() => navigate('/sales/projects/new')}><Plus className="mr-1 h-4 w-4" aria-hidden="true" />案件をつくる</Button>}
          />
        )
      ) : view === 'board' ? (
        <ProjectBoard rows={rows} today={today} onOpen={(id) => navigate(`/sales/projects/${id}`)} />
      ) : isMobile && view === 'list' ? (
        <ProjectCards rows={rows} today={today} onOpen={(id) => navigate(`/sales/projects/${id}`)} />
      ) : view === 'seed' ? (
        <>
          <div className="overflow-hidden rounded-card border border-border bg-card">
            <SeedRowsHeader />
            {rows.map((p) => (
              <SeedRow key={p.id} p={p} onOpen={() => navigate(`/sales/projects/${p.id}`)} />
            ))}
          </div>
          <p className="text-note text-muted-foreground">
            ネタは案件の数には入りません（ヨミにも乗りません）。
            引き合いを片づけるのは{' '}
            <button type="button" onClick={() => navigate('/sales/inbox')} className="font-bold text-primary hover:underline">
              受付
            </button>
            です。<strong className="font-bold">入口と確信は AI が起票したときだけ</strong>入ります
            （手で登録したものは「—」）。
          </p>
        </>
      ) : (
        <>
          <div className="overflow-hidden rounded-card border border-border bg-card">
            <ProjectRowsHeader />
            {rows.map((p) => (
              <ProjectRow key={p.id} p={p} today={today} onOpen={() => navigate(`/sales/projects/${p.id}`)} />
            ))}
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sub text-muted-foreground">
                全{pagination.total}件のうち{' '}
                <span className="font-number">{(pagination.page - 1) * pagination.limit + 1}</span>–
                <span className="font-number">{Math.min(pagination.page * pagination.limit, pagination.total)}</span>件
              </p>
              <div className="flex gap-2">
                <Button variant="outline" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>前へ</Button>
                <Button variant="outline" disabled={page >= pagination.totalPages} onClick={() => setPage((n) => n + 1)}>次へ</Button>
              </div>
            </div>
          )}
        </>
      )}

      {/*
        **画面ぜんぶを止めない。** リストは出せるので、出せないのはボードだけだと書く
        （`PcOnlyNote` は共通の帯。見た目と言い回しを10か所に散らさないため）
      */}
      {isMobile && rawViewKey === 'board' && (
        <PcOnlyNote
          what="ボード"
          why="5つのステージを横に並べるので、この幅では1列も入りません。いまはリストを出しています。"
        />
      )}

      {view === 'board' && rows.length >= BOARD_SIZE && (
        <p className="text-sub text-muted-foreground">
          ボードには{BOARD_SIZE}件までを並べています。実施日や言葉で絞り込んでください。
        </p>
      )}
    </div>
  );
}
