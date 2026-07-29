/**
 * 送出（本番中に見る唯一の画面）— デザイン 20章 24a / 仕様書 §7.7
 *
 * 送出画面が4つに分かれ、準備の設定と本番の操作が混ざっていた。
 * **本番はこの1画面だけ。準備は別画面**（各レイヤーの操作ページ）。
 *
 * ── この画面の決めごと ────────────────────────────────
 *  - **次のTAKEで何が出るかを必ず先に見せる**。分からないまま押させない
 *  - 順番はサーバーが決める（画面に写すと「次はこれ」と実際が食い違う）
 *  - **出したままを見張る**（何分出ているかを出して、その場で消せる）
 *  - 出したまま変えられるもの（大賞の見せ方・黒ベースの濃さ）はTAKEし直さない
 *  - **キー操作は既定で効かない**。v2.9.96 でショートカットを全廃したのは
 *    誤って触ると本番に出てしまうためで、その判断は変えない。
 *    「キー操作を使う」を入れたときだけ効く
 *  - **スマホにTAKEを置かない**（24d）。見張ることと消すことだけ
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, Radio, AlertTriangle, Undo2, Eraser, Play, Keyboard, Settings, Link2,
} from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { NoPermissionPanel } from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';

interface Layer {
  key: string; label: string; live: boolean;
  step?: string | null; step_label?: string; elapsed_sec: number | null;
}
interface StepInfo { step: string; label: string; desc: string; tone: string }
interface OnAir {
  event: { id: number; name: string; subtitle: string | null };
  layers: Layer[];
  program: {
    step: string; label: string; desc: string; tone: string;
    category_name: string | null; category_position: string | null;
    entry_count: number | null; since_sec: number | null; also_live: string | null;
  };
  next: StepInfo | null;
  prev: { step: string; label: string } | null;
  after: Array<{ step: string; label: string }>;
  steps: StepInfo[];
  leftover: Array<{ layer: string; label: string; minutes: number }>;
  leftover_minutes: number;
  live_adjust: { oneshot_style: string; scrim_opacity: number };
  keys: Array<{ key: string; what: string }>;
  categories: Array<{ id: number; name: string; entry_count: number; current: boolean }>;
}

const mmss = (s: number | null) => {
  if (s == null) return '—';
  const m = Math.floor(s / 60), r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};

const TONE: Record<string, string> = {
  neutral: 'border-border bg-card text-foreground',
  live: 'border-destructive bg-destructive text-destructive-foreground',
  award: 'border-warning bg-warning text-warning-foreground',
};

export default function OnAirPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = parseInt(id!);
  const navigate = useNavigate();
  const qc = useQueryClient();

  // キー操作は既定で切っている (誤って本番に出さないため)
  const [keysArmed, setKeysArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data, error } = useQuery<{ data: OnAir }>({
    queryKey: ['onair', eventId],
    queryFn: async () => (await api.get(`/awards/events/${eventId}/onair`)).data,
    refetchInterval: 2000,
    // 権限が無いときに何度も叩かない (403 は待っても変わらない)
    retry: (count, e) =>
      (e as { response?: { status?: number } })?.response?.status === 403 ? false : count < 2,
  });
  const v = data?.data;

  const invalidate = () => qc.invalidateQueries({ queryKey: ['onair', eventId] });

  /** ステップを送る。送出そのものは既存の `/cue` を使う (出る絵は変えていない) */
  const cue = useMutation({
    mutationFn: async (step: string) =>
      (await api.post(`/awards/events/${eventId}/cue`, {
        step, categoryId: v?.categories.find((c) => c.current)?.id ?? null,
      })).data,
    onSuccess: invalidate,
  });
  const clearOneshot = useMutation({
    mutationFn: async () =>
      (await api.post(`/awards/events/${eventId}/oneshot/cue`, { isLive: false })).data,
    onSuccess: invalidate,
  });

  const take = useCallback(() => {
    if (!v?.next || busy) return;
    setBusy(true);
    cue.mutate(v.next.step, { onSettled: () => setBusy(false) });
  }, [v, busy, cue]);

  const undo = useCallback(() => {
    if (!v?.prev || busy) return;
    setBusy(true);
    cue.mutate(v.prev.step, { onSettled: () => setBusy(false) });
  }, [v, busy, cue]);

  /**
   * 出ているものを消す。**本番中なので必ず訊く** (v3.0.9)。
   *
   * v3.0.8 まで CLEAR は無確認で即座に走り、しかも下のキー操作で
   * **Escape に割り当てられていた**。Escape はどの画面でも「閉じる・やめる」の
   * キーなので、本番中に癖で押すと**画面が真っ黒になって放送に出る**。
   * ボタンは確認を通し、Escape の割り当ては外した。
   */
  const clearAll = useCallback(async () => {
    if (busy) return;
    const ok = await confirmAction({
      title: 'いま出ているものを消しますか？',
      description: '放送に出ている絵がすぐに消えます（黒画になります）。出し直すには TAKE をもう一度押します。',
      confirmLabel: '消す',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    cue.mutate('idle', { onSettled: () => setBusy(false) });
  }, [busy, cue]);

  // キー操作。**入れたときだけ効く**。入力欄にフォーカスがあるときは効かせない
  useEffect(() => {
    if (!keysArmed) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.code === 'Space') { e.preventDefault(); take(); }
      else if (e.code === 'Backspace') { e.preventDefault(); undo(); }
      // Escape に CLEAR は割り当てない。どの画面でも「閉じる・やめる」のキーなので、
      // 本番中に癖で押すと放送が黒画になる。消すときはボタンから (確認を通す)
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keysArmed, take, undo]);

  // 権限が無い人に「読み込んでいます…」を出したままにしない
  // (何が足りないのか分からず、壊れているのと区別が付かない)
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  if (status === 403) {
    return (
      <div className="p-6">
        <NoPermissionPanel modules={['awards']} level="reader" target="送出の画面" />
      </div>
    );
  }
  /**
   * **一度でも状態が取れていれば、通信が切れても画面を消さない** (v3.0.9)。
   *
   * v3.0.8 までは `error` が立った時点で送出画面ごと差し替えていた。この画面は
   * 2秒ごとに取り直しているので、**本番中に通信が一瞬途切れただけで TAKE の
   * ボタンが消える**。次のポーリングで戻るが、その数秒間オペレーターは何も押せない。
   * 最初の読み込みで一度も取れていないときだけ全画面にする。
   */
  if (error && !v) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        送出の状態を読めませんでした。通信を確かめて、もう一度開いてください。
      </div>
    );
  }
  if (!v) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">読み込んでいます…</div>;
  }

  const anyLive = v.layers.some((l) => l.live);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* 上辺: ON AIR とレイヤーの状態 */}
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <button onClick={() => navigate(`/event/${eventId}`)}
        className="flex min-h-tap items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          準備にもどる
        </button>
        {/* 通信が取れていない間は黙らない。画面は残すが「いまの状態か分からない」と言う */}
        {error && (
          <span className="flex items-center gap-1 rounded bg-warning-surface px-2 py-1 text-xs font-bold text-warning-strong">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            通信が取れていません（表示は最後に届いた状態です）
          </span>
        )}
        <span className={cn(
          'flex items-center gap-1 rounded px-2 py-1 text-xs font-bold',
          anyLive ? 'bg-destructive text-white' : 'bg-card text-muted-foreground',
        )}>
          <Radio className="h-3 w-3" aria-hidden="true" />
          {anyLive ? 'ON AIR' : 'OFF'}
        </span>
        <span className="text-sm font-bold">{v.event.name}</span>
        {v.program.category_name && (
          <span className="text-sm text-muted-foreground">
            {v.program.category_name}
            {v.program.category_position && ` ・ ${v.program.category_position}`}
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {v.layers.map((l) => (
            <span key={l.key} className={cn(
              'rounded px-2 py-1 text-xs',
              l.live ? 'bg-destructive text-destructive-foreground' : 'bg-card text-muted-foreground',
            )}>
              {l.label} {l.live ? `出ています ${mmss(l.elapsed_sec)}` : '出ていません'}
            </span>
          ))}
        </div>
      </header>

      {/* 出したままの警告 */}
      {v.leftover.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-warning px-4 py-2 text-sm text-warning-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {v.leftover.map((l) => (
            <span key={l.layer}>
              {l.label}が <strong>{l.minutes}分</strong> 出たままです。
            </span>
          ))}
          <button onClick={() => { clearOneshot.mutate(); clearAll(); }}
          className="ml-auto min-h-tap rounded bg-warning px-3 text-sm font-bold text-warning-foreground hover:bg-warning/90">
            その場で消す
          </button>
        </div>
      )}

      <div className="grid gap-4 p-4 lg:grid-cols-2">
        {/* PROGRAM — いま出ているもの */}
        <section className={cn('rounded-xl border-2 p-4', TONE[v.program.tone] ?? TONE.neutral)}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xs font-bold tracking-wider">PROGRAM ・ いま出ているもの</h2>
            <span className="text-xs opacity-80">
              {v.program.since_sec != null ? `出てから ${mmss(v.program.since_sec)}` : ''}
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold">{v.program.label}</p>
          <p className="mt-1 text-sm opacity-90">{v.program.desc}</p>
          {v.program.entry_count != null && (
            <p className="mt-1 text-xs opacity-70">この部門は {v.program.entry_count}名</p>
          )}
          {v.program.also_live && (
            <p className="mt-2 text-xs opacity-80">{v.program.also_live}</p>
          )}
        </section>

        {/* NEXT — 次のTAKEで出るもの */}
        <section className="rounded-xl border-2 border-dashed border-border bg-background p-4">
          <h2 className="text-xs font-bold tracking-wider text-muted-foreground">NEXT ・ 次のTAKEで出るもの</h2>
          {v.next ? (
            <>
              <p className="mt-2 text-2xl font-bold">{v.next.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{v.next.desc}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                次のTAKEで「{v.next.desc}」が出ます。
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              この部門はここまでです。次の部門を選んでください。
            </p>
          )}
          {v.after.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              そのあと {v.after.map((a) => a.label).join(' → ')} と進みます。
            </p>
          )}
        </section>
      </div>

      {/* 操作 (PCだけ。スマホにTAKEは置かない = 24d) */}
      <section className="hidden gap-2 px-4 pb-4 lg:flex lg:flex-wrap lg:items-center">
        <button onClick={take} disabled={!v.next || busy}
          className="min-h-ctl-5 rounded-xl bg-destructive px-6 text-lg font-bold text-white disabled:opacity-40 hover:bg-destructive/90">
          <Play className="mr-2 inline h-5 w-5" aria-hidden="true" />
          TAKE
          <span className="ml-2 text-sm font-normal opacity-80">
            {v.next ? v.next.label : '次がありません'}
          </span>
        </button>
        <button onClick={undo} disabled={!v.prev || busy}
          className="min-h-ctl-5 rounded-xl border border-border px-4 text-sm text-foreground disabled:opacity-40 hover:bg-card">
          <Undo2 className="mr-1 inline h-4 w-4" aria-hidden="true" />
          1つ戻す{v.prev ? `（${v.prev.label}）` : ''}
        </button>
        <button onClick={clearAll} disabled={busy}
          className="min-h-ctl-5 rounded-xl border border-border px-4 text-sm text-foreground hover:bg-card">
          <Eraser className="mr-1 inline h-4 w-4" aria-hidden="true" />
          CLEAR
        </button>

        <label className="ml-auto flex min-h-tap cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" className="h-4 w-4" checked={keysArmed}
            onChange={(e) => setKeysArmed(e.target.checked)}
            aria-label="キー操作を使う" />
          <Keyboard className="h-4 w-4" aria-hidden="true" />
          キー操作を使う
          <span className={cn('rounded px-1.5 text-xs', keysArmed ? 'bg-destructive text-white' : 'bg-card text-muted-foreground')}>
            {keysArmed ? '入' : '切'}
          </span>
        </label>
      </section>

      {/* スマホは見張るだけ (24d) */}
      <section className="px-4 pb-4 lg:hidden">
        <p className="rounded-xl border border-border bg-background p-3 text-sm text-muted-foreground">
          <strong>TAKE はこの画面にありません。</strong>
          送出はPCから行います。スマホでできるのは、出たままのものを消すことと、状態を見張ることだけです。
        </p>
        {anyLive && (
          <button onClick={() => { clearOneshot.mutate(); clearAll(); }}
          className="mt-2 min-h-tap w-full rounded-xl bg-warning px-3 text-sm font-bold text-warning-foreground">
            出ているものを消す
          </button>
        )}
      </section>

      {/* キー操作の一覧 + 出したまま変えられるもの + 準備への導線 */}
      <div className="grid gap-4 px-4 pb-8 lg:grid-cols-3">
        <section className="rounded-xl border border-border bg-background p-3">
          <h3 className="text-xs font-bold text-muted-foreground">キー操作</h3>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {v.keys.map((k) => (
              <li key={k.key} className="flex gap-2">
                <kbd className="shrink-0 rounded bg-card px-1.5 py-0.5 font-mono">{k.key}</kbd>
                <span>{k.what}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted-foreground">
            既定では効きません。誤って本番に出さないため、上の「キー操作を使う」を入れたときだけ効きます。
          </p>
        </section>

        <section className="rounded-xl border border-border bg-background p-3">
          <h3 className="text-xs font-bold text-muted-foreground">出したまま変えられるもの</h3>
          <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
            <div className="flex justify-between gap-2">
              <dt>大賞の見せ方</dt><dd>{v.live_adjust.oneshot_style}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>黒ベースの濃さ</dt><dd>{Math.round(v.live_adjust.scrim_opacity * 100)}%</dd>
            </div>
          </dl>
          <p className="mt-2 text-[11px] text-muted-foreground">
            この2つは出したまま変えられます（TAKEし直す必要はありません）。
            変えるのは準備の画面からです。
          </p>
        </section>

        <section className="rounded-xl border border-border bg-background p-3">
          <h3 className="text-xs font-bold text-muted-foreground">準備（本番中は触りません）</h3>
          <div className="mt-2 flex flex-col gap-1">
            <button onClick={() => navigate(`/event/${eventId}/outputs`)}
            className="flex min-h-tap items-center gap-1 text-left text-xs text-muted-foreground hover:text-foreground">
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
              出力URLの配り方
            </button>
            <button onClick={() => navigate(`/event/${eventId}/control`)}
            className="flex min-h-tap items-center gap-1 text-left text-xs text-muted-foreground hover:text-foreground">
              <Settings className="h-3.5 w-3.5" aria-hidden="true" />
              ランキングCGの設定
            </button>
            <button onClick={() => navigate(`/event/${eventId}/oneshot/control`)}
            className="flex min-h-tap items-center gap-1 text-left text-xs text-muted-foreground hover:text-foreground">
              <Settings className="h-3.5 w-3.5" aria-hidden="true" />
              字幕スーパーの設定
            </button>
            <button onClick={() => navigate(`/event/${eventId}/quiz-stack/control`)}
            className="flex min-h-tap items-center gap-1 text-left text-xs text-muted-foreground hover:text-foreground">
              <Settings className="h-3.5 w-3.5" aria-hidden="true" />
              クイズ・アンケートの設定
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
