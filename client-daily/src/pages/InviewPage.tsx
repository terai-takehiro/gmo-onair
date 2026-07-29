/**
 * 内覧会 来場予約 — 開催日の一覧 (`/inview`)
 *
 * 以前は全部の回の名簿を 1 枚に積んでいた。当日の受付では目的の回に着くまで
 * スクロールが要り、来場者を待たせる原因になっていた。ここは**開催日を選ぶ
 * だけ**の画面にして、名簿は日ごとのページ (`/inview/:date`) に分けた。
 *
 * ただし受付では「どの回で申し込んだか本人も覚えていない」ことが普通にある。
 * そのため、この画面には**全部の回をまたぐ検索**を置く。名前や会社を打てば
 * 回に関係なくその人が出て、そのままその日のページへ飛べる。
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarCheck, Plus, Users, CheckCircle2, Loader2, Search, X, ChevronRight, Download, CalendarDays,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/hooks/usePermissions';
import type { InviewRegistration } from '@/lib/types';
import { useInviewList } from '@/lib/inviewApi';
import { PageTitle } from '@gmo-onair/shared/src/client/ui';
import { EmptyState, NoSearchResults } from '@gmo-onair/shared/src/client/states';
import {
  AttendeeCard, InviewDialog, UNDATED, checkedInHeadOf, dayKey, downloadCsv, formatDayTitle,
  headOf, matchedFields, matchesTerms, searchTerms, todayKey,
} from './inview/shared';

interface DayGroup {
  key: string;                 // YYYY-MM-DD または 'undated'
  date: string | null;
  /** その日にある回 (同じ日に複数の回が立つことがある) */
  sessions: Array<{ label: string; time: string | null; audience: string | null; regs: number; head: number }>;
  regs: number;
  head: number;
  checkedIn: number;
}

