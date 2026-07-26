/**
 * NoticeBar — 操作の結果を伝える1本のお知らせ帯。
 *
 * **トーストではない**: タイマーで消えない・積み上がらない・浮かない。
 * 通知は「溜まる場所 (ベル)」と「朝の1通」だけにするという方針 (§4.15) に沿って、
 * 画面内の操作フィードバックはここに1件だけ出し、**人が閉じるまで残す**。
 * 流れて消えると「保存に失敗した」ことに気づけないため。
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

export function useNotice(): Notice | null {
  const [n, setN] = useState<Notice | null>(current);
  useEffect(() => {
    listeners.add(setN);
    return () => { listeners.delete(setN); };
  }, []);
  return n;
}

const TONE: Record<NoticeTone, { cls: string; Icon: typeof Info }> = {
  success: { cls: 'border-success/40 bg-success/10 text-success', Icon: CheckCircle2 },
  error: { cls: 'border-destructive/40 bg-destructive-surface text-destructive', Icon: AlertCircle },
  info: { cls: 'border-primary/30 bg-primary/[0.06] text-primary', Icon: Info },
  warning: { cls: 'border-warning-strong/40 bg-warning-surface text-warning-strong', Icon: AlertTriangle },
};

// 二重に置いても1本しか出ないようにする (v2.9.290)。
// 置き場所はアプリのルート直下 1 か所だが、全画面ページ (OnAir・ランダウン等) を
// 取りこぼさないために「置き忘れ」より「二重」の方を許す設計にしてある。
let barMounted = 0;

/** アプリのルート直下に置く。出るものが無ければ何も描かない */
export function NoticeBar({ className }: { className?: string }): ReactNode {
  const n = useNotice();
  const [primary, setPrimary] = useState(false);
  useEffect(() => {
    barMounted += 1;
    const mine = barMounted === 1;
    setPrimary(mine);
    return () => { barMounted -= 1; };
  }, []);
  if (!primary) return null;
  if (!n) return null;
  const { cls, Icon } = TONE[n.tone];
  return (
    <div
      role={n.tone === 'error' ? 'alert' : 'status'}
      className={cn('sticky top-0 z-[70] flex items-start gap-2 border-b px-4 py-2.5 text-[13px]', cls, className)}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-bold">{n.title}</p>
        {n.description && <p className="mt-0.5 opacity-90">{n.description}</p>}
      </div>
      <button
        type="button"
        onClick={clearNotice}
        className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
        aria-label="閉じる"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
