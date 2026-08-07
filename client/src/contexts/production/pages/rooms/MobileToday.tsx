/**
 * ⑬ 今日の予約（スマホ・モックの端末枠 13枚目）
 *
 * ── カレンダーはスマホで読めない ────────────────────────────
 *
 * ① 予定は FullCalendar の月表示で、375px では1日ぶんの升が
 * 数ミリ角になります。現場で見たいのは「**今日、何がどこであるか**」だけです。
 *
 * だから**その日ぶんの縦並び**にします。日付は前/次で動かせますが、
 * 起点は必ず今日です。
 *
 * ── 「空きを押さえる」はここでは作らない ────────────────────
 *
 * モックの下端は `空きを押さえる` です。予約を**作る**のは
 * 部屋・時間・案件・用途を決める作業で、スマホの1画面には収まりません
 * （PC の `StudioBookingDialog` は入力欄が十数個あります）。
 * **「部屋の空き」へ送ります** — 空いている幅を見てから PC で押さえる、が
 * いまできる形です。押しても何も起きないボタンは置きません。
 *
 * ── ⑩ 今日の現場 をこの1枚に畳んだ ────────────────────────
 *
 * モックは ⑩ 今日の現場（`今日 / 明日 / 今週` ／ 時刻・区分（**出庫**・リハ・本番）・
 * 場所・注記の縦並び）を別の端末枠として描いていますが、**⑬ と中身が9割同じ**です。
 * 違うのは「出庫」の行が混ざることだけで、リハ・本番はどちらもスタジオ予約です。
 *
 * 2枚に分けると、**同じ予約を2つの画面が別々に描く**ことになります。
 * 片方だけ直したときに時刻の丸め方や区分の色が食い違うので、
 * **1枚にして、機材の出庫を「層」として重ねました**。
 *
 * 出庫の層は **`equipment` の権限がある人にだけ出します**。無い人に空の枠を出すと
 * 「今日は出庫が無い」と読めてしまいますが、実際は見えていないだけです。
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, CalendarDays, Info, ArrowRight, PackageOpen, Undo2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/platform/AuthContext';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { EmptyState, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { localDateStr } from '@/lib/format';
import { isAllDay, clipToDay, type AvailBooking } from './availability';

interface Booking extends AvailBooking {
  project_name?: string | null;
  gls_number?: string | null;
  location_note?: string | null;
  booking_type?: string;
  rooms?: { room_id: string; room_name?: string; room_abbreviation?: string | null; room_color?: string | null }[];
}

/** 区分の見え方。**本番だけ赤**（全部に色を付けると本番が埋もれる） */
const KIND: Record<string, { label: string; cls: string }> = {
  performance: { label: '本番', cls: 'bg-destructive-surface text-destructive border-destructive-border' },
  rehearsal: { label: 'リハ', cls: 'bg-warning-surface text-warning border-warning-border' },
  setup: { label: '仕込み', cls: 'bg-info-surface text-info border-info-border' },
  hold: { label: '仮押さえ', cls: 'bg-surface-subtle text-muted-foreground border-border' },
  tour: { label: '内覧', cls: 'bg-surface-subtle text-secondary-foreground border-border' },
  maintenance: { label: '保守', cls: 'bg-surface-subtle text-secondary-foreground border-border' },
  consultation: { label: '打合せ', cls: 'bg-surface-subtle text-secondary-foreground border-border' },
  internal: { label: '社内', cls: 'bg-surface-subtle text-secondary-foreground border-border' },
  other: { label: 'その他', cls: 'bg-surface-subtle text-secondary-foreground border-border' },
};

const hhmm = (iso: string) => iso.slice(11, 16);

/** 機材の出庫・返却（⑩ の「出庫」の行） */
interface Lending {
  id: string;
  equipment_name?: string | null;
  eq_code?: string | null;
  unit_number?: string | null;
  project_name?: string | null;
  gls_number?: string | null;
  borrower_name?: string | null;
  planned_out_date?: string | null;
  due_date?: string | null;
}

