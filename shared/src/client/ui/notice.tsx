/**
 * NoticeBar — 操作の結果を伝える1本のお知らせ帯。
 *
 * ── トーストにしない理由 (docs/design/v4/_rules.md「操作したときの決めごと」) ──
 *
 * **タイマーで消えない・積み上がらない・浮かない。** 流れて消える通知は
 * 「見ていない瞬間に消える」ので、**保存に失敗したことに気づけません**。
 * 画面内の操作フィードバックはここに**1件だけ**出し、人が閉じるまで残します。
 *
 * ── いま何が起きているか (v4 着手時に数えた) ────────────────────
 *
 * `useToast` を使っている画面は**7アプリで0か所**でした (部品だけが残っていて、
 * 誰も呼んでいない)。実際に使われているのは **`alert()` が 25 か所** — つまり
 * 「保存に失敗しました」がブラウザ標準のダイアログで出ていて、
 * デザインの外側に出るうえ押すまで他の操作ができない状態です。
 *
 * 出る場所は各アプリのシェルに置いた `<NoticeBar />` 1 か所だけ。
 */
import { useEffect, useState, type ReactNode } from 'react';
import { X, AlertCircle, CheckCircle2, Info, AlertTriangle } from 'lucide-react';
import { cn } from '../utils';

export type NoticeTone = 'success' | 'error' | 'info' | 'warning';

export interface Notice {
  tone: NoticeTone;
  title: string;
  description?: string;
}

let current: Notice | null = null;
const listeners = new Set<(n: Notice | null) => void>();

export function setNotice(n: Notice | null) {
  current = n;
  listeners.forEach((l) => l(current));
}

export function clearNotice() {
  setNotice(null);
}

/**
 * いま出ているお知らせ。**React の外から読むための口**。
 * 「共通の受け皿 (`queryClient` の MutationCache) が本当に帯を出すか」を
 * ブラウザ無しで確かめるのに使う (`shared/tests/queryClient.test.ts`)。
 * 画面側は `useNotice()` を使うこと。
 */
export function getNotice(): Notice | null {
  return current;
}

export function useNotice(): Notice | null {
  const [n, setN] = useState<Notice | null>(current);
  useEffect(() => {
    listeners.add(setN);
    return () => {
      listeners.delete(setN);
    };
  }, []);
  return n;
}

/**
 * 色は T1b で足した「状態の帯」トークン (`--<状態>-surface` / `--<状態>-border`) を使う。
 * **`warning-strong` のような未定義の名前を書かないこと** — CSS はその宣言を黙って
 * 捨てるので、枠線も文字色も付かない帯になる (誰も気づけない)。
 */
const TONE: Record<NoticeTone, { cls: string; Icon: typeof Info }> = {
  success: { cls: 'border-success-border bg-success-surface text-success', Icon: CheckCircle2 },
  error: { cls: 'border-destructive-border bg-destructive-surface text-destructive', Icon: AlertCircle },
  info: { cls: 'border-info-border bg-info-surface text-info', Icon: Info },
  warning: { cls: 'border-warning-border-strong bg-warning-surface text-warning', Icon: AlertTriangle },
};

/*
 * 二重に置いても1本しか出ないようにする。
 * 置き場所はアプリのシェル直下1か所だが、**「置き忘れ」より「二重」の方を許す**
 * 設計にしてある (全画面ページを取りこぼすと、そこだけ何も知らせなくなる)。
 */
let barMounted = 0;

/** アプリのシェル直下に置く。出るものが無ければ何も描かない */
export function NoticeBar({ className }: { className?: string }): ReactNode {
  const n = useNotice();
  const [primary, setPrimary] = useState(false);
  useEffect(() => {
    barMounted += 1;
    setPrimary(barMounted === 1);
    return () => {
      barMounted -= 1;
    };
  }, []);
  if (!primary || !n) return null;
  const { cls, Icon } = TONE[n.tone];
  return (
    <div
      role={n.tone === 'error' ? 'alert' : 'status'}
      /*
       * **鍵に帯の中身を入れて、出るたびに動かす。** 鍵が無いと、
       * 続けて2回操作したとき（保存 → 保存）2回目の帯が**前の帯と同じ位置に
       * 黙って差し替わる**ので、出たことに気づけません。
       * 動きは `tokens-v4.css` の `.v4-toast-in`（モックの `toastIn` そのまま）。
       * 凍結4アプリはこのクラスを知らないので、今までどおり静かに出ます。
       */
      key={`${n.tone}:${n.title}`}
      className={cn('text-sub v4-toast-in sticky top-0 z-[70] flex items-start gap-2 border-b px-4 py-2.5', cls, className)}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-bold">{n.title}</p>
        {n.description && <p className="mt-0.5 opacity-90">{n.description}</p>}
      </div>
      <button
        type="button"
        onClick={clearNotice}
        className="min-h-tap min-w-tap -my-1.5 shrink-0 rounded-control opacity-70 hover:opacity-100"
        aria-label="閉じる"
      >
        <X className="mx-auto h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
