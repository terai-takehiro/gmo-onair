/**
 * コメントを打つところ（段F・docs/design/v4/wiki.md §6-②・§6-⑧）
 *
 * ⚠️ **スマホでも書けます**（§6-⑧「コメントは書ける」）。現場で気づいたことを
 * その場で残すのが主な使い方なので、入力欄は PC と同じものを出し、
 * ボタンはタップできる大きさ（44px）にします。
 *
 * ⚠️ **日本語入力を壊さない。** 変換の確定で押される Enter を送信にしないため、
 * 送るのは ボタン と `Ctrl`（`⌘`）＋`Enter` だけにし、変換中は何もしません
 * （`AskComposer` と同じ約束。`npm run verify:ime` が見ています）。
 *
 * ⚠️ **失敗したら打った文を残します。** 何が起きたかは共通のバナーが出すので、
 * ここでは消さずに、もう一度押せる状態にしておきます。
 */
import { useRef, useState } from 'react';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import { WIKI_COMMENT_MAX_CHARS } from '@/components/page/commentApi';

export interface CommentComposerProps {
  /** 送る。成功したときだけ入力欄を空にするので、待てる形で受け取る */
  onSend: (body: string) => Promise<unknown>;
  pending: boolean;
  placeholder?: string;
  /** 返信のときは2行・新しいコメントは3行 */
  rows?: number;
  submitLabel?: string;
  /** 画面読み上げに出す入力欄の名前 */
  fieldLabel?: string;
  /** 返信のときだけ出す「やめる」 */
  onCancel?: () => void;
  autoFocus?: boolean;
}

export default function CommentComposer({
  onSend,
  pending,
  placeholder = '気づいたこと・分からないことを書く（Markdown が使えます）',
  rows = 3,
  submitLabel = '書き込む',
  fieldLabel = 'コメント',
  onCancel,
  autoFocus,
}: CommentComposerProps) {
  const [text, setText] = useState('');
  const composing = useRef(false);

  const body = text.trim();
  // **長すぎるものは切らずに断ります**（サーバーと同じ上限。`commentApi.ts`）
  const tooLong = body.length > WIKI_COMMENT_MAX_CHARS;
  const canSend = body.length > 0 && !tooLong && !pending;

  const send = async () => {
    if (!canSend) return;
    try {
      await onSend(body);
      setText('');
    } catch {
      // 打った文は消さない（打ち直させない）。失敗の知らせは共通のバナーが出す
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-card p-2">
      <textarea
        rows={rows}
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={() => { composing.current = false; }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
          if (composing.current || e.nativeEvent.isComposing) return;
          e.preventDefault();
          void send();
        }}
        placeholder={placeholder}
        aria-label={fieldLabel}
        className="w-full resize-none border-0 bg-transparent p-1 text-sub leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
      />
      {tooLong && (
        <p className="px-1 text-sub-sm text-destructive">
          コメントが長すぎます（{WIKI_COMMENT_MAX_CHARS.toLocaleString()}字まで・いまは
          {body.length.toLocaleString()}字）。分けて書いてください。
        </p>
      )}
      <div className="flex items-center justify-end gap-1.5">
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            className="min-h-tap lg:h-9 lg:min-h-0"
          >
            やめる
          </Button>
        )}
        <Button
          type="button"
          disabled={!canSend}
          onClick={() => void send()}
          className="min-h-tap lg:h-9 lg:min-h-0"
        >
          {pending ? '送っています…' : submitLabel}
        </Button>
      </div>
    </div>
  );
}
