/**
 * 「録音を文字にしています」の待ち受け（投入口）
 *
 * ── 押した人を待たせない ────────────────────────────────────
 *
 * 文字起こしは 1 時間の録音で数分かかります。**サーバーが待たない形**
 * （行を先に作って裏で進める）にしたので、画面はその行を読みに行きます。
 *
 * ── 画面を閉じてもよい、と書く ──────────────────────────────
 *
 * これを書かないと、終わるまでこのタブを開いたままにする人が出ます。
 * 実際には裏で進み、あとから「タスク・依頼」の投入ログに出ます。
 *
 * ── 経過時間を出す ──────────────────────────────────────────
 *
 * 進み具合はサーバーが持っていません（Whisper は途中経過を返さない）。
 * **持っていない進捗率を作らない** — 代わりに経過時間を出します。
 * 止まっているのか進んでいるのかは、これで分かります。
 */
import { useEffect, useState } from 'react';
import { Mic } from 'lucide-react';

function mmss(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function Transcribing() {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="rounded-card border border-ai-border bg-ai-surface p-3 sm:p-4">
      <p className="text-list flex flex-wrap items-center gap-2 text-ai">
        <Mic className="h-4 w-4 shrink-0" aria-hidden="true" />
        録音を文字にしています
        <span className="font-number text-note text-secondary-foreground" aria-live="polite">
          {mmss(sec)} 経過
        </span>
      </p>
      <p className="text-note mt-1.5 text-secondary-foreground">
        1時間の録音で数分かかります。
        <strong className="font-bold">この画面を閉じても進みます</strong> —
        出来上がると「タスク・依頼」の投入ログに出るので、あとから確認できます。
      </p>
      <div className="mt-2.5 flex flex-col gap-2" aria-hidden="true">
        {[0, 1, 2].map((i) => <span key={i} className="v4-skeleton h-12 w-full rounded-card" />)}
      </div>
    </div>
  );
}
