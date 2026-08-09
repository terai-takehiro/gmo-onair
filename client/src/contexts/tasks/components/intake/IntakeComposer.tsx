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
 *
 * **録音そのものは `Recorder.tsx`** にあります（構える → 録る → 下読み）。
 * `録音する` を押しても**まだ録り始めません** — 録音の画面に切り替わり、
 * そこの `録音を開始` を押して初めて録ります（相手に断る時間を作るため）。
 */
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, GitBranch, Image as ImageIcon, Loader2, Mic, Paperclip, Send, Sparkles, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { Created } from './useIntake';
import { Recorder } from './Recorder';

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
  /** 録音の画面を出しているか。**出しただけではまだ録っていない** */
  const [recorderOpen, setRecorderOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  // ── 録音（構える → 録る）。**この間は投入欄を出さない** ──────────
  if (recorderOpen) {
    return (
      <Recorder
        compact={compact}
        onCancel={() => setRecorderOpen(false)}
        onDone={(f) => { setRecorderOpen(false); onAudio(f); }}
      />
    );
  }

  return (
    <div className={cn(
      'rounded-card p-3 sm:p-4',
      // モックの投入口は**白いカード**（`#fff` ＋ 既定の罫）。淡い青の面にすると
      // トップの中でここだけ色が付き、「お知らせ」の帯に見える
      compact ? 'border border-primary-border bg-primary-surface-weak/40' : 'border border-border bg-card',
    )}
    >
      {/*
        見出し。**スマホでは出さない** — シートが同じことを言う枠を既に持っており、
        2 行に増えると書く場所が下がる
      */}
      {!compact && (
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-info" aria-hidden="true" />
          <span className="text-cardtitle">依頼・タスクを書き留める</span>
          <div className="flex-1" />
          {/* **行き先を人に選ばせない**ことを、書く前に見えるところに出す */}
          <span className="rounded-control text-sub-sm inline-flex items-center gap-1.5 border border-border bg-surface-subtle px-2.5 py-1 font-bold text-muted-foreground">
            <GitBranch className="h-3 w-3 shrink-0" aria-hidden="true" />行き先は AI が振り分けます
          </span>
        </div>
      )}

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
        <SmallButton icon={Mic} onClick={() => setRecorderOpen(true)}>{compact ? '録音' : '録音する'}</SmallButton>

        <div className="flex-1" />
        <Button type="button" size="sm" className="h-9 gap-1.5" disabled={!canSubmit} onClick={onSubmit}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            : <Send className="h-4 w-4" aria-hidden="true" />}
          内容を確認する
        </Button>
      </div>

      {/*
        **「押すまで登録しません」を必ず残す。** 書いた瞬間に登録されると思われると、
        言い回しを気にして書く手が止まる（この投入口はまず書いてもらうことが目的）
      */}
      <p className="text-note mt-2 text-muted-foreground">
        誰に・何を・いつまでに を AI が読み取ります。画像・PDF は文字を起こして同じ確認画面に出します。
        <span className="font-bold text-foreground">押すまで登録しません</span>
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

