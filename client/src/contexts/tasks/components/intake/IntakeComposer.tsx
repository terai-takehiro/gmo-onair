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
import { Link } from 'react-router-dom';
import { ArrowRight, Image as ImageIcon, Loader2, Mic, Paperclip, Send, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { recordingFileName } from '@gmo-onair/shared/src/client-v4/recording';
import type { Created } from './useIntake';

/** 32kbps。**既定の 128kbps だと 25 分で Whisper の 25MB 上限に当たる** */
const BITRATE = 32_000;

/**
 * 録音の上限は **Whisper の 25MB** だけ（32kbps でおよそ 100 分）。
 *
 * ── 3 分の制限はやめました ──────────────────────────────────
 *
 * いちど「3 分で自動的に止める」を入れていましたが、**打合せには短すぎて
 * 意味がない**というご指摘をいただいて作り直しました。制限の理由は
 * 「文字起こしをリクエストの中で待っていたので nginx の 60 秒で切れる」
 * ことでしたが、**待つのをやめました** — 行を先に作って裏で進め、
 * 画面はその行を読みに行きます（議事録と同じ形）。
 *
 * ここで見るのは**録れる量**だけです。25MB に近づいたら自分から止めます
 * （超えて投げると Whisper に断られ、録った内容が丸ごと無駄になる）。
 */
const MAX_REC_BYTES = 25 * 1024 * 1024;
/** 32kbps ≒ 4KB/秒。残り時間の目安を出すのに使う（正確でなくてよい） */
const BYTES_PER_SEC = BITRATE / 8;
/** 残りがこれを切ったら赤くする */
const REC_WARN_SEC = 120;
/** 上限の目安（秒）。**画面に出すのはこの値ではなく残り時間** */
const MAX_REC_SEC = Math.floor(MAX_REC_BYTES / BYTES_PER_SEC);

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
  /**
   * 作った案件（ネタ）。**2件以上のときだけ**渡ってきます —
   * 1件なら登録した時点でその案件を開いているので、リンクは出しません。
   */
  createdProjects?: Created[];
  /** スマホのシートの中。ボタンの言葉と並びを変える */
  compact?: boolean;
}

export function IntakeComposer({
  text, onTextChange, files, onAddFiles, onRemoveFile,
  onSubmit, onAudio, canSubmit, pending, error, doneMsg, createdProjects, compact,
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
        // **止めたらそのまま解析まで進む。** もう一度押させない。
        // ⚠️ 拡張子は **`mr.mimeType` から決める** — `.webm` 決め打ちにすると
        // **iPhone / Safari（mp4）で必ず文字起こしに失敗する**（Whisper は拡張子で判断する）
        onAudio(new File(
          [blob],
          recordingFileName(`録音_${new Date().toISOString().slice(0, 10)}`, mr.mimeType || blob.type),
          { type: blob.type },
        ));
      };
      mr.start(1000);
      recorder.current = mr;
      setRecording(true);
      setSeconds(0);
      // **上限で自分から止める。** 止めずに投げさせると、nginx が 60 秒で切って
      // 「送れませんでした」としか出ない（録った本人は理由が分からない）
      timer.current = setInterval(() => {
        setSeconds((s) => {
          const next = s + 1;
          if (next >= MAX_REC_SEC) stop(true);
          return next;
        });
      }, 1000);
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
    const left = MAX_REC_SEC - seconds;
    return (
      <div className="rounded-card border border-destructive-border bg-destructive-surface p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="v4-rec-dot" aria-hidden="true" />
          <span className="font-number text-h2 text-destructive" aria-live="polite">{mmss(seconds)}</span>
          <span className="v4-wave" aria-hidden="true">
            <i /><i /><i /><i /><i /><i /><i />
          </span>
          {/* **残りが少なくなってから出す。** 100分の録音でずっと
              「あと 97:12」と出ていても読む理由がない */}
          {left <= REC_WARN_SEC && (
            <span className="text-note font-bold text-destructive">
              あと {mmss(Math.max(0, left))} で自動で止まります
            </span>
          )}
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
          <strong className="font-bold">約100分まで</strong>録れます。
          止めたあとの文字起こしは<strong className="font-bold">裏で進みます</strong> — 画面を閉じても止まりません。
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
      {/* **2件以上できたときだけ並べる。** どれか1つを勝手に開くと、
          残りが登録されたことに気づけない */}
      {createdProjects && createdProjects.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-1">
          {createdProjects.map((p) => (
            <li key={p.id}>
              <Link
                to={`/sales/projects/${p.id}`}
                className="text-note min-h-tap inline-flex items-center gap-1 font-bold text-primary hover:underline lg:min-h-0"
              >
                {p.title} を開く<ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
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
