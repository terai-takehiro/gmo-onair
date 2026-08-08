/**
 * 投入欄（入力 1 つ ＋ 添付 ＋ 録音）
 *
 * ── 切替を廃止した ────────────────────────────────────────
 *
 * v4 より前は「ひとこと / 議事録」の切替があり、**行き先はどちらもタスクだけ**でした。
 * 切替は「押す人に AI の都合を選ばせていた」だけなので廃止し、
 * **書いても貼っても撮っても録っても同じ口**にしました。
 * 行き先は AI が 1 件ずつ決め、確認画面に札で出します。
 *
 * ── 録音は PC にも置く ────────────────────────────────────
 *
 * これまで録音は `/sales/record`（スマホの入口）だけでした。打合せの多くは
 * PC の前で行われるので、**投げる場所と録る場所が違う**のは無駄な 1 手です。
 * 部品は案件詳細の `RecordDialog` と同じ設定（32kbps）にしてあります —
 * **既定の 128kbps だと 25 分で Whisper の上限に当たります**。
 *
 * ── 録っていることを伝える ────────────────────────────────
 *
 * 取引先の声が入るので、録音中は**「相手にお伝えください」を必ず出します**。
 * ここを書かないと、黙って録る運用が既定になってしまいます。
 */
import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, Mic, Paperclip, Send, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/** 32kbps。**既定の 128kbps だと 25 分で Whisper の 25MB 上限に当たる** */
const BITRATE = 32_000;

