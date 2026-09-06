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
 * ・**`?scope=upcoming` を初期値として読む。** ホームの「今後 N組」バッジと
 *   絞り込みを揃えるため (2026-08 監査で確定)
 */
import { useMemo, useState } from 'react';
import { Download, Search, UserPlus, X } from 'lucide-react';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import {
  MobileFilterBar, MobileFilterField, MobileFilterSegments,
} from '@gmo-onair/shared/src/client-v4/mobileFilterBar';
import { RowHeader, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import {
  Delayed, EmptyState, ErrorPanel, SkeletonRows,
} from '@gmo-onair/shared/src/client/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/hooks/usePermissions';
import type { InviewRegistration } from '@/lib/types';
import { useInviewList } from '@/lib/inviewApi';
import { DayCards } from './inview/DayCards';
import { DayRow } from './inview/DayRow';
import { InviewDialog } from './inview/InviewDialog';
import { SearchHits } from './inview/SearchHits';
import {
  checkedInHeadOf, dayKey, downloadCsv, headOf,
  matchedFields, matchesTerms, searchTerms, todayKey,
} from './inview/logic';

export interface DayGroup {
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
  const isMobile = useIsMobile();
  // **一覧は1回だけ引く。** 今後かどうかは日付の比較で決まるので、
  // 絞り込みのたびにサーバーへ行かない (チップの件数も同じ1本から数える)
  const list = useInviewList();
  // ホームの「今後 N組」バッジは `?scope=upcoming` で開く（`?card=` と同じ流儀）
  const [scope, setScope] = useState<Scope>(() =>
    (new URLSearchParams(window.location.search).get('scope') === 'upcoming' ? 'upcoming' : 'all'));
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
        {/*
          **CSV はスマホに出しません**（M8）。書き出したファイルを開いて確かめる
          相手が端末に無く、受付で使うのは検索です（ご判断の
          「データを出し入れする道具はスマホに出さない」に当たる）
        */}
        {!isMobile && (
          <Button variant="outline" disabled={!all.length} onClick={() => downloadCsv(all, '全期間')}>
            <Download className="mr-1 h-4 w-4" aria-hidden="true" />CSV出力（全期間）
          </Button>
        )}
      </PageHeader>

      {/*
        全部の回をまたぐ検索 — 受付で「どの回か分からない人」を検索する入口。

        **スマホでは枠と説明を畳みます**（M8）。390px で実測すると、
        カード枠 ＋ 4行の説明で **約 250px** を使い、名簿に着く前に
        1画面の6割が説明でした。探し方の但し書きは**打ち込んでから効くもの**
        （カタカナ・全角半角を区別しない）なので、1行に縮めます。
      */}
      {isMobile ? (
        <MobileFilterBar
          search={{
            value: query,
            onChange: setQuery,
            placeholder: '氏名・会社名・電話で検索',
            label: '来場者を検索',
          }}
          activeCount={(scope === 'all' ? 0 : 1) + (dateAsc ? 1 : 0)}
          onClearAll={() => { setScope('all'); setDateAsc(false); }}
          title="開催日の絞り込み"
          note="かな・全角半角・ハイフンは区別せず、絞り込みに関係なく全部の回から探します"
        >
          <MobileFilterField label="開催の時期" hint={`すべて ${counts.all}組 ／ 今後のみ ${counts.upcoming}組`}>
            <MobileFilterSegments
              label="開催の時期で絞り込む"
              items={[['all', 'すべて'], ['upcoming', '今後のみ']]}
              value={scope}
              onChange={setScope}
            />
          </MobileFilterField>
          <MobileFilterField label="並び順">
            <MobileFilterSegments
              label="開催日の並び順"
              items={[['desc', '新しい順'], ['asc', '古い順']]}
              value={dateAsc ? 'asc' : 'desc'}
              onChange={(v) => setDateAsc(v === 'asc')}
            />
          </MobileFilterField>
        </MobileFilterBar>
      ) : (
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
              // **`data-ui="button"` を付ける。** ここはPC専用の分岐（スマホは
              // MobileFilterBar 側の検索欄を使う）だが、同じ検索欄の×ボタンが
              // client-daily/client-equipment に計4か所複製されており、
              // 1か所だけ直すと残りが取り残されるので揃えておく（要対応5）
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="検索を消す"
                data-ui="button"
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
      )}

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
          {/* スマホでは時期と並び順がシートの中にあるので、件数だけ出す */}
          <div className="flex flex-wrap items-center gap-3">
            {!isMobile && (
              <>
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
              </>
            )}
            <span className="text-sub ml-auto font-number text-muted-foreground">
              {days.length}日 ・ {rows.length}組 ・ {totalHead}名
            </span>
          </div>

          {days.length === 0 ? (
            <EmptyState
              title={scope === 'upcoming' ? '今後の回の来場予約はまだありません' : '来場予約はまだありません'}
              description="Kairos3 の登録通知メールを AI が取り込みます。手で追加するときは「来場予約を追加」から登録してください。"
              action={scope === 'upcoming' ? (
                <Button variant="outline" onClick={() => setScope('all')}>すべての回を見る</Button>
              ) : undefined}
            />
          ) : isMobile ? (
            <DayCards days={days} today={today} />
          ) : (
            <div className="flex flex-col">
              <RowHeader>
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
          key={editing?.id ?? 'new'}
          initial={editing}
          // 開催日をまたぐ一覧から開くので、候補は**登録済みの回ぜんぶ**。
          // ここで新しい回を打てば新しい開催日ができる（候補は打ち直しを省くだけ）
          sessionOptions={[...new Set(all.map((r) => r.session_label))]}
          onClose={() => { setAdding(false); setEditing(null); }}
        />
      )}
    </div>
  );
}
