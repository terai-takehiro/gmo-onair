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
 *
 * **ステージのチップから「E 問合せ」を外しました**（指示書 4-1）。
 * ネタ ＝ E 問合せで同じものなので、チップと見え方タブの両方にあると
 * 同じ案件が2か所から絞り込めて、しかも名前が違っていました。
 * ネタはこのタブが持ち、リスト・ボードの「すべて」には出しません。
 *
 * ── 絞り込みは全部、実データに効きます（指示書 4-2 / 4-3）────
 *
 *  ・ステージのチップ … 押すと行が絞られ、**件数バッジと「全N件」も同じ条件で連動**
 *  ・並び順 … おすすめ順 ／ 見積金額が大きい順 ／ 実施日が近い順 ／
 *             期限が近い順 ／ 最後の動きが古い順
 *  ・期間 … 月 → 四半期 → 半年 → 年 → 全件。**既定は半年（いま属する期）**
 *  ・AI作成のみ … `ai_created` でサーバー側が絞る
 *
 * ── 並びが変わるときは行が滑ります（指示書 6-1）─────────────
 *
 * 差し替えでパッと入れ替えると、同じ見た目の行が 20 個あるので
 * 「いま見ていた案件がどこへ行ったか」が読み取れません。
 * 変える**直前に位置を覚えて、更新後に1回だけ戻します**（`client-v4/flip.ts`）。
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
 *   ② **ボードを出さない。** 5列のかんばんは 375px では1列ぶんも入らない
 *   ③ **Excel の書き出しを出さない**（端末に落としても開く先が無い）
 *
 * 絞り込みは**横スクロールのチップを使わず、下から出るシート**で選ばせます
 * （`MobileFilterBar`）。
 */
