/**
 * 内覧会 来場予約 — 開催日の一覧 (`/inview`) (v4)
 *
 * ここは**開催日を選ぶだけ**の画面。名簿は日ごとのページ (`/inview/:date`) にある。
 * 全部の回を1枚に積むと、当日の受付で目的の回に着くまでスクロールが要り、
 * 来場者を待たせる。
 *
 * ただし受付では「どの回で申し込んだか本人も覚えていない」ことが普通にある。
 * そのため、この画面には**全部の回をまたぐ検索**を置く。
 *
 * ── v4 で変えたところ ────────────────────────────────────────
 *
 * ・**日の行を7段の列幅 (`RowSlot`) に載せた。** 以前は日ごとのカードの中に
 *   「N組 / N名」「受付 N / N名」を文の形で書いていたので、日をまたいで
 *   数字を縦に比べられなかった (どの日が埋まっているか一目で分からない)
 * ・**絞り込みを `FilterChips` にして件数を出した。** 以前は「すべての回 /
 *   今後の回のみ」がただのボタンで、押すまで 0 件か分からなかった
 * ・**一覧を1回だけ引く。** 以前は `upcoming` をサーバーに渡していたので、
 *   絞り込みを押すたびに引き直していた。今後かどうかは日付の比較で決まるので、
 *   全件から数える (同じものを2か所で数えない)
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight, Download, Search, UserPlus, X } from 'lucide-react';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import {
  Delayed, EmptyState, ErrorPanel, NoSearchResults, SkeletonRows,
} from '@gmo-onair/shared/src/client/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/hooks/usePermissions';
import type { InviewRegistration } from '@/lib/types';
import { useInviewList } from '@/lib/inviewApi';
import { AttendeeCard } from './inview/AttendeeCard';
import { InviewDialog } from './inview/InviewDialog';
import {
  UNDATED, checkedInHeadOf, dayKey, downloadCsv, formatDayTitle, headOf,
  matchedFields, matchesTerms, searchTerms, todayKey,
} from './inview/logic';

interface DayGroup {
  key: string;                 // YYYY-MM-DD または 'undated'
  date: string | null;
  /** その日にある回 (同じ日に複数の回が立つことがある) */
  sessions: Array<{ label: string; time: string | null; audience: string | null; head: number }>;
  regs: number;
  head: number;
  checkedIn: number;
}

type Scope = 'all' | 'upcoming';

/** 「今後の回」= 開催日が今日以降、または日付がまだ決まっていない回 */
const isUpcoming = (r: InviewRegistration, today: string) => !r.session_date || r.session_date >= today;

