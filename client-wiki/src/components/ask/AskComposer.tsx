/**
 * 質問を打つところ（docs/design/v4/wiki.md §6-⑤・モック `Ask.dc.html` の下端）
 *
 * ⚠️ **日本語入力を壊さない。** 変換の確定で押される Enter を送信にしないため、
 * 送るのは ボタン と `Ctrl`（`⌘`）＋`Enter` だけにし、`isComposing` の間は何もしません
 * （制作技術支援と同じ約束。`npm run verify:ime` が見ています）。
 *
 * ⚠️ **長すぎる質問は切らずに断ります。** サーバーの上限は 2,000字で、
 * 超えると断られます。黙って切ると「質問の後半が無視された」ことに誰も気づけません。
 */
import { useEffect, useRef, useState } from 'react';
import { Button } from '@gmo-onair/shared/src/client/ui/button';

/** サーバー（`WIKI_QUESTION_MAX_CHARS`）と同じ数。超えたら送らせない */
const MAX_CHARS = 2_000;

export interface AskComposerProps {
  /** 検索から渡ってきた質問など、開いたときに入れておく文 */
  initialText?: string;
  pending: boolean;
  /** 送る。**失敗したら打った文を残す**ので、送り終わるまで待てる形で受け取る */
  onSend: (question: string) => Promise<unknown>;
  /** 入力欄の上に出すもの（ページの文脈など） */
  above?: React.ReactNode;
}

export default function AskComposer({ initialText, pending, onSend, above }: AskComposerProps) {
  const [text, setText] = useState(initialText ?? '');
  const composing = useRef(false);
  const boxRef = useRef<HTMLTextAreaElement | null>(null);

  // 検索から「この質問を AI に聞く」で来たとき、打ち直さずに送れるよう入れておく。
  // **自動では送りません** — 検索の語（「配信 音 出ない」）はそのままでは質問の形に
  // なっていないことが多く、直してから送れたほうがよいためです
  useEffect(() => {
    if (!initialText) return;
    setText(initialText);
    boxRef.current?.focus();
  }, [initialText]);

  const question = text.trim();
  const tooLong = question.length > MAX_CHARS;
  const canSend = question.length > 0 && !tooLong && !pending;

  const send = async () => {
    if (!canSend) return;
    try {
      await onSend(question);
      setText('');
    } catch {
      // 失敗したときは**打った文を消しません**（打ち直させない）。
      // 何が起きたかは共通の受け皿が帯で出します
    }
  };

  return (
    <div className="shrink-0 border-t border-border bg-card px-3 py-3 lg:px-8">
      <div className="mx-auto w-full max-w-[860px]">
        {above}
        <div className="flex items-end gap-2 rounded-card border border-primary-border bg-card p-2 pl-3">
          <textarea
            ref={boxRef}
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onCompositionStart={() => { composing.current = true; }}
            onCompositionEnd={() => { composing.current = false; }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
              if (composing.current || e.nativeEvent.isComposing) return;
              e.preventDefault();
              void send();
            }}
            placeholder="Wiki に聞く（例: 内覧会の受付で名刺が無い方が来たら、どうしますか）"
            aria-label="質問"
            className="min-h-tap w-full flex-1 resize-none border-0 bg-transparent p-1 text-list leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
          />
          <Button type="button" disabled={!canSend} onClick={() => void send()}>
            {pending ? '聞いています…' : '送信'}
          </Button>
        </div>

        <p className="mt-2 text-sub-sm text-muted-foreground">
          {tooLong ? (
            <span className="text-destructive">
              質問が長すぎます（{MAX_CHARS.toLocaleString()}字まで・いまは
              {question.length.toLocaleString()}字）。要点だけを聞いてください。
            </span>
          ) : (
            <>
              読むのは、あなたが読めるスペースの<strong className="font-bold">公開ページ</strong>
              だけです。回答と読んだページは記録され、評価は次の回答に生かされます。
              <span className="hidden lg:inline">　Ctrl（⌘）＋ Enter でも送れます。</span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