export default function InviewPage() {
  const { canEdit } = usePermissions();
  const [upcoming, setUpcoming] = useState(false);
  const { data: rows, isLoading } = useInviewList({ upcoming });
  const [query, setQuery] = useState('');
  const [dateAsc, setDateAsc] = useState(false); // false = 新しい順 (既定)
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<InviewRegistration | null>(null);

  const today = todayKey();
  const terms = useMemo(() => searchTerms(query), [query]);
  const searching = terms.length > 0;

  // 開催日ごとにまとめる (回は日の中の内訳として持つ)
  const days = useMemo<DayGroup[]>(() => {
    const map = new Map<string, DayGroup>();
    for (const r of rows ?? []) {
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
        s = { label: r.session_label, time: r.session_time, audience: r.session_audience, regs: 0, head: 0 };
        g.sessions.push(s);
      }
      s.regs += 1;
      s.head += headOf(r);
    }
    const arr = [...map.values()];
    arr.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;   // 日付未定は末尾
      if (!b.date) return -1;
      return dateAsc ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
    });
    for (const g of arr) g.sessions.sort((a, b) => (a.time || '').localeCompare(b.time || '') || a.label.localeCompare(b.label, 'ja'));
    return arr;
  }, [rows, dateAsc]);

  // 全部の回をまたぐ検索 (受付でその場で探す)
  const hits = useMemo(() => {
    if (!searching) return [];
    return (rows ?? [])
      .filter((r) => matchesTerms(r, terms))
      .map((r) => ({ r, matchedIn: matchedFields(r, terms) }));
  }, [rows, terms, searching]);

  const totalRegs = rows?.length ?? 0;
  const totalHead = (rows ?? []).reduce((a, r) => a + headOf(r), 0);

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <PageTitle>
            <CalendarCheck className="h-5 w-5 text-primary" />
            内覧会 来場予約
          </PageTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            開催日を選ぶとその日の受付ページが開きます。Kairos3 の登録通知メールを AI が取り込み、当日は来場チェックに使えます。
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => setAdding(true)} className="shrink-0">
            <Plus className="h-4 w-4 mr-1" /> 来場予約を追加
          </Button>
        )}
      </div>

      {/* 全部の回をまたぐ検索 — 受付で「どの回か分からない人」を探す入口 */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <label className="flex items-center gap-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">来場者を検索</span>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="氏名・会社名・電話番号などで全部の回から探す"
              className="h-10"
            />
            {query && (
              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setQuery('')} aria-label="検索をクリア">
                <X className="h-4 w-4" />
              </Button>
            )}
          </label>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            氏名 / ふりがな / 会社 / 役職 / メール / 電話 / 携帯 / 住所 / 同行者名 / 回 を探します。
            カタカナ・ひらがな・全角半角・電話のハイフンは区別しません。
          </p>
        </CardContent>
      </Card>

      {searching ? (
        // ── 検索中: 回をまたいだ結果を出す ──
        isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : hits.length === 0 ? (
          <NoSearchResults
            keyword={query}
            activeFilters={upcoming ? ['表示: 今後の回のみ'] : []}
            onClearFilters={upcoming ? () => setUpcoming(false) : undefined}
          />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              「{query}」に一致する来場予約 <span className="font-semibold text-foreground tabular-nums">{hits.length}</span> 件
            </p>
            {hits.map(({ r, matchedIn }) => (
              <div key={r.id} className="space-y-1">
                <Link
                  to={`/inview/${dayKey(r)}`}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <CalendarDays className="h-3 w-3" />
                  {r.session_date ? formatDayTitle(r.session_date) : '日付未定の回'}
                  {r.session_time ? ` ${r.session_time}` : ''}
                  の受付ページを開く
                  <ChevronRight className="h-3 w-3" />
                </Link>
                <AttendeeCard r={r} canEdit={canEdit} onEdit={() => setEditing(r)} matchedIn={matchedIn} />
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          {/* ツールバー (日の一覧) */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setUpcoming(false)}
                className={`rounded-md px-3 py-1.5 ${!upcoming ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:bg-accent'}`}
              >すべての回</button>
              <button
                onClick={() => setUpcoming(true)}
                className={`rounded-md px-3 py-1.5 ${upcoming ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:bg-accent'}`}
              >今後の回のみ</button>
            </div>

            <div className="hidden sm:block h-5 w-px bg-border" />

            <label className="flex items-center gap-1.5 text-muted-foreground">
              <span className="text-xs">開催日</span>
              <select
                value={dateAsc ? 'asc' : 'desc'}
                onChange={(e) => setDateAsc(e.target.value === 'asc')}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
              >
                <option value="desc">新しい順</option>
                <option value="asc">古い順</option>
              </select>
            </label>

            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground tabular-nums">
                {days.length}日 / {totalRegs}組 / {totalHead}名
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1 text-xs"
                disabled={!totalRegs}
                onClick={() => downloadCsv(rows ?? [], '全期間')}
              >
                <Download className="h-3.5 w-3.5" /> CSV出力（全期間）
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : days.length === 0 ? (
            <EmptyState
              title={upcoming ? '今後の回の来場予約がまだありません' : '来場予約がまだありません'}
              description="Kairos3 のメールを AI が取り込むか、「来場予約を追加」から登録してください。"
              action={upcoming ? <Button variant="outline" size="sm" onClick={() => setUpcoming(false)}>すべての回を見る</Button> : undefined}
            />
          ) : (
            <ul className="space-y-3">
              {days.map((g) => {
                const isToday = g.key === today;
                const isPast = !!g.date && g.date < today;
                return (
                  <li key={g.key}>
                    <Link
                      to={`/inview/${g.key}`}
                      className="group block rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-bold text-foreground">
                          {g.key === UNDATED ? '日付未定の回' : formatDayTitle(g.key)}
                        </span>
                        {isToday && <Badge className="bg-primary text-primary-foreground text-[11px]">今日</Badge>}
                        {isPast && <Badge variant="outline" className="text-[11px] text-muted-foreground">終了</Badge>}
                        <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </div>

                      {/* その日にある回 */}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {g.sessions.map((s) => (
                          <span
                            key={s.label}
                            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2.5 py-0.5 text-xs"
                          >
                            {s.time ? <span className="font-medium tabular-nums">{s.time}</span> : null}
                            {s.audience ? <span className="text-muted-foreground">{s.audience}</span> : null}
                            {!s.time && !s.audience ? <span className="text-muted-foreground truncate max-w-[16rem]">{s.label}</span> : null}
                            <span className="tabular-nums text-muted-foreground">{s.head}名</span>
                          </span>
                        ))}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          <span className="font-semibold tabular-nums text-foreground">{g.regs}</span>組 /
                          <span className="font-semibold tabular-nums text-foreground">{g.head}</span>名
                        </span>
                        <span className={`inline-flex items-center gap-1 ${g.checkedIn > 0 ? 'text-success' : ''}`}>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          受付 <span className="font-semibold tabular-nums">{g.checkedIn}</span> / {g.head}名
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
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
