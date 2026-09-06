/**
 * ② プロジェクト一覧＝プロジェクト管理の案件台帳 (v4 GPM)
 *
 * ── 絞り込みは画面で掛ける ──────────────────────────────────
 *
 * `GET /gpm/projects` は状態・区分で絞れますが、**絞り込みチップの件数を
 * 返しません**。件数を出すために状態ごとに叩くと5往復になり、遅い1本のせいで
 * 数字が後から入れ替わります。構築プロジェクトは同時に数十件なので、
 * **1回で取って画面で分ける**ほうが正確です（数える場所も1か所になる）。
 * 探している言葉だけはサーバーに渡します（部分一致のエスケープはサーバーの仕事）。
 *
 * ── チップの件数の数え方 ────────────────────────────────────
 *
 * **その軸以外の絞り込みだけ**を掛けて数えます（案件一覧の `stage_counts` と
 * 同じ考え方）。全件の内訳を出すと、検索中に押した先が 0 件になります。
 *
 * ── 「リスト／ボード」の見え方を足した回 ────────────────────
 *
 * 案件管理の案件台帳（`sales/pages/ProjectListPage.tsx`）と**同じ考え方**で
 * 見え方を切り替えられるようにした。**同じ問い合わせの結果を並べ替えているだけ**
 * なので、リストとボードで件数・金額が食い違わない。並び順（おすすめ／見積が
 * 大きい順／期限が近い順）も画面側で並べ替える — 件数が数十件の規模なので、
 * サーバーに並び替えを頼むと1回のやり取りが増えるだけで正確さは変わらない
 * （`useGpmProjects` の説明と同じ理由）。
 *
 * **案件管理の台帳と違って持たせていないもの**: 実施期間の絞り込み・
 * Excel 入出力・並び替え時の FLIP アニメーション。構築プロジェクトは同時に数十件で、
 * 案件のように四半期単位で積み上がる数（数百件）ではないため、まずは軽い形にしてある。
 *
 * ⚠️ **Excel 入出力は今回のフォーマット統一 PR では足していない**（モックの
 * delta 4 は「表頭クリック並べ替え・Excel 入出力を案件管理と揃える」と書いているが、
 * 表頭クリック並べ替えだけをこの PR で入れた）。案件一覧の Excel 入出力は
 * `POST/GET /projects/excel/*`（`server/.../excel.routes.ts` の `PROJECTS_CONFIG`）
 * という**サーバー側の入出力そのもの**を持っており、GPM プロジェクト
 * （`gls_category='B'`）には同等の口が無い。それを新設するのは「見え方の作法を
 * 揃える」を超えて**新しい機能を足す**ことになり、このPRの注意書き
 * 「機能は変えない。見え方の作法だけ変える」に反するため、別タスクへ切り出した。
 *
 * ── 見え方（リスト/ボード）・状態・区分・並び順は URL クエリに持つ
 *    （v4・一覧フォーマット統一 PR②・delta 2）────────────────────
 *
 * 旧実装は全部 `useState` だったので、共有した URL でも戻る操作でも
 * 絞り込みが再現しなかった。**案件一覧と同じキー名**（`?view=` `?stage=`）に
 * 揃え、区分・並び順にも `?kind=` `?sort=` を足す。検索欄だけは案件一覧と
 * 同じくローカル state のまま（案件一覧の `search` も URL に持たせていない）。
 *
 * ── 件数表示とページ送り（v4・一覧フォーマット統一 PR②・delta 3）──────
 *
 * サーバーは全件返す設計のまま（絞り込みチップの件数を保つため）なので、
 * 画面側で切って `PageNav.tsx`（`projectList/PageNav.tsx`）に渡す。
 * ボードは案件一覧と同じく**ページ送りを掛けずに絞り込み後の全件**を並べる
 * （かんばんは列で分けるので、ページで割ると列ごとの件数が実態とずれる）。
 *
 * ── ボードはスマホに出さない（2026-08 追記）─────────────────
 *
 * 案件一覧（`sales/pages/ProjectListPage.tsx`）は `useIsMobile()` で「ボード」の
 * 切替ボタン自体を隠している（240px 固定カラムが5列並ぶので、375px では1列も入らない）。
 * この画面には同じガードが無く、スマホでもボードを開けてしまっていた
 * （スマホ最適化の洗い出し 2026-08-20・要対応1）。案件一覧と同じ考え方で塞ぐ。
 *
 * ── スマホの絞り込みをシートに畳んだ（2026-08 追記）───────────
 *
 * 状態チップ・検索・区分・並び順が375pxでも1行にそのまま並び、折り返して縦に
 * 重なっていた（スマホ最適化の洗い出し 2026-08-20・要対応2）。案件一覧・機材台帳
 * などと同じ共通部品（`shared/src/client-v4/mobileFilterBar.tsx`）に載せ替えた。
 * **検索欄だけは畳まない**（探すのは絞り込みではなく目的そのもの、という決めごと）。
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { List, LayoutGrid, Plus, Info } from 'lucide-react';
import { localDateStr } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/platform/AuthContext';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import {
  EmptyState, NoSearchResults, Delayed, SkeletonRows, ErrorPanel,
} from '@gmo-onair/shared/src/client/states';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { useDebounced } from '@gmo-onair/shared/src/client/hooks/useDebounced';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { PullToRefresh } from '@gmo-onair/shared/src/client-v4/pullToRefresh';
import { MobileFilterBar, MobileFilterField, MobileFilterSegments } from '@gmo-onair/shared/src/client-v4/mobileFilterBar';
import { useGpmProjects } from '../queries';
import { KIND_LABEL, STAGE_GROUPS, type GpmKind } from '../types';
import { ProjectRow, ProjectRowsHeader } from './projectList/ProjectRows';
import { GpmProjectCards } from './projectList/ProjectCards';
import { GpmProjectBoard } from './projectList/ProjectBoard';
import { FilterBar, TermHint, TermHintBody } from './projectList/FilterBar';
import { PageNav, type GpmPagination } from './projectList/PageNav';
import { SORT_OPTIONS, sortRows, type SortKey } from './projectList/sort';

/** 1ページの件数。案件一覧と同じ（`sales/pages/ProjectListPage.tsx` の `PAGE_SIZE`） */
const PAGE_SIZE = 20;