export function MobileToday() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [day, setDay] = useState(() => localDateStr(new Date()));
  const today = localDateStr(new Date());
  const canEquipment = hasPermission('equipment');

  const q = useQuery({
    // **下限は日付だけ。** 終日の予約は日付だけで保存されるので、
    // `T00:00` にするとその日の終日がまるごと落ちる（部屋の空きと同じ理由）
    queryKey: ['studio-bookings', 'day', day],
    queryFn: async () => (await api.get('/studios/bookings', {
      params: { from: day, to: `${day}T23:59` },
    })).data.data as Booking[],
  });

  const rows = useMemo(() => {
    const all = q.data ?? [];
    return all.filter((b) => {
      // **前の日から続いていて「今日の 0:00 ちょうど」に終わるものは出さない。**
      // 日付の範囲で引くので返ってくるが、今日は1分も使っていない
      // （出すと `〜00:00 / 0h` という読めない行になる）
      if (isAllDay(b) || b.start_time.slice(0, 10) >= day) return true;
      return clipToDay(b, day).to > 0;
    }).sort((a, b) => {
      // 終日を先頭に。時間の幅を持たないので「いつ」で並べられない
      const aa = isAllDay(a) ? 1 : 0, bb = isAllDay(b) ? 1 : 0;
      if (aa !== bb) return bb - aa;
      return clipToDay(a, day).from - clipToDay(b, day).from;
    });
  }, [q.data, day]);

  /**
   * **その日に出す機材と、その日に返る機材。**
   * `planned_out_date` / `due_date` はどちらも日付だけなので、時刻の列には混ぜられません
   * （混ぜると「0:00 に出庫」と読める）。予約の並びとは別の塊にします。
   */
  const eq = useQuery({
    queryKey: ['equipment-lendings', 'day', day],
    enabled: canEquipment,
    queryFn: async () => {
      const [planned, lent] = await Promise.all([
        api.get('/equipment/lendings', { params: { status: 'planned' } }),
        api.get('/equipment/lendings', { params: { status: 'lent' } }),
      ]);
      const out = (planned.data.data as Lending[]).filter((r) => (r.planned_out_date ?? '').slice(0, 10) === day);
      const back = (lent.data.data as Lending[]).filter((r) => (r.due_date ?? '').slice(0, 10) === day);
      return { out, back };
    },
  });

  const shift = (n: number) => {
    const d = new Date(`${day}T00:00:00`);
    d.setDate(d.getDate() + n);
    setDay(localDateStr(d));
  };

  return (
    <div className="flex flex-col gap-3.5 p-3">
      <PageHeader
        title="今日の予約"
        sub={`${day}${day === today ? '（今日）' : ''} ・ ${rows.length}件`}
        primaryAction={
          <Button className="w-full sm:w-auto" onClick={() => navigate('/studio/rooms')}>
            部屋の空きを見る<ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
          </Button>
        }
      />

      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="icon" aria-label="前の日" onClick={() => shift(-1)}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button variant="outline" className="min-w-0 flex-1" onClick={() => setDay(today)}>今日</Button>
        <Button variant="outline" size="icon" aria-label="次の日" onClick={() => shift(1)}>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {q.isError ? (
        <ErrorPanel title="予約を読み込めませんでした" error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <Delayed><SkeletonRows rows={4} /></Delayed>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-6 w-6" aria-hidden="true" />}
          title="この日の予約はありません"
          description="「部屋の空きを見る」で空いている時間を確かめられます。"
        />
      ) : (
        // 読み込みの枠から中身に入れ替わる瞬間が「パッ」と出ていた（モックの `cardIn`）
        <ul className="v4-card-in flex flex-col gap-2">
          {rows.map((b) => {
            const k = KIND[b.booking_type ?? 'other'] ?? KIND.other;
            const allDay = isAllDay(b);
            const { from, to } = clipToDay(b, day);
            // **前の日から続いているものを「今日の時刻」で書かない**
            const carried = !allDay && b.start_time.slice(0, 10) < day;
            return (
              <li key={b.id} className="rounded-card border border-border bg-card p-3.5">
                <div className="flex items-start gap-3">
                  <span className="w-[52px] shrink-0">
                    <span className="font-number text-list block">
                      {allDay ? '終日' : carried ? '〜' + hhmm(b.end_time) : hhmm(b.start_time)}
                    </span>
                    {!allDay && !carried && (
                      <span className="font-number text-note block text-muted-foreground">
                        {Math.round((to - from) / 6) / 10}h
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="mb-1 flex flex-wrap items-center gap-1.5">
                      <span className={cn('rounded-badge border px-1.5 py-0.5 text-badge', k.cls)}>{k.label}</span>
                      {b.status === 'tentative' && (
                        <span className="rounded-badge border border-dashed border-border px-1.5 py-0.5 text-badge text-muted-foreground">
                          まだ決まっていません
                        </span>
                      )}
                      {carried && (
                        <span className="text-badge text-muted-foreground">前の日から続いています</span>
                      )}
                    </span>
                    <span className="text-list block [overflow-wrap:anywhere]">{b.title}</span>
                    <span className="text-note mt-0.5 block text-muted-foreground">
                      {[
                        (b.rooms ?? []).map((r) => r.room_abbreviation || r.room_name).filter(Boolean).join('・'),
                        b.location_note,
                        b.gls_number,
                        b.project_name,
                      ].filter(Boolean).join(' ／ ') || '部屋の指定なし'}
                    </span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* **読めなかったことは黙らない。** 何も出さないと「今日は出庫なし」と読める */}
      {canEquipment && eq.isError && (
        <ErrorPanel title="機材の出し入れを読み込めませんでした" error={eq.error} onRetry={() => eq.refetch()} />
      )}
      {canEquipment && (eq.data?.out.length || eq.data?.back.length) ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sub font-bold">機材の出し入れ</h2>
          {eq.data.out.map((r) => (
            <EqRow key={r.id} row={r} kind="out" />
          ))}
          {eq.data.back.map((r) => (
            <EqRow key={r.id} row={r} kind="back" />
          ))}
        </section>
      ) : null}

      <p className="rounded-note flex items-start gap-2 border border-info-border bg-info-surface px-3.5 py-3 text-note text-secondary-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
        <span>
          <strong className="font-bold">予約を作るのは PC です。</strong>
          部屋・時間・案件・用途を決める作業なので、この画面では見るだけにしています。
          空いている時間は「部屋の空き」で確かめられます。
        </span>
      </p>
    </div>
  );
}

/**
 * 出庫予定 / 返却期限の1行。
 * **時刻を書かない** — どちらも日付だけの値なので、書くと嘘になる。
 */
function EqRow({ row, kind }: { row: Lending; kind: 'out' | 'back' }) {
  const Icon = kind === 'out' ? PackageOpen : Undo2;
  return (
    <div className="rounded-card flex items-start gap-3 border border-border bg-card p-3.5">
      <span className="w-[52px] shrink-0">
        <span className="text-note flex items-center gap-1 font-bold text-muted-foreground">
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {kind === 'out' ? '出庫' : '返却'}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-list block [overflow-wrap:anywhere]">
          {row.equipment_name || row.eq_code || '（名前なし）'}
          {row.unit_number ? ` #${row.unit_number}` : ''}
        </span>
        <span className="text-note mt-0.5 block text-muted-foreground">
          {[row.eq_code, row.gls_number, row.project_name, row.borrower_name]
            .filter(Boolean).join(' ／ ') || '案件の指定なし'}
        </span>
      </span>
    </div>
  );
}
