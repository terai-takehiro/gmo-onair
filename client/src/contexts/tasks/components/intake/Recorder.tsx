/**
 * 投入口の録音（構える → 録る → 止める）
 *
 * ── 押した瞬間には録り始めない（ご判断）────────────────────────
 *
 * 以前は `録音する` を押した瞬間にマイクが動き始めました。
 * **相手に断る前に録音が始まってしまう**うえ、押し間違いがそのまま録音になります。
 * いまは**録音の画面に切り替わるだけ**で、そこの `録音を開始` を押して初めて録ります。
 *
 * この形にすると、**「録音することを相手にお伝えください」を録る前に出せます** —
 * 録音中に出しても、もう録り始めているので手遅れです。
 *
 * ── 録りながら文字にして見せる（下読み）──────────────────────
 *
 * 赤い点と経過時間だけでは、**マイクが別の機器を向いていても同じ見た目**になります。
 * そこで **20 秒ごとに短い断片を送って文字にし、直近 4 行だけ**出します。
 * 自分の声が拾えているかがその場で分かります。
 *
 * ⚠️ **下読みは使い捨てです。** 本文になるのは、止めたあとに
 * **録音まるごとを 1 回で通した文字起こし**です。20 秒で切ると
 * **切れ目で単語が割れる**ので、議事録の本文にはできません。
 *
 * ── 録音機を 2 つ動かす理由 ──────────────────────────────────
 *
 * 下読みのために録音機を止めて録り直すと、**その継ぎ目の音が本番からも欠けます**。
 * なので**本番用（止めずに録り続ける）と下読み用（20 秒ごとに録り直す）を
 * 別々に**動かします。同じマイクの流れを 2 つの録音機で共有できます。
 */
import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { recordingFileName } from '@gmo-onair/shared/src/client-v4/recording';

/** 32kbps。**既定の 128kbps だと 25 分で Whisper の 25MB 上限に当たる** */
const BITRATE = 32_000;
/** 上限は Whisper の 25MB だけ（32kbps でおよそ 100 分）。時間の上限は置かない */
const MAX_REC_BYTES = 25 * 1024 * 1024;
const BYTES_PER_SEC = BITRATE / 8;
const MAX_REC_SEC = Math.floor(MAX_REC_BYTES / BYTES_PER_SEC);
/** 残りがこれを切ったら赤くする */
const REC_WARN_SEC = 120;
/**
 * 下読みの間隔。**費用を抑えるために段階を付けます。**
 *
 * 目的は「**本当に拾えているか**を確かめる」ことなので、
 * **最初の 1 分だけ細かく**出せば足ります。そのあとは
 * 「まだ動いている」ことが分かればよいので、間隔を空けます。
 *
 *   1 時間の打合せ: 20秒 × 3 ＋ 5分ごと × 11 = **14 回 ≒ 4.7 分ぶん**
 *   （ずっと 20 秒ごとだと 180 回 ＝ 60 分ぶん。**12 分の 1** になります）
 */
const PREVIEW_SEC = 20;
/** 細かく出すのは最初のこの秒数まで */
const PREVIEW_DENSE_UNTIL_SEC = 60;
/** そのあとの間隔 */
const PREVIEW_SPARSE_SEC = 300;
/** 画面に出す下読みの行数（ご要望: 3〜4行） */
const PREVIEW_LINES = 4;