/**
 * 状態のチップ。**束ねるのは読むときだけ** — 保存するのはいつも `stage` そのもの
 * （`types.ts` の `STAGE_GROUPS`。サーバーの `STAGE_GROUPS` と同じ束ね方）。
 * 「動いているもの」を先頭に置く（毎日見るのはここ）。**既定はこの `open`**
 * （`stageKey` の初期値・`clearFilters` の両方がここを指す。案件一覧の
 * `ACTIVE_STAGES`＝既定「進行中」と同じ役目）。
 */
const STAGE_GROUP_STAGES = (key: string) => STAGE_GROUPS.find((g) => g.key === key)?.stages ?? [];
const STAGE_CHIPS = [
  { key: 'open', label: '進行中・準備中',
    stages: [...STAGE_GROUP_STAGES('active'), ...STAGE_GROUP_STAGES('planning')] },
  ...STAGE_GROUPS.filter((g) => g.key !== 'all'),
  { key: 'all', label: 'すべて', stages: [] as typeof STAGE_GROUPS[number]['stages'] },
];
const DEFAULT_STAGE_KEY = 'open';

const KINDS: GpmKind[] = ['self_build', 'group_order'];

export default function GpmProjectListPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  // **作れない人にボタンを出さない。** 出しても押せば権限がありませんと言われるだけ
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('sales', 'editor');

  const [params, setParams] = useSearchParams();

  /**
   * URL クエリを1回で書き換える。**この画面が持つ4つの鍵（`view`/`stage`/`kind`/`sort`）を
   * 同じレンダーの中で複数書き換えるときは、必ずこれを1回だけ呼ぶこと。**
   *
   * ⚠️ 以前は鍵ごとに別々の setter（`setStageKey` 等）が、その都度
   * `new URLSearchParams(params)` で**同じ古い `params` を元に**次の値を作っていた。
   * `clearFilters`（絞り込みを外す）のように同じ関数の中で3つの setter を続けて呼ぶと、
   * どれも同じ古い `params` から作った `next` を持つため、**最後に呼ばれた setter の
   * 変更だけが残り、残り2つの変更が消えていた**（レビュー指摘）。
   */
  const updateParams = (mutate: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params);
    mutate(next);
    setParams(next, { replace: true });
  };

  /** 見え方（リスト／ボード）。**キー名は案件一覧と同じ `?view=`** */
  const rawView = params.get('view');
  const rawViewKey: 'list' | 'board' = rawView === 'board' ? 'board' : 'list';
  // **スマホではボードをリストに落とす**（案件一覧と同じ理由）
  const view: 'list' | 'board' = isMobile && rawViewKey === 'board' ? 'list' : rawViewKey;
  const setView = (v: 'list' | 'board') => updateParams((next) => {
    if (v === 'list') next.delete('view'); else next.set('view', v);
  });

  /** 状態のチップ。**キー名は案件一覧と同じ `?stage=`**。知らない値は既定に落とす */
  const rawStage = params.get('stage');
  const stageKey = rawStage && STAGE_CHIPS.some((c) => c.key === rawStage) ? rawStage : DEFAULT_STAGE_KEY;
  const setStageKey = (v: string) => updateParams((next) => {
    if (v === DEFAULT_STAGE_KEY) next.delete('stage'); else next.set('stage', v);
  });

  /** 区分（自社構築／グループ受託）。`?kind=` */
  const rawKind = params.get('kind');
  const kind: GpmKind | '' = rawKind === 'self_build' || rawKind === 'group_order' ? rawKind : '';
  const setKind = (v: GpmKind | '') => updateParams((next) => {
    if (!v) next.delete('kind'); else next.set('kind', v);
  });

  /** 並び順。`?sort=` */
  const rawSort = params.get('sort');
  const sort: SortKey = SORT_OPTIONS.some((o) => o.value === rawSort) ? (rawSort as SortKey) : 'recommended';
  const setSort = (v: SortKey) => updateParams((next) => {
    if (v === 'recommended') next.delete('sort'); else next.set('sort', v);
  });

  // **検索欄はローカル state のまま**（案件一覧の `search` も URL に持たせていない）
  const [search, setSearch] = useState('');
  // 問い合わせの鍵だけ遅らせる（入力欄は `search` のまま即時に描く）。
  // 一覧APIは行ごとの相関サブクエリが重く、1文字ごとに投げると打鍵の数だけ全件走査が走る
  const appliedSearch = useDebounced(search.trim(), 300);
  const [page, setPage] = useState(1);
  const [termOpen, setTermOpen] = useState(false);

  // 何か触ったら1ページ目に戻す。戻さないと「3ページ目のまま 0 件」になる（案件一覧と同じ作法）
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  // **スマホでボードを選んだまま画面を回転・PCから引き継いだ場合に備える。**
  // 240px 固定カラムが5列並ぶボードは375pxに1列も入らないので、スマホでは常にリストへ落とす。
  // useEffect は描画のあとに走るので、state の書き戻しだけだと**1コマだけボードが出る**。
  // 描くときは `effectiveView` を見る（概要タブのガント・かんばんと同じ形）
  useEffect(() => {
    if (isMobile && rawViewKey === 'board') setView('list');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, rawViewKey]);
  const effectiveView = isMobile ? 'list' : view;

  const today = useMemo(() => localDateStr(new Date()), []);
  const { data, isLoading, isError, refetch } = useGpmProjects(appliedSearch);
  const all = useMemo(() => data ?? [], [data]);

  // 区分だけを掛けた集合。**状態チップの件数はここから数える**
  const byKind = useMemo(() => (kind ? all.filter((p) => p.gpm_kind === kind) : all), [all, kind]);
  const stageFiltered = useMemo(() => {
    const stages = STAGE_CHIPS.find((c) => c.key === stageKey)?.stages ?? [];
    // 「すべて」は畳まない（見送りも含めて全部出す）
    return stages.length === 0 ? byKind : byKind.filter((p) => stages.includes(p.stage));
  }, [byKind, stageKey]);
  const sortedRows = useMemo(() => sortRows(stageFiltered, sort), [stageFiltered, sort]);

  // **ボードはページ送りを掛けない**（列で分けるので、ページで割ると列ごとの件数が実態とずれる）
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rows = effectiveView === 'board'
    ? sortedRows
    : sortedRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const pagination: GpmPagination = {
    page: safePage, limit: PAGE_SIZE, total: sortedRows.length, totalPages,
  };

  const chips = STAGE_CHIPS.map((c) => ({
    key: c.key,
    label: c.label,
    // 読み込み前は数字を出さない（0 と紛らわしい）
    count: data
      ? (c.stages.length === 0 ? byKind.length : byKind.filter((p) => c.stages.includes(p.stage)).length)
      : null,
  }));

  const activeFilters = [
    search.trim() ? `探している言葉: ${search.trim()}` : null,
    kind ? `区分: ${KIND_LABEL[kind]}` : null,
    stageKey !== DEFAULT_STAGE_KEY ? `状態: ${STAGE_CHIPS.find((c) => c.key === stageKey)?.label}` : null,
  ].filter((f): f is string => f !== null);

  /**
   * 「絞り込みを外す」の戻り先を1つにする（v4・一覧フォーマット統一 PR②・delta 5）。
   * 旧実装は PC の `clearFilters` が「すべて」（`stageKey: 'all'`）に戻す一方、
   * スマホの `onClearAll` は「進行中・準備中」（`'open'`）に戻し、**同じ操作なのに
   * 戻り先が2通り**だった。**`DEFAULT_STAGE_KEY`（＝初期値と同じ「動いているもの」）
   * に統一**し、この1つの関数を両方から呼ぶ。
   *
   * ⚠️ `stage`/`kind`/`sort` の3つの URL 鍵は**1回の `updateParams` でまとめて外す**。
   * `setStageKey` 等を3回続けて呼ぶと、どれも同じ古い `params` から次の値を作るため
   * 最後の呼び出し以外が消えていた（レビュー指摘）。
   */
  const clearFilters = () => {
    setSearch('');
    updateParams((next) => { next.delete('stage'); next.delete('kind'); next.delete('sort'); });
    setPage(1);
  };

  const filterProps = {
    search, onSearch: reset(setSearch),
    kind, onKind: reset(setKind),
    sort, onSort: reset(setSort),
    termOpen, onTermOpen: setTermOpen,
  };

  return (
    <div className="space-y-3.5 p-4 lg:px-6 lg:pb-6 lg:pt-5">
      <PageHeader
        title="プロジェクト一覧"
        // **サブタイトルは「件数 ・ 画面が何を見せているか」の短い形**（delta 6）。
        // 方針の説明（「発注が確定したもの…」）は「用語」ボタンの中身（`TermHint`）へ移した
        // ⚠️ 件数は区分・状態の絞り込みを掛けたあとの `sortedRows`（Codexレビュー指摘・PR #593）。
        // `all` は検索だけを掛けた集合なので、区分「自社構築」を選んでも件数が変わらず見えていた
        sub={data ? `${sortedRows.length}件 ・ 全員が同じものを見ています` : '全員が同じものを見ています'}
        primaryAction={
          canEdit ? (
            <Button onClick={() => navigate('/gpm/projects/new')}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />プロジェクトを作成
            </Button>
          ) : undefined
        }
      >
        {/* **スマホでは出さない。** ボードは選べても開けない画面になるので、切替そのものを隠す */}
        {!isMobile && (
          <div className="inline-flex shrink-0 overflow-hidden rounded-control border border-border" role="group" aria-label="表示形式を切り替える">
            {([['list', 'リスト', List], ['board', 'ボード', LayoutGrid]] as const).map(([v, label, Icon], i) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={cn(
                  'min-h-tap text-sub inline-flex items-center gap-1.5 px-3.5 lg:min-h-[40px]',
                  i > 0 && 'border-l border-border',
                  view === v ? 'bg-primary-surface font-bold text-primary' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />{label}
              </button>
            ))}
          </div>
        )}
      </PageHeader>

      {/* **スマホでは畳んでシートで開く。** 状態チップ・区分・並び順の3つが
          375pxでは1行に収まらず折り返して縦に重なっていた */}
      {isMobile ? (
        <MobileFilterBar
          search={{
            value: search,
            onChange: reset(setSearch),
            placeholder: 'プロジェクト名・依頼元で検索',
            label: 'プロジェクトを検索',
          }}
          activeCount={(stageKey !== DEFAULT_STAGE_KEY ? 1 : 0) + (kind ? 1 : 0) + (sort !== 'recommended' ? 1 : 0)}
          onClearAll={clearFilters}
          title="状態・区分・並び順"
        >
          <MobileFilterField label="状態">
            <FilterChips label="状態で絞り込む" items={chips} value={stageKey} onChange={reset(setStageKey)} />
          </MobileFilterField>
          <MobileFilterField label="区分">
            <MobileFilterSegments
              label="区分で絞り込む"
              items={[['', 'すべて'], ...KINDS.map((k) => [k, KIND_LABEL[k]] as const)] as [GpmKind | '', string][]}
              value={kind}
              onChange={reset(setKind)}
            />
          </MobileFilterField>
          <MobileFilterField label="並び順">
            <MobileFilterSegments
              label="並び順"
              items={SORT_OPTIONS.map((o) => [o.value, o.label] as [SortKey, string])}
              value={sort}
              onChange={reset(setSort)}
            />
          </MobileFilterField>
          {/*
            **PC の「用語」ボタン＋浮く帯（`TermHint`）はスマホでは使わない**
            （レビュー指摘）。押した先の帯は本文の並びに描くが、スマホの絞り込みは
            この下シートに畳んであるため、開いたままだと帯がシートの下に隠れて
            見えなかった。開閉のトグルを持たず、シートを開けば常に読める形にする
          */}
          <MobileFilterField label="用語">
            <div className="flex items-start gap-1.5 text-sub text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <div className="space-y-1">
                <TermHintBody />
              </div>
            </div>
          </MobileFilterField>
        </MobileFilterBar>
      ) : (
        <>
          <FilterChips label="状態で絞り込む" items={chips} value={stageKey} onChange={reset(setStageKey)} />
          <FilterBar {...filterProps} />
          {termOpen && <TermHint onClose={() => setTermOpen(false)} />}
        </>
      )}

      {isError ? (
        <ErrorPanel title="プロジェクトを読み込めませんでした" onRetry={() => refetch()} />
      ) : isLoading ? (
        <Delayed><SkeletonRows rows={5} /></Delayed>
      ) : rows.length === 0 ? (
        // 「まだ無い」か「0件でした」かの判定は**問い合わせた値**（appliedSearch）で行う
        // （useDebounced の決めごと — 即時の search だと、まだ問い合わせていない言葉で
        // 「該当なし」が一瞬出る）
        all.length === 0 && !appliedSearch ? (
          <EmptyState
            title="プロジェクトがまだありません"
            description="発注が確定した構築案件をここで工程管理します。工程テンプレートを選ぶと、工程とタスクが日付付きで入ります。"
            action={
              canEdit ? (
                <Button onClick={() => navigate('/gpm/projects/new')}>
                  <Plus className="mr-1 h-4 w-4" aria-hidden="true" />プロジェクトを作成
                </Button>
              ) : undefined
            }
          />
        ) : (
          <NoSearchResults activeFilters={activeFilters} onClearFilters={clearFilters} />
        )
      ) : effectiveView === 'board' ? (
        <GpmProjectBoard rows={rows} today={today} onOpen={(id) => navigate(`/gpm/projects/${id}`)} />
      ) : isMobile ? (
        <div className="space-y-3.5">
          <PullToRefresh onRefresh={refetch}>
            <GpmProjectCards rows={rows} today={today} onOpen={(id) => navigate(`/gpm/projects/${id}`)} />
          </PullToRefresh>
          <PageNav pagination={pagination} page={safePage} onPage={setPage} filtered={activeFilters.length > 0} />
        </div>
      ) : (
        <div className="space-y-3.5">
          <div className="overflow-hidden rounded-card border border-border bg-card">
            <ProjectRowsHeader sort={sort} onSort={reset(setSort)} />
            {rows.map((p) => (
              <ProjectRow key={p.id} p={p} today={today} onOpen={() => navigate(`/gpm/projects/${p.id}`)} />
            ))}
          </div>
          <PageNav pagination={pagination} page={safePage} onPage={setPage} filtered={activeFilters.length > 0} />
        </div>
      )}

      <p className="text-note text-muted-foreground">
        「見積」は<strong className="font-bold">いま出ている金額</strong>です
        （束ごとに最新版・値引きを引いた税抜。数え方は案件一覧の「見積金額」と同じ式）。
        請求の状況はプロジェクトを開いて「請求」タブで見ます。
      </p>
    </div>
  );
}
