/**
 * 「聞くこと」と「聞き方の下書き」— 受付から持ち込んだ枠
 *
 * **既定は畳んであります。** 手で登録するときは何も聞く相手がいないことが多く、
 * 常に開いていると必須5つの下に長い文面が挟まって、フォームが遠くなります。
 * 押すと開き、**聞くことの件数はボタンに出す**ので、開かなくても分かります。
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { notifySuccess, notifyError } from '@gmo-onair/shared/src/client/notify';
import { asksFor, internalTodos, draftText, type AskMode } from './ask';
import type { NewProjectValues } from './fields';

export function AskPanel({
  v,
  customerName,
  senderName,
}: {
  v: NewProjectValues;
  customerName: string | null;
  senderName: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AskMode>('mail');

  const asks = asksFor(v, customerName);
  const todos = internalTodos(v);
  const text = draftText(v.name, customerName, asks, mode, senderName);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      notifySuccess('下書きを写しました');
    } catch {
      // クリップボードは端末・ブラウザの設定で塞がれていることがある。
      // **黙って失敗しない** — 押したのに何も起きないと壊れて見える
      notifyError('写せませんでした', { description: '文面を選んでコピーしてください' });
    }
  };

  return (
    <div className="rounded-card overflow-hidden border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="min-h-tap flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-muted"
      >
        {open
          ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
        <HelpCircle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="text-list font-bold">聞くこと</span>
        {asks.length > 0 && (
          <span className="text-badge font-number rounded-badge-xs bg-warning-surface px-1.5 py-0.5 text-warning">
            {asks.length}
          </span>
        )}
        <span className="flex-1" />
        <span className="text-note hidden text-muted-foreground sm:inline">
          {asks.length === 0 ? '聞くことはありません' : '入っていない項目から組み立てています'}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-border-faint px-4 py-3.5">
          {asks.length === 0 && todos.length === 0 ? (
            <p className="text-sub text-muted-foreground">
              足りない項目はありません。このまま案件にできます。
            </p>
          ) : (
            <>
              {asks.length > 0 && (
                <div>
                  <p className="text-th mb-1.5 text-muted-foreground">お客様に聞くこと</p>
                  <ul className="flex flex-col gap-1.5">
                    {asks.map((a) => (
                      <li key={a.key} className="text-sub">
                        <span className="font-bold">{a.q}</span>
                        <span className="text-note block text-muted-foreground">{a.why}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {todos.length > 0 && (
                <div>
                  {/* **社内で決めることは分ける。** 混ぜると、社内の未設定を
                      お客様に質問する文面ができる */}
                  <p className="text-th mb-1.5 text-muted-foreground">社内で決めること</p>
                  <ul className="flex flex-col gap-1.5">
                    {todos.map((t) => (
                      <li key={t.key} className="text-sub">
                        <span className="font-bold">{t.q}</span>
                        <span className="text-note block text-muted-foreground">{t.why}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          <div>
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <p className="text-th text-muted-foreground">聞き方の下書き</p>
              <div className="inline-flex overflow-hidden rounded-control border border-border" role="group" aria-label="下書きの形">
                {([['mail', 'メール'], ['phone', '電話']] as const).map(([m, label], i) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    aria-pressed={mode === m}
                    className={`min-h-tap text-sub px-3 lg:min-h-[32px] ${i > 0 ? 'border-l border-border' : ''} ${
                      mode === m ? 'bg-primary-surface font-bold text-primary' : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="flex-1" />
              <Button variant="outline" size="sm" onClick={copy}>
                <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />写す
              </Button>
            </div>
            {/*
              **読み取り専用にしない。** その場で直してから写したいことがある。
              直しても保存はしない（この文面は案件の持ち物ではない）
            */}
            <textarea
              readOnly
              value={text}
              rows={mode === 'phone' ? 5 : 10}
              aria-label="聞き方の下書き"
              className="text-sub w-full rounded-note border border-border bg-muted px-3 py-2 leading-relaxed"
            />
          </div>
        </div>
      )}
    </div>
  );
}
