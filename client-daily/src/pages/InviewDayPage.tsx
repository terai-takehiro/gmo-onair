/**
 * 内覧会 来場予約 — その日の受付ページ (`/inview/:date`)
 *
 * 当日の受付端末で開きっぱなしにする画面。この日の名簿だけを出し、
 * 一番上に検索欄を置く (受付は「田中さん」「GMO」程度の手掛かりで名簿を引く)。
 * 同じ日に複数の回があるときは回ごとの見出しで区切るが、**検索はこの日の
 * 全部の回を横断する** — 本人が申し込んだ回を間違えて来ることがあるため。
 *
 * :date は `YYYY-MM-DD`、日付が読み取れなかった回は `undated`。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, CalendarDays, CheckCircle2, ChevronRight, Download, Loader2, PieChart,
  Plus, Search, Users, X, ArrowDownUp,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/hooks/usePermissions';
import type { InviewRegistration } from '@/lib/types';
import { useInviewList } from '@/lib/inviewApi';
import {
  AttendeeCard, CompanySummary, InviewDialog, SORT_LABELS, UNDATED, checkedInHeadOf, dayKey,
  downloadCsv, formatDayTitle, headOf, matchedFields, matchesTerms, searchTerms, sortRegs,
  todayKey, type SortKey,
} from './inview/shared';

export default function InviewDayPage() {
  const { date = UNDATED } = useParams<{ date: string }>();
  const { canEdit } = usePermissions();
  // 日ページは常に全件から絞る (過去の回も開けるように upcoming フィルタは使わない)
  const { data: rows, isLoading } = useInviewList();
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

  // この日の予約 (回をまたいで集める)
  const dayRows = useMemo(
    () => (rows ?? []).filter((r) => dayKey(r) === date),
    [rows, date],
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

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 space-y-4">
      <Link to="/inview" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> 開催日の一覧に戻る
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Users className="h-5 w-5 text-primary" />
            {date === UNDATED ? '日付未定の回' : formatDayTitle(date)}
            {isToday && <Badge className="ml-1 bg-primary text-primary-foreground text-[11px]">今日</Badge>}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              <span className="font-semibold tabular-nums text-foreground">{dayRows.length}</span>組 /
              <span className="font-semibold tabular-nums text-foreground">{head}</span>名
            </span>
            <span className={`inline-flex items-center gap-1 ${checkedIn > 0 ? 'text-emerald-700' : ''}`}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              受付 <span className="font-semibold tabular-nums">{checkedIn}</span> / {head}名
            </span>
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => setAdding(true)} className="shrink-0">
            <Plus className="h-4 w-4 mr-1" /> 来場予約を追加
          </Button>
        )}
      </div>

      {/* 受付の検索欄 — この画面の主役 */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <label className="flex items-center gap-2">
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">この日の来場者を検索</span>
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="氏名・会社名・電話番号などで探す"
              className="h-11 text-base"
            />
            {query && (
              <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={() => setQuery('')} aria-label="検索をクリア">
                <X className="h-4 w-4" />
              </Button>
            )}
          </label>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            氏名 / ふりがな / 会社 / 役職 / メール / 電話 / 携帯 / 住所 / 同行者名 を探します。
            カタカナ・ひらがな・全角半角・電話のハイフンは区別しません。
            {sessions.length > 1 ? 'この日のすべての回をまたいで探します。' : ''}
          </p>
          {searching && (
            <p className="mt-1.5 text-sm">
              「{query}」に一致 <span className="font-semibold tabular-nums">{hitCount}</span> 件 / この日 {dayRows.length} 件
            </p>
          )}
        </CardContent>
      </Card>

      {/* ツールバー */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <label className="flex items-center gap-1.5 text-muted-foreground">
          <ArrowDownUp className="h-3.5 w-3.5" />
          <span className="sr-only">並び替え</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <option key={k} value={k}>{SORT_LABELS[k]}</option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant={showSummary ? 'default' : 'outline'}
            className="h-8 gap-1 text-xs"
            onClick={() => setShowSummary((v) => !v)}
          >
            <PieChart className="h-3.5 w-3.5" /> 会社別サマリー
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 text-xs"
            disabled={!dayRows.length}
            onClick={() => downloadCsv(dayRows, date === UNDATED ? '日付未定' : date)}
          >
            <Download className="h-3.5 w-3.5" /> CSV出力（この日）
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : dayRows.length === 0 ? (
        <Card><CardContent className="space-y-2 p-8 text-center text-sm text-muted-foreground">
          <p>この日の来場予約はありません。</p>
          <p>日付を取り違えているかもしれません。開催日の一覧から選び直してください。</p>
          <Button variant="outline" size="sm" asChild><Link to="/inview">開催日の一覧に戻る</Link></Button>
        </CardContent></Card>
      ) : searching && hitCount === 0 ? (
        <Card><CardContent className="space-y-2 p-8 text-center text-sm text-muted-foreground">
          <p>「{query}」に一致する来場者は、{date === UNDATED ? '日付未定の回' : formatDayTitle(date)} にはいません。</p>
          <p>
            別の日で申し込んでいる可能性もあります。
            <Link to="/inview" className="ml-1 inline-flex items-center gap-0.5 text-primary hover:underline">
              全部の回から探す<ChevronRight className="h-3 w-3" />
            </Link>
          </p>
          <Button variant="outline" size="sm" onClick={() => setQuery('')}>検索をクリア</Button>
        </CardContent></Card>
      ) : (
        <div className="space-y-6">
          {sessions.map((s) => {
            // 検索中は当たりが無い回を出さない (受付の画面を空の見出しで埋めない)
            if (searching && s.visible.length === 0) return null;
            const sHead = s.items.reduce((a, r) => a + headOf(r), 0);
            const sChecked = s.items.reduce((a, r) => a + checkedInHeadOf(r), 0);
            return (
              <div key={s.label} className="space-y-2">
                {/* 回の見出し (同じ日に複数の回が立つ) */}
                <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
                  {s.time ? <span className="font-semibold tabular-nums">{s.time}</span> : <span className="font-semibold">時間未定</span>}
                  {s.audience ? <Badge variant="outline" className="text-xs">{s.audience}</Badge> : null}
                  <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{s.items.length}組 / {sHead}名</span>
                    <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />受付 {sChecked}</span>
                  </span>
                </div>
                {/* 回のフル文字列 (抽出前の生ラベル) */}
                {s.label && s.label !== s.time && (
                  <p className="flex items-start gap-1 text-[11px] text-muted-foreground">
                    <CalendarDays className="mt-0.5 h-3 w-3 shrink-0" />{s.label}
                  </p>
                )}
                {showSummary && <CompanySummary items={s.items} />}
                <div className="space-y-2">
                  {s.visible.map((r) => (
                    <AttendeeCard
                      key={r.id}
                      r={r}
                      canEdit={canEdit}
                      onEdit={() => setEditing(r)}
                      matchedIn={searching ? matchedFields(r, terms) : undefined}
                    />
                  ))}
                </div>
              </div>
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