function mmss(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function Recorder({
  onDone, onCancel, compact,
}: {
  /** 録り終わった音声。**呼ぶ側がそのまま解析へ送る**（もう一度押させない） */
  onDone: (file: File) => void;
  onCancel: () => void;
  compact?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /** 下読み。**直近だけ出す**ので、貯めるのは配列、見せるのは末尾 4 行 */
  const [preview, setPreview] = useState<string[]>([]);
  const [previewOff, setPreviewOff] = useState(false);

  const stream = useRef<MediaStream | null>(null);
  /** 本番用。**止めずに録り続ける**（継ぎ目を作らない） */
  const main = useRef<MediaRecorder | null>(null);
  const mainChunks = useRef<Blob[]>([]);
  /** 下読み用。20 秒ごとに録り直す */
  const peek = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const peekTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  /** 経過秒（下読みの間隔の判定に使う。state だと閉じ込められて古い値を見る） */
  const elapsed = useRef(0);
  const lastPeekAt = useRef(0);
  /** いまの下読みを録り始めた秒。**`PREVIEW_SEC` を超えたら止める**（送る長さの上限） */
  const peekStartedAt = useRef(0);

  /** 画面を離れてもマイクを掴んだままにしない（録音インジケータが消えない） */
  useEffect(() => () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    if (timer.current) clearInterval(timer.current);
    if (peekTimer.current) clearInterval(peekTimer.current);
  }, []);

  /** 下読みを 1 本送る。**失敗しても録音は止めない** */
  const sendPeek = async (blob: Blob, mimeType: string) => {
    if (blob.size < 2000) return; // 無音に近い断片は投げない（無駄打ち）
    const fd = new FormData();
    fd.append('audio', new File([blob], recordingFileName('下読み', mimeType), { type: blob.type }));
    try {
      const r = (await api.post('/dailyops/tasks/intake/preview-transcribe', fd)).data.data as
        { text: string; reason?: string };
      if (r.reason === 'NOT_CONFIGURED') { setPreviewOff(true); return; }
      const t = (r.text ?? '').trim();
      if (t) setPreview((p) => [...p, t]);
    } catch {
      // 通信が一瞬切れただけのことがある。**黙って次の 20 秒を待つ**
    }
  };

  /** 下読み用の録音機を 1 本ぶん回す（止める → 送る → 録り直す） */


  /**
   * 下読み用の録音機を 1 本始める。**`PREVIEW_SEC` ぶんだけ録って止める。**
   *
   * ⚠️ **止めたその場で次を始めないこと**（レビューでの指摘 #79）。
   * 前の版は `onstop` の中で必ず録り直していたので、間隔が 5 分になった
   * あとも**録りっぱなし**になり、5 分ごとに**5 分まるごと**を送っていました
   * ＝ 打合せの音声を**丸ごと2回**文字にしていたことになります
   * （画面には「費用を抑えるため 5 分ごと」と出ているのに、実際は 12 分の1に
   * なっていません。**送っている長さは画面のどこにも出ない**ので気づけません）。
   * 次を始めるのは下の見張り（`peekTimer`）だけです。
   */
  const startPeek = () => {
    const s = stream.current;
    if (!s) return;
    try {
      const mr = new MediaRecorder(s, { audioBitsPerSecond: BITRATE });
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      mr.onstop = () => {
        peek.current = null;
        void sendPeek(new Blob(chunks, { type: mr.mimeType || 'audio/webm' }), mr.mimeType);
      };
      mr.start();
      peek.current = mr;
      peekStartedAt.current = elapsed.current;
    } catch {
      // 2 本目の録音機を作れない端末がある。**下読みだけ諦める**（録音は続く）
      setPreviewOff(true);
    }
  };

  const start = async () => {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;
      const mr = new MediaRecorder(s, { audioBitsPerSecond: BITRATE });
      mainChunks.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) mainChunks.current.push(e.data); };
      mr.onstop = () => {
        s.getTracks().forEach((t) => t.stop());
        const blob = new Blob(mainChunks.current, { type: mr.mimeType || 'audio/webm' });
        // ⚠️ 拡張子は **`mr.mimeType` から決める** — `.webm` 決め打ちにすると
        // **iPhone / Safari（mp4）で必ず文字起こしに失敗する**
        onDone(new File(
          [blob],
          recordingFileName(`録音_${new Date().toISOString().slice(0, 10)}`, mr.mimeType || blob.type),
          { type: blob.type },
        ));
      };
      mr.start(1000);
      main.current = mr;
      setRecording(true);
      setSeconds(0);
      elapsed.current = 0;
      lastPeekAt.current = 0;
      setPreview([]);
      timer.current = setInterval(() => {
        setSeconds((v) => {
          const next = v + 1;
          elapsed.current = next;
          if (next >= MAX_REC_SEC) stop(true);
          return next;
        });
      }, 1000);
      startPeek();
      // **1 秒ごとに見て、そのときの間隔で回す。** `setInterval` を張り替えると
      // 切り替わりの瞬間に 1 本ぶん飛ぶ
      peekTimer.current = setInterval(() => {
        const t = elapsed.current;
        const p = peek.current;
        // ① 録っている途中なら、**20 秒たったところで止める**（＝送る長さの上限）
        if (p && p.state !== 'inactive') {
          if (t - peekStartedAt.current >= PREVIEW_SEC) p.stop();
          return;
        }
        // ② 空いていて、次の番が来ていれば始める
        const every = t <= PREVIEW_DENSE_UNTIL_SEC ? PREVIEW_SEC : PREVIEW_SPARSE_SEC;
        if (t > 0 && t - lastPeekAt.current >= every) { lastPeekAt.current = t; startPeek(); }
      }, 1000);
    } catch {
      // 権限を断られた / マイクが無い。**理由を出す** — 押しても何も起きないのが最悪
      setError('マイクを使えませんでした。ブラウザの許可を確認するか、ファイルを添付してください。');
    }
  };

  const stop = (send: boolean) => {
    if (timer.current) clearInterval(timer.current);
    if (peekTimer.current) clearInterval(peekTimer.current);
    const p = peek.current;
    if (p && p.state !== 'inactive') { p.onstop = null; p.stop(); }
    const mr = main.current;
    if (!send && mr) mr.onstop = () => mr.stream.getTracks().forEach((t) => t.stop());
    mr?.stop();
    setRecording(false);
    if (!send) onCancel();
  };

  // ── 構える（まだ録っていない）────────────────────────────
  if (!recording) {
    return (
      <div className="rounded-card border border-border bg-surface-subtle p-3 sm:p-4">
        <p className="text-cardtitle flex items-center gap-2">
          <Mic className="h-4 w-4 shrink-0" aria-hidden="true" />録音
        </p>
        {/* **録る前に出す。** 録音中に出しても、もう録り始めているので手遅れ */}
        <p className="text-note mt-1.5 text-secondary-foreground">
          <strong className="font-bold">録音することを相手にお伝えください。</strong>
          音声は文字にしたら<strong className="font-bold">保存せず破棄します</strong>（残るのは文字だけです）。
          <strong className="font-bold">約100分まで</strong>録れます。
          止めたあとの文字起こしは<strong className="font-bold">裏で進みます</strong> — 画面を閉じても止まりません。
        </p>
        {error && <p className="text-note mt-2 text-destructive">{error}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" className="h-10 gap-1.5" onClick={start}>
            <Mic className="h-4 w-4" aria-hidden="true" />録音を開始
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-10" onClick={onCancel}>
            キャンセル
          </Button>
        </div>
      </div>
    );
  }

  // ── 録音中 ────────────────────────────────────────────────
  const left = MAX_REC_SEC - seconds;
  const lines = preview.slice(-PREVIEW_LINES);
  return (
    <div className="rounded-card border border-destructive-border bg-destructive-surface p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="v4-rec-dot" aria-hidden="true" />
        <span className="font-number text-h2 text-destructive" aria-live="polite">{mmss(seconds)}</span>
        <span className="v4-wave" aria-hidden="true">
          <i /><i /><i /><i /><i /><i /><i />
        </span>
        {left <= REC_WARN_SEC && (
          <span className="text-note font-bold text-destructive">
            あと {mmss(Math.max(0, left))} で自動で止まります
          </span>
        )}
        <div className="flex-1" />
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => stop(false)}>
          キャンセル
        </Button>
        <Button type="button" size="sm" className="h-9 gap-1.5" onClick={() => stop(true)}>
          <Square className="h-3.5 w-3.5" aria-hidden="true" />停止して読み取る
        </Button>
      </div>

      {/* ── 下読み。**拾えているかを確かめるためだけ** ────────────── */}
      <div className={cn('rounded-note mt-2.5 border border-border bg-card p-2.5', compact ? '' : 'min-h-[76px]')}>
        <p className="v4-eyebrow">聞き取れているもの（下読み）</p>
        {previewOff ? (
          <p className="text-note mt-1 text-muted-foreground">
            この環境では下読みを出せません。<strong className="font-bold">録音は続いています。</strong>
          </p>
        ) : lines.length === 0 ? (
          <p className="text-note mt-1 text-muted-foreground">
            最初の {PREVIEW_SEC} 秒ぶんが出るまでお待ちください…
          </p>
        ) : (
          <ul className="mt-1 flex flex-col gap-0.5" aria-live="polite">
            {lines.map((l, i) => (
              <li
                key={`${i}-${l.slice(0, 12)}`}
                className={cn(
                  'text-note [overflow-wrap:anywhere]',
                  // **いちばん新しい行だけ濃く。** 全部同じ濃さだと、
                  // どこが増えたのか目で追えない
                  i === lines.length - 1 ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {l}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-note mt-1.5 text-secondary-foreground">
        下読みは<strong className="font-bold">切れ端</strong>なので、単語が割れることがあります。
        <strong className="font-bold">本文は止めたあとに録音まるごとから作ります。</strong>
        {/* **間隔が空くことを先に言う。** 言わないと「止まった」と読まれる */}
        {seconds > PREVIEW_DENSE_UNTIL_SEC
          ? `　いまは ${PREVIEW_SPARSE_SEC / 60} 分ごとに出しています（費用を抑えるため）。`
          : `　最初の1分は ${PREVIEW_SEC} 秒ごと、そのあとは ${PREVIEW_SPARSE_SEC / 60} 分ごとです。`}
      </p>
    </div>
  );
}
