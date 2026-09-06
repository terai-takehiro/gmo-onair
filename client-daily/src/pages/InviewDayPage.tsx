/**
 * 内覧会 来場予約 — その日の受付ページ (`/inview/:date`) (v4)
 *
 * 当日の受付端末で開きっぱなしにする画面。この日の名簿だけを出し、
 * 一番上に検索欄を置く (受付は「田中さん」「GMO」程度の手掛かりで名簿を引く)。
 * 同じ日に複数の回があるときは回ごとの見出しで区切るが、**検索はこの日の
 * 全部の回を横断する** — 本人が申し込んだ回を間違えて来ることがあるため。
 *
 * :date は `YYYY-MM-DD`、日付が読み取れなかった回は `undated`。
 *
 * ── v4 で変えたところ ────────────────────────────────────────
 *
 * ・**回の見出しを7段の列幅に載せた。** 回ごとの「N組 / N名 / 受付 N」が
 *   縦にそろうので、どの回が詰まっているか一目で分かる
 * ・**0件の理由を分けた。** 「この日に1件も無い」(`EmptyState`) と
 *   「検索が当たらない」(`NoSearchResults`) は次にやることが違う
 * ・**並び替えを `FilterChips` にはしていない。** 並び替えは絞り込みではないので
 *   件数が出せない (`count` に嘘の数字を置くことになる)。素の `select` のまま
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowDownUp, Download, PieChart, Search, UserPlus, X,
} from 'lucide-react';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { PullToRefresh } from '@gmo-onair/shared/src/client-v4/pullToRefresh';
import {
  MobileFilterBar, MobileFilterField,
} from '@gmo-onair/shared/src/client-v4/mobileFilterBar';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import {
  Delayed, EmptyState, ErrorPanel, NoSearchResults, SkeletonRows,
} from '@gmo-onair/shared/src/client/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/hooks/usePermissions';
import type { InviewRegistration } from '@/lib/types';
import { useInviewList } from '@/lib/inviewApi';
import { InviewDialog } from './inview/InviewDialog';
import { SessionBlock } from './inview/SessionBlock';
import {
  SORT_LABELS, UNDATED, checkedInHeadOf, dayKey, downloadCsv, formatDayTitle, headOf,
  matchesTerms, searchTerms, sortRegs, todayKey, type SortKey,
} from './inview/logic';

export default function InviewDayPage() {
  const { date = UNDATED } = useParams<{ date: string }>();
  const { canEdit } = usePermissions();
  // 日ページは常に全件から絞る (過去の回も開けるように「今後のみ」は使わない)
  const list = useInviewList();
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('default');
  const [showSummary, setShowSummary] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<InviewRegistration | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  // 受付はまず検索欄を打つ画面なので、開いたらそこにカーソルを置く
  // (スマホでキーボードが勝手に出ると邪魔なので、指で押せない幅では当てない)
  useEffect(() => {
    if (window.matchMedia?.('(min-width: 640px)').matches) searchRef.current?.focus();
  }, [date]);

  const terms = useMemo(() => searchTerms(query), [query]);
  const searching = terms.length > 0;

  const dayRows = useMemo(
    () => (list.data ?? []).filter((r) => dayKey(r) === date),
    [list.data, date],
  );

  const head = dayRows.reduce((a, r) => a + headOf(r), 0);
  const checkedIn = dayRows.reduce((a, r) => a + checkedInHeadOf(r), 0);

  // 回ごとの区切り (時間帯順)。検索中も回の見出しは保つ
  const sessions = useMemo(() => {
    const map = new Map<string, { label: string; time: string | null; audience: string | null; items: InviewRegistration[] }>();
    for (const r of dayRows) {
      if (!map.has(r.session_label)) {
        map.set(r.session_label, { label: r.session_label, time: r.session_time, audience: r.session_audience, items: [] });
      }
      map.get(r.session_label)!.items.push(r);
    }
    const arr = [...map.values()];
    arr.sort((a, b) => (a.time || '').localeCompare(b.time || '') || a.label.localeCompare(b.label, 'ja'));
    return arr.map((s) => ({
      ...s,
      // 検索は回をまたいで効かせる (申し込んだ回を間違えて来る人がいる)
      visible: sortRegs(s.items.filter((r) => matchesTerms(r, terms)), sortKey),
    }));
  }, [dayRows, terms, sortKey]);

  const hitCount = sessions.reduce((a, s) => a + s.visible.length, 0);
  const isToday = date === todayKey();
  // 同じ日に回が1つだけなら、追加ダイアログの「参加希望の回」を埋めておく
  const presetSessionLabel = sessions.length === 1 ? sessions[0].label : undefined;
  const dayTitle = date === UNDATED ? '日付未定の回' : formatDayTitle(date);

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <Link to="/inview" className="text-sub inline-flex items-center gap-1 text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> 開催日の一覧に戻る
      </Link>

      <PageHeader
        title={<>{dayTitle}{isToday && <TableBadge label="今日" w={null} className="bg-primary text-primary-foreground" />}</>}
        sub={`${dayRows.length}組 ・ ${head}名 ・ 受付 ${checkedIn} / ${head}名`}
        primaryAction={canEdit ? (
          <Button onClick={() => setAdding(true)}>
            <UserPlus className="mr-1 h-4 w-4" aria-hidden="true" />来場予約を追加
          </Button>
        ) : undefined}
      />

      {/*
        受付の検索欄 — この画面の主役。

        **スマホでは枠と説明を畳みます**（M9）。当日いちばん開く画面なのに、
        390px ではカード枠 ＋ 3行の説明 ＋ 並び替え ＋ ボタン2つで
        **最初の来場者に着くまで約 700px**（1画面ぶん）を使っていました。
        目の前に人が立っている画面なので、**打つ欄と名簿以外は畳みます**。
        探し方の但し書き（かな・全角半角・ハイフンを区別しない）は
        **打ち込んでから効くもの**なので、シートの中に移しました。
      */}
      {isMobile ? (
        <MobileFilterBar
          search={{
            value: query,
            onChange: setQuery,
            placeholder: '氏名・会社名・電話で検索',
            label: 'この日の来場者を検索',
          }}
          activeCount={sortKey === 'default' ? 0 : 1}
          onClearAll={() => setSortKey('default')}
          title="並び順"
          note={searching
            ? `「${query}」に一致する ${hitCount} 件 / この日 ${dayRows.length} 件`
            : 'かな・全角半角・ハイフンは区別せず、この日のすべての回から探します'}
        >
          <MobileFilterField label="並び替え">
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              aria-label="並び替え"
              className="text-list min-h-tap rounded-control border border-border bg-background px-2 text-foreground"
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <option key={k} value={k}>{SORT_LABELS[k]}</option>
              ))}
            </select>
          </MobileFilterField>
          <MobileFilterField label="会社別のまとめ" hint="同じ会社から何名来るかを1枚にします">
            <button
              type="button"
              onClick={() => setShowSummary((v) => !v)}
              className={`rounded-control min-h-tap text-list border px-3 ${
                showSummary ? 'border-primary-border-strong bg-primary-surface font-bold text-primary' : 'border-border bg-card'
              }`}
            >
              {showSummary ? 'まとめを閉じる' : 'まとめを出す'}
            </button>
          </MobileFilterField>
          {/* **CSV はスマホに出しません** — 書き出したファイルを開く相手が端末に無い */}
        </MobileFilterBar>
      ) : (
        <>
          <div className="rounded-card border border-border bg-card p-3 lg:px-4">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="氏名・会社名・電話番号などで検索"
                aria-label="この日の来場者を検索"
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
              氏名 / ふりがな / 会社 / 役職 / メール / 電話 / 携帯 / 住所 / 同行者名 を探します。
              カタカナ・ひらがな・全角半角・電話のハイフンは区別しません。
              {sessions.length > 1 ? 'この日のすべての回をまたいで探します。' : ''}
            </p>
            {searching && (
              <p className="text-sub mt-1.5">
                「{query}」に一致する <span className="font-number font-bold">{hitCount}</span> 件 / この日 {dayRows.length} 件
              </p>
            )}
          </div>

          {/* 並び替えと書き出し */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sub flex items-center gap-1.5 text-muted-foreground">
              <ArrowDownUp className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">並び替え</span>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="text-sub min-h-tap rounded-control border border-border bg-background px-2 text-foreground lg:min-h-[36px]"
              >
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                  <option key={k} value={k}>{SORT_LABELS[k]}</option>
                ))}
              </select>
            </label>
            <div className="ml-auto flex items-center gap-2">
              <Button variant={showSummary ? 'default' : 'outline'} onClick={() => setShowSummary((v) => !v)}>
                <PieChart className="mr-1 h-4 w-4" aria-hidden="true" /> 会社別のまとめ
              </Button>
              <Button
                variant="outline"
                disabled={!dayRows.length}
                onClick={() => downloadCsv(dayRows, date === UNDATED ? '日付未定' : date)}
              >
                <Download className="mr-1 h-4 w-4" aria-hidden="true" /> CSV出力（この日）
              </Button>
            </div>
          </div>
        </>
      )}

      {list.isError ? (
        <ErrorPanel title="来場予約を読み込めませんでした" error={list.error} onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <Delayed><SkeletonRows rows={4} /></Delayed>
      ) : dayRows.length === 0 ? (
        <EmptyState
          title={`${dayTitle} の来場予約はありません`}
          description="日付を取り違えているかもしれません。開催日の一覧から選び直してください。"
          action={<Button variant="outline" asChild><Link to="/inview">開催日の一覧に戻る</Link></Button>}
        />
      ) : searching && hitCount === 0 ? (
        <NoSearchResults
          keyword={query}
          activeFilters={[`開催日: ${dayTitle}`]}
          onClearFilters={() => setQuery('')}
        />
      ) : (
        <PullToRefresh onRefresh={list.refetch} disabled={!isMobile}>
          <div className="flex flex-col gap-6">
            {sessions.map((s) => {
              // 検索中は当たりが無い回を出さない (受付の画面を空の見出しで埋めない)
              if (searching && s.visible.length === 0) return null;
              return (
                <SessionBlock
                  key={s.label}
                  label={s.label}
                  time={s.time}
                  audience={s.audience}
                  items={s.items}
                  visible={s.visible}
                  showSummary={showSummary}
                  canEdit={canEdit}
                  terms={searching ? terms : null}
                  onEdit={setEditing}
                  isMobile={isMobile}
                />
              );
            })}
          </div>
        </PullToRefresh>
      )}

      {(adding || editing) && (
        <InviewDialog
          key={editing?.id ?? 'new'}
          initial={editing}
          presetSessionLabel={adding ? presetSessionLabel : undefined}
          onClose={() => { setAdding(false); setEditing(null); }}
        />
      )}
    </div>
  );
}