function mmss(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export interface IntakeComposerProps {
  text: string;
  onTextChange: (v: string) => void;
  files: File[];
  onAddFiles: (f: FileList | null) => void;
  onRemoveFile: (f: File) => void;
  onSubmit: () => void;
  onAudio: (f: File) => void;
  canSubmit: boolean;
  pending: boolean;
  error?: string | null;
  doneMsg?: string | null;
  /** スマホのシートの中。ボタンの言葉と並びを変える */
  compact?: boolean;
}

export function IntakeComposer({
  text, onTextChange, files, onAddFiles, onRemoveFile,
  onSubmit, onAudio, canSubmit, pending, error, doneMsg, compact,
}: IntakeComposerProps) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  // **画面を離れてもマイクを掴んだままにしない。** 掴みっぱなしだと
  // ブラウザの録音インジケータが消えず、録られ続けていると思われる
  useEffect(() => () => {
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
    if (timer.current) clearInterval(timer.current);
  }, []);

  const start = async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { audioBitsPerSecond: BITRATE });
      chunks.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: mr.mimeType || 'audio/webm' });
        // **止めたらそのまま解析まで進む。** もう一度押させない
        onAudio(new File([blob], `録音_${new Date().toISOString().slice(0, 10)}.webm`, { type: blob.type }));
      };
      mr.start(1000);
      recorder.current = mr;
      setRecording(true);
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      // 権限を断られた / マイクが無い。**理由を出す** — 押しても何も起きないのが最悪
      setMicError('マイクを使えませんでした。ブラウザの許可を確認するか、ファイルを添付してください。');
    }
  };

  const stop = (send: boolean) => {
    const mr = recorder.current;
    if (!send && mr) mr.onstop = () => mr.stream.getTracks().forEach((t) => t.stop());
    mr?.stop();
    setRecording(false);
    if (timer.current) clearInterval(timer.current);
  };

  // ── 録音中 ────────────────────────────────────────────────
  if (recording) {
    return (
      <div className="rounded-card border border-destructive-border bg-destructive-surface p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="v4-rec-dot" aria-hidden="true" />
          <span className="font-number text-h2 text-destructive" aria-live="polite">{mmss(seconds)}</span>
          <span className="v4-wave" aria-hidden="true">
            <i /><i /><i /><i /><i /><i /><i />
          </span>
          <div className="flex-1" />
          <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => stop(false)}>
            やめる
          </Button>
          <Button type="button" size="sm" className="h-9 gap-1.5" onClick={() => stop(true)}>
            <Square className="h-3.5 w-3.5" aria-hidden="true" />停止して読み取る
          </Button>
        </div>
        <p className="text-note mt-2 text-secondary-foreground">
          <strong className="font-bold">録音することを相手にお伝えください。</strong>
          音声は文字にしたら<strong className="font-bold">保存せずに捨てます</strong>（残るのは文字だけです）。
          約100分まで録れます。
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-primary-border bg-primary-surface-weak/40 p-3 sm:p-4">
      <Textarea
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        rows={compact ? 4 : 3}
        className="resize-y bg-background text-sm"
        placeholder={
          '書いても貼っても、写真でも録音でも大丈夫です。AI が行き先を決めます。\n'
          + '例）山田さんに 明日18時までに 請求書の送付をお願いした\n'
          + '例）〇〇株式会社から配信の相談。7/31 までに返事がほしいとのこと'
        }
      />

      {files.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {files.map((f) => (
            <li
              key={`${f.name}:${f.size}`}
              className="rounded-chip flex items-center gap-1.5 border border-border bg-card py-1 pl-2.5 pr-1"
            >
              <span className="text-note max-w-[14rem] truncate">{f.name}</span>
              <span className="font-number text-note text-muted-foreground">
                {(f.size / 1024 / 1024).toFixed(1)}MB
              </span>
              <button
                type="button"
                onClick={() => onRemoveFile(f)}
                aria-label={`${f.name} を外す`}
                className="v4-tap flex h-5 w-5 items-center justify-center rounded-chip text-muted-foreground hover:bg-muted"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          multiple
          accept="application/pdf,image/*,text/plain,text/csv,text/markdown,.md,.log"
          className="sr-only"
          onChange={(e) => { onAddFiles(e.target.files); e.target.value = ''; }}
        />
        <input
          ref={imageInput}
          type="file"
          multiple
          accept="image/*"
          // スマホでは「写真を撮る」になる（`capture` を付けるとカメラが開く）
          {...(compact ? { capture: 'environment' as const } : {})}
          className="sr-only"
          onChange={(e) => { onAddFiles(e.target.files); e.target.value = ''; }}
        />
        <SmallButton icon={Paperclip} onClick={() => fileInput.current?.click()}>
          {compact ? 'ファイル' : 'ファイルを添付'}
        </SmallButton>
        <SmallButton icon={ImageIcon} onClick={() => imageInput.current?.click()}>
          {compact ? '写真を撮る' : '画像を添付'}
        </SmallButton>
        <SmallButton icon={Mic} onClick={start}>{compact ? '録音' : '録音する'}</SmallButton>

        <div className="flex-1" />
        <Button type="button" size="sm" className="h-9 gap-1.5" disabled={!canSubmit} onClick={onSubmit}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            : <Send className="h-4 w-4" aria-hidden="true" />}
          内容を確認する
        </Button>
      </div>

      <p className="text-note mt-2 text-muted-foreground">
        期限は<span className="font-bold text-foreground">何月何日何時何分まで</span>で書くと、そのまま登録できます。
        PDF・画像は文字を読み取ってから、同じ確認画面に出します。
      </p>

      {doneMsg && (
        <p className="text-note mt-2 flex items-center gap-1.5 text-success">
          <Send className="h-3.5 w-3.5" aria-hidden="true" />{doneMsg}
        </p>
      )}
      {micError && <p className="text-note mt-2 text-destructive">{micError}</p>}
      {error && <p className="text-note mt-2 text-destructive">{error}</p>}
    </div>
  );
}

function SmallButton({
  icon: Icon, onClick, children,
}: { icon: typeof Mic; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-control min-h-tap inline-flex items-center gap-1.5 border border-border bg-card px-2.5 text-note',
        'text-secondary-foreground hover:border-primary-border lg:min-h-0 lg:py-1.5',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {children}
    </button>
  );
}
