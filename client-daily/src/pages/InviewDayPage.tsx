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
  ArrowLeft, ArrowDownUp, CalendarDays, CheckCircle2, Download, PieChart, Search, UserPlus, X,
} from 'lucide-react';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Row, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
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
import { CompanySummary } from './inview/CompanySummary';
import { InviewDialog } from './inview/InviewDialog';
import {
  SORT_LABELS, UNDATED, checkedInHeadOf, dayKey, downloadCsv, formatDayTitle, headOf,
  matchedFields, matchesTerms, searchTerms, sortRegs, todayKey, type SortKey,
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

      {/* 受付の検索欄 — この画面の主役 */}
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
            placeholder="氏名・会社名・電話番号などで探す"
            aria-label="この日の来場者を検索"
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
          氏名 / ふりがな / 会社 / 役職 / メール / 電話 / 携帯 / 住所 / 同行者名 を探します。
          カタカナ・ひらがな・全角半角・電話のハイフンは区別しません。
          {sessions.length > 1 ? 'この日のすべての回をまたいで探します。' : ''}
        </p>
        {searching && (
          <p className="text-sub mt-1.5">
            「{query}」に当てはまる <span className="font-number font-bold">{hitCount}</span> 件 / この日 {dayRows.length} 件
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
              />
            );
          })}
        </div>
      )}

      {(adding || editing) && (
        <InviewDialog
          initial={editing}
          presetSessionLabel={adding ? presetSessionLabel : undefined}
          onClose={() => { setAdding(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

/** 回1つぶん (見出し + 名簿)。同じ日に複数の回が立つ */
function SessionBlock({
  label, time, audience, items, visible, showSummary, canEdit, terms, onEdit,
}: {
  label: string;
  time: string | null;
  audience: string | null;
  items: InviewRegistration[];
  visible: InviewRegistration[];
  showSummary: boolean;
  canEdit: boolean;
  /** 検索中なら検索語。検索していないときは null */
  terms: string[] | null;
  onEdit: (r: InviewRegistration) => void;
}) {
  const sHead = items.reduce((a, r) => a + headOf(r), 0);
  const sChecked = items.reduce((a, r) => a + checkedInHeadOf(r), 0);
  return (
    <div className="flex flex-col gap-2">
      <Row density="table" className="border-b border-border px-0" stackOnMobile>
        <RowMain>
          <RowTitle>{time ? <span className="font-number">{time}</span> : '時間未定'}</RowTitle>
          {/* 回のフル文字列 (読み取り前の生ラベル)。時間だけの回では出さない */}
          {label && label !== time && (
            <RowSub className="flex items-center gap-1">
              <CalendarDays className="h-3 w-3 shrink-0" aria-hidden="true" />{label}
            </RowSub>
          )}
        </RowMain>
        {/*
          対象は「イベント主催者向け」のように長いので**バッジにしない**。
          `TableBadge` は折り返さないので、列の幅 (96px) をはみ出して隣に重なる。
        */}
        <RowSlot w={160} hideOnMobile>
          <span className="text-sub-sm truncate text-muted-foreground">{audience || '—'}</span>
        </RowSlot>
        <RowSlot w={72} align="right" hideOnMobile>
          <span className="font-number text-sub">{items.length}組</span>
        </RowSlot>
        <RowSlot w={72} align="right" hideOnMobile>
          <span className="font-number text-sub">{sHead}名</span>
        </RowSlot>
        <RowSlot w={96} align="right">
          <span className={`font-number text-sub ${sChecked > 0 ? 'text-success' : 'text-muted-foreground'}`}>
            <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
            {sChecked} / {sHead}名
          </span>
        </RowSlot>
      </Row>

      {showSummary && <CompanySummary items={items} />}

      <div className="flex flex-col gap-2">
        {visible.map((r) => (
          <AttendeeCard
            key={r.id}
            r={r}
            canEdit={canEdit}
            onEdit={() => onEdit(r)}
            matchedIn={terms ? matchedFields(r, terms) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