export default function InviewPage() {
  const { canEdit } = usePermissions();
  // **一覧は1回だけ引く。** 今後かどうかは日付の比較で決まるので、
  // 絞り込みのたびにサーバーへ行かない (チップの件数も同じ1本から数える)
  const list = useInviewList();
  const [scope, setScope] = useState<Scope>('all');
  const [query, setQuery] = useState('');
  const [dateAsc, setDateAsc] = useState(false); // false = 新しい順 (既定)
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<InviewRegistration | null>(null);

  const today = todayKey();
  const terms = useMemo(() => searchTerms(query), [query]);
  const searching = terms.length > 0;
  const all = useMemo(() => list.data ?? [], [list.data]);

  const rows = useMemo(
    () => (scope === 'upcoming' ? all.filter((r) => isUpcoming(r, today)) : all),
    [all, scope, today],
  );

  const counts = useMemo(() => ({
    all: all.length,
    upcoming: all.filter((r) => isUpcoming(r, today)).length,
  }), [all, today]);

  // 開催日ごとにまとめる (回は日の中の内訳として持つ)
  const days = useMemo<DayGroup[]>(() => {
    const map = new Map<string, DayGroup>();
    for (const r of rows) {
      const k = dayKey(r);
      if (!map.has(k)) {
        map.set(k, { key: k, date: r.session_date, sessions: [], regs: 0, head: 0, checkedIn: 0 });
      }
      const g = map.get(k)!;
      g.regs += 1;
      g.head += headOf(r);
      g.checkedIn += checkedInHeadOf(r);
      let s = g.sessions.find((x) => x.label === r.session_label);
      if (!s) {
        s = { label: r.session_label, time: r.session_time, audience: r.session_audience, head: 0 };
        g.sessions.push(s);
      }
      s.head += headOf(r);
    }
    const arr = [...map.values()];
    arr.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;   // 日付未定は末尾
      if (!b.date) return -1;
      return dateAsc ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
    });
    for (const g of arr) {
      g.sessions.sort((a, b) => (a.time || '').localeCompare(b.time || '') || a.label.localeCompare(b.label, 'ja'));
    }
    return arr;
  }, [rows, dateAsc]);

  // 全部の回をまたぐ検索 (受付でその場で探す)。**絞り込みは無視して全件から探す** —
  // 「今後のみ」が効いたまま 0 件になると、過去の回で申し込んだ人を見つけられない
  const hits = useMemo(() => {
    if (!searching) return [];
    return all.filter((r) => matchesTerms(r, terms)).map((r) => ({ r, matchedIn: matchedFields(r, terms) }));
  }, [all, terms, searching]);

  const totalHead = rows.reduce((a, r) => a + headOf(r), 0);

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="内覧会 来場予約"
        sub="開催日を選ぶとその日の受付ページが開きます。Kairos3 の登録通知メールは AI が取り込みます"
        primaryAction={canEdit ? (
          <Button onClick={() => setAdding(true)}>
            <UserPlus className="mr-1 h-4 w-4" aria-hidden="true" />来場予約を追加
          </Button>
        ) : undefined}
      >
        <Button variant="outline" disabled={!all.length} onClick={() => downloadCsv(all, '全期間')}>
          <Download className="mr-1 h-4 w-4" aria-hidden="true" />CSV出力（全期間）
        </Button>
      </PageHeader>

      {/* 全部の回をまたぐ検索 — 受付で「どの回か分からない人」を探す入口 */}
      <div className="rounded-card border border-border bg-card p-3 lg:px-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="氏名・会社名・電話番号などで全部の回から探す"
            aria-label="来場者を検索"
            className="pl-9 pr-9"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="検索を消す"
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-badge text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <p className="text-note mt-2 text-muted-foreground">
          氏名 / ふりがな / 会社 / 役職 / メール / 電話 / 携帯 / 住所 / 同行者名 / 回 を探します。
          カタカナ・ひらがな・全角半角・電話のハイフンは区別しません。<strong className="font-bold">絞り込みに関係なく全部の回</strong>から探します。
        </p>
      </div>

      {list.isError ? (
        <ErrorPanel title="来場予約を読み込めませんでした" error={list.error} onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <Delayed><SkeletonRows rows={5} /></Delayed>
      ) : searching ? (
        <SearchHits
          query={query}
          hits={hits}
          canEdit={canEdit}
          onEdit={setEditing}
          onClear={() => setQuery('')}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <FilterChips
              label="開催の時期で絞り込む"
              items={[
                { key: 'all', label: 'すべて', count: counts.all },
                { key: 'upcoming', label: '今後のみ', count: counts.upcoming },
              ]}
              value={scope}
              onChange={(k) => setScope(k as Scope)}
            />
            <Button variant="ghost" onClick={() => setDateAsc((v) => !v)}>
              開催日 {dateAsc ? '古い順' : '新しい順'}
            </Button>
            <span className="text-sub ml-auto font-number text-muted-foreground">
              {days.length}日 ・ {rows.length}組 ・ {totalHead}名
            </span>
          </div>

          {days.length === 0 ? (
            <EmptyState
              title={scope === 'upcoming' ? '今後の回の来場予約はまだありません' : '来場予約はまだありません'}
              description="Kairos3 の登録通知メールを AI が取り込みます。手で足すときは「来場予約を追加」から登録してください。"
              action={scope === 'upcoming' ? (
                <Button variant="outline" onClick={() => setScope('all')}>すべての回を見る</Button>
              ) : undefined}
            />
          ) : (
            <div className="flex flex-col">
              <RowHeader className="hidden sm:flex">
                <RowMain>開催日 ／ その日にある回</RowMain>
                <RowSlot w={72}>状態</RowSlot>
                <RowSlot w={72} align="right">組数</RowSlot>
                <RowSlot w={72} align="right">来場予定</RowSlot>
                <RowSlot w={96} align="right">受付</RowSlot>
                <RowSlot w={56} />
              </RowHeader>

              {days.map((g) => (
                <DayRow key={g.key} g={g} today={today} />
              ))}
            </div>
          )}
        </>
      )}

      {(adding || editing) && (
        <InviewDialog
          initial={editing}
          onClose={() => { setAdding(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

/** 開催日1行。**押すとその日の受付ページ**へ行く (この行では受付できない) */
function DayRow({ g, today }: { g: DayGroup; today: string }) {
  const isToday = g.key === today;
  const isPast = !!g.date && g.date < today;
  // 行ぜんぶを1つのリンクにする (押せる面を広くする)。
  // `stackOnMobile` は使わない — あれは `Row` の**直接の子**の `RowMain` を狙うので、
  // 間にリンクが挟まると効かない。スマホで畳む列は `hideOnMobile` で落として、
  // 落とした数字は名前列の下 (`RowSub`) に出す。
  return (
    <Row divider interactive align="start" className="p-0">
      <Link
        to={`/inview/${g.key}`}
        className="min-h-tap flex w-full items-start gap-3 px-4 py-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-[46px]"
      >
        <RowMain>
          <RowTitle>{g.key === UNDATED ? '日付未定の回' : formatDayTitle(g.key)}</RowTitle>
          <RowSub>
            {g.sessions
              .map((s) => [s.time, s.audience, `${s.head}名`].filter(Boolean).join(' '))
              .join(' ／ ')}
          </RowSub>
          {/* スマホでは右の列が畳まれるので、数字をここに出す */}
          <RowSub className="font-number sm:hidden">
            {g.regs}組 ・ {g.head}名 ・ 受付 {g.checkedIn}/{g.head}名
          </RowSub>
        </RowMain>

        <RowSlot w={72} placeholder="">
          {isToday ? <TableBadge label="今日" w={null} className="bg-primary text-primary-foreground" />
            : isPast ? <TableBadge label="終了" w={null} className="bg-muted text-muted-foreground" />
              : null}
        </RowSlot>

        <RowSlot w={72} align="right" hideOnMobile>
          <span className="font-number text-sub">{g.regs}組</span>
        </RowSlot>

        <RowSlot w={72} align="right" hideOnMobile>
          <span className="font-number text-sub">{g.head}名</span>
        </RowSlot>

        <RowSlot w={96} align="right" hideOnMobile>
          <span className={`font-number text-sub ${g.checkedIn > 0 ? 'text-success' : 'text-muted-foreground'}`}>
            {g.checkedIn} / {g.head}名
          </span>
        </RowSlot>

        <RowSlot w={56} align="right" placeholder="">
          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </RowSlot>
      </Link>
    </Row>
  );
}

/** 回をまたいだ検索の結果。**当たった人ごとに、その日の受付ページへの入口**を付ける */
function SearchHits({
  query, hits, canEdit, onEdit, onClear,
}: {
  query: string;
  hits: Array<{ r: InviewRegistration; matchedIn: string[] }>;
  canEdit: boolean;
  onEdit: (r: InviewRegistration) => void;
  onClear: () => void;
}) {
  if (hits.length === 0) {
    return <NoSearchResults keyword={query} onClearFilters={onClear} />;
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sub text-muted-foreground">
        「{query}」に当てはまる来場予約 <span className="font-number font-bold text-foreground">{hits.length}</span> 件
      </p>
      {hits.map(({ r, matchedIn }) => (
        <div key={r.id} className="flex flex-col gap-1">
          <Link
            to={`/inview/${dayKey(r)}`}
            className="text-sub-sm inline-flex items-center gap-1 font-bold text-primary hover:underline"
          >
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            {r.session_date ? formatDayTitle(r.session_date) : '日付未定の回'}
            {r.session_time ? ` ${r.session_time}` : ''}
            の受付ページを開く
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
          <AttendeeCard r={r} canEdit={canEdit} onEdit={() => onEdit(r)} matchedIn={matchedIn} />
        </div>
      ))}
    </div>
  );
}