import { useState, useMemo, useRef, useEffect } from 'react';
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
import { STAGE_CHIPS, ALL_STAGES } from './projectList/stages';
import { ProjectRow, ProjectRowsHeader } from './projectList/ProjectRows';
import { ProjectBoard } from './projectList/ProjectBoard';
import { SeedRow, SeedRowsHeader } from './projectList/SeedRows';
import { FilterBar, TermHint, SORT_OPTIONS } from './projectList/FilterBar';
import { MobileFilterBar } from './projectList/MobileFilterBar';
import { PageNav } from './projectList/PageNav';
import { ProjectCards } from './projectList/ProjectCards';
import { defaultPeriod, range as periodRange, label as periodLabel, type PeriodValue } from './projectList/period';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { useFlip } from '@gmo-onair/shared/src/client-v4/flip';
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

  /**
   * **`?stage=` を読む。** ダッシュボードのステージ別・KPI から
   * `/sales/projects?stage=a_won` で送られてきますが、着手前は読んでおらず
   * **押しても「すべて」のまま**でした（押した人には何も起きないように見える）。
   * 知らない値は「すべて」に落とします。
   */
  const [stageKey, setStageKey] = useState(() => {
    const asked = params.get('stage');
    return asked && STAGE_CHIPS.some((c) => c.key === asked) ? asked : 'all';
  });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(SORT_OPTIONS[0].value);
  const [aiOnly, setAiOnly] = useState(false);
  const [aiUnreviewedOnly, setAiUnreviewedOnly] = useState(true);
  const [termOpen, setTermOpen] = useState(false);

  const now = useMemo(() => new Date(), []);
  const today = localDateStr(now);
  /** 実施期間。**既定は半年（いま属する期）**（指示書 4-3） */
  const [period, setPeriod] = useState<PeriodValue>(() => defaultPeriod(now));

  // 何か触ったら1ページ目に戻す。戻さないと「3ページ目のまま 0 件」になる
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  const eventRange = useMemo(() => periodRange(period), [period]);

  /**
   * **「ネタ」の見え方はステージを固定する。** 見送り (`e_lost`) も出すのは、
   * モックが「過去のネタと見送りもここで探せます」と書いているため
   */
  const stages = view === 'seed'
    ? ['neta', 'e_lost']
    : STAGE_CHIPS.find((c) => c.key === stageKey)?.stages ?? ALL_STAGES;
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

  /**
   * 行を滑らせる（FLIP）。**中身が変わったら1回だけ**。
   * 依存に `rows` を入れているので、絞り込み・並び替え・ページ送りのどれでも効きます。
   */
  const listRef = useRef<HTMLDivElement>(null);
  const flip = useFlip(listRef);
  // **描く前に**いま並んでいる鍵を渡す（新しく現れた行はフェードインさせる）
  flip.sync(rows.map((r) => r.id));
  useEffect(() => { flip.play(); }, [rows, flip]);
  /** 並びが変わる操作は必ずここを通す。**直前の位置を覚えてから**値を変える */
  const move = <T,>(set: (v: T) => void) => (v: T) => { flip.capture(); reset(set)(v); };

  const countOf = (list: readonly string[]) => list.reduce((n, st) => n + (counts[st] ?? 0), 0);
  const totalAll = countOf(ALL_STAGES);

  const chips = STAGE_CHIPS.map((c) => ({
    key: c.key,
    label: c.label,
    // 件数はサーバーが「ステージ以外の絞り込みだけ」を掛けて数えたもの。
    // まだ読み込んでいないときは数字を出さない (0 と紛らわしいため)
    count: data ? (c.key === 'all' ? totalAll : countOf(c.stages)) : null,
  }));
  const stageCounts = Object.fromEntries(chips.map((c) => [c.key, c.count]));

  // 0件のときに「どれを外せば出るのか」を名指しするための一覧
  const activeFilters = [
    search ? `探している言葉: ${search}` : null,
    stageKey !== 'all' ? `ステージ: ${STAGE_CHIPS.find((c) => c.key === stageKey)?.label}` : null,
    period.mode !== 'all' ? `実施日: ${periodLabel(period)}` : null,
    aiOnly ? `AI 作成のみ${aiUnreviewedOnly ? ' (未確認)' : ''}` : null,
  ].filter((f): f is string => f !== null);

  const clearFilters = () => {
    flip.capture();
    setSearch(''); setStageKey('all'); setPeriod({ ...period, mode: 'all' }); setAiOnly(false); setPage(1);
  };

  /** PC・スマホで**同じ props**（写すと片方だけ絞り込みが増える） */
  const filterProps = {
    search, onSearch: reset(setSearch),
    sort, onSort: move(setSort),
    period, onPeriod: move(setPeriod),
    now,
    aiOnly, onAiOnly: move(setAiOnly),
    aiUnreviewedOnly, onAiUnreviewedOnly: move(setAiUnreviewedOnly),
    termOpen, onTermOpen: setTermOpen,
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
          押せるように見せると「押しても変わらない」ことになる。
          **スマホではチップを出さない** — 絞り込みはシートが持つ */}
      {view !== 'seed' && !isMobile && (
        <FilterChips label="ステージで絞り込む" items={chips} value={stageKey} onChange={move(setStageKey)} />
      )}

      {isMobile ? (
        <MobileFilterBar
          {...filterProps}
          stageKey={stageKey}
          onStageKey={move(setStageKey)}
          stageCounts={stageCounts}
          /* **シートを閉じるのと同じコマで測らない**（閉じかけの高さが混ざる） */
          beforeChange={(apply) => { flip.capture(); apply(); }}
        />
      ) : (
        <FilterBar {...filterProps} />
      )}
      {termOpen && <TermHint onClose={() => setTermOpen(false)} />}

      <div ref={listRef}>
        {isLoading ? (
          <Delayed><SkeletonRows rows={6} /></Delayed>
        ) : rows.length === 0 ? (
          activeFilters.length > 0 ? (
            <NoSearchResults activeFilters={activeFilters} onClearFilters={clearFilters} />
          ) : (
            <EmptyState
              title="案件がまだありません"
              description="引き合いが届いたら案件作成で案件にします。ここから直接つくることもできます。"
              action={<Button onClick={() => navigate('/sales/projects/new')}><Plus className="mr-1 h-4 w-4" aria-hidden="true" />案件をつくる</Button>}
            />
          )
        ) : view === 'board' ? (
          <ProjectBoard rows={rows} today={today} onOpen={(id) => navigate(`/sales/projects/${id}`)} />
        ) : isMobile && view === 'list' ? (
          /*
           * ⚠️ **スマホにもページ送りを出す**（レビューでの指摘 #61）。
           * カードは PC と同じ 20 件で切っているのに、**前へ／次へが
           * PC の一覧の中にしか無かった**ので、**21 件目以降の案件は
           * スマホから一度も開けませんでした**。しかも「全 N 件」も
           * 出ていないので、続きがあること自体が画面から読み取れません。
           */
          <div className="space-y-3.5">
            <ProjectCards rows={rows} today={today} isNew={flip.isNew} onOpen={(id) => navigate(`/sales/projects/${id}`)} />
            <PageNav
              pagination={pagination}
              page={page}
              onPage={(n) => { flip.capture(); setPage(n); }}
              filtered={activeFilters.length > 0}
            />
          </div>
        ) : view === 'seed' ? (
          <div className="space-y-3.5">
            <div className="overflow-hidden rounded-card border border-border bg-card">
              <SeedRowsHeader />
              {rows.map((p, i) => (
                <SeedRow key={p.id} p={p} row={{ index: i, isNew: flip.isNew(p.id) }} onOpen={() => navigate(`/sales/projects/${p.id}`)} />
              ))}
            </div>
            <p className="text-note text-muted-foreground">
              ネタは案件の数には入りません（ヨミにも乗りません）。
              引き合いを片づけるのは{' '}
              <button type="button" onClick={() => navigate('/sales/projects/new')} className="font-bold text-primary hover:underline">
                案件作成
              </button>
              です。<strong className="font-bold">入口と確信は AI が起票したときだけ</strong>入ります
              （手で登録したものは「—」）。
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            <div className="overflow-hidden rounded-card border border-border bg-card">
              <ProjectRowsHeader />
              {rows.map((p, i) => (
                <ProjectRow key={p.id} p={p} today={today} row={{ index: i, isNew: flip.isNew(p.id) }} onOpen={() => navigate(`/sales/projects/${p.id}`)} />
              ))}
            </div>

            <PageNav
              pagination={pagination}
              page={page}
              onPage={(n) => { flip.capture(); setPage(n); }}
              filtered={activeFilters.length > 0}
            />
          </div>
        )}
      </div>

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
