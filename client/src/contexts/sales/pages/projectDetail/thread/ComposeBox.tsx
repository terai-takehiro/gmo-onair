/**
 * やり取りを書く枠 (v4 ⑥ 案件記録)
 *
 * ── 件名を訊かない ──────────────────────────────────────────
 *
 * 電話を切った直後に書けるのは、たいてい箇条書きにもなっていない走り書きです。
 * ここで「件名」「本文」「次のアクション」の3つの欄を出すと、
 * **書くのが面倒になって記録そのものが残りません**。
 * だから入力欄は1つで、形にするのは保存時に AI がやります。
 *
 * ── 種類のチップは4つだけ ──────────────────────────────────
 *
 * DB の種類は 10 個ありますが、ここに並べるのは
 * **メール / 電話 / 打合せ / メモ** の4つです（指示書 1-4）。
 * 訪問・提案・デモ・追いかけは営業活動の画面から入れるもので、
 * 案件のやり取りとしては上の4つで足ります。**選ばせる数を増やすと、
 * どれにするか迷って手が止まります。**
 *
 * ── AI が整えることを先に書く ────────────────────────────────
 *
 * 「打ったままで大丈夫です」と枠の中に書いておかないと、
 * 人は結局きれいに書こうとします（そして書かなくなります）。
 */
import { useState } from 'react';
import { Mail, Phone, Users, Pencil, Mic, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@gmo-onair/shared/src/client/utils';

/** 書く枠に出す種類。**DB の `activity_type` と同じ値**（画面で言い換えない） */
export const COMPOSE_KINDS = [
  { value: 'email', label: 'メール', icon: Mail },
  { value: 'call', label: '電話', icon: Phone },
  { value: 'meeting', label: '打合せ', icon: Users },
  { value: 'memo', label: 'メモ', icon: Pencil },
] as const;

export type ComposeKind = typeof COMPOSE_KINDS[number]['value'];

export function ComposeBox({
  busy, canEdit, aiAvailable, sttAvailable, onSubmit, onRecord,
}: {
  busy: boolean;
  canEdit: boolean;
  /** AI につないでいない環境では「整えて」を出さず、そのまま記録すると書く */
  aiAvailable: boolean;
  sttAvailable: boolean;
  onSubmit: (kind: ComposeKind, text: string) => void;
  onRecord: () => void;
}) {
  const [kind, setKind] = useState<ComposeKind>('email');
  const [text, setText] = useState('');
  const ready = text.trim().length > 0 && !busy && canEdit;

  const submit = () => {
    if (!ready) return;
    onSubmit(kind, text.trim());
    // **送ったら空にする。** 残すと、送れたのかどうかが画面から読み取れない
    setText('');
  };

  return (
    <section className="rounded-card overflow-hidden border border-primary-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border-faint px-3.5 py-2.5">
        {COMPOSE_KINDS.map((k) => {
          const on = k.value === kind;
          return (
            <button
              key={k.value}
              type="button"
              onClick={() => setKind(k.value)}
              aria-pressed={on}
              className={cn(
                'text-sub min-h-tap inline-flex items-center gap-1.5 rounded-control border px-3 font-bold lg:min-h-[32px]',
                on
                  ? 'border-primary bg-primary-surface-weak text-primary'
                  : 'border-border bg-card text-secondary-foreground hover:bg-muted',
              )}
            >
              <k.icon className="h-3.5 w-3.5" aria-hidden="true" />
              {k.label}
            </button>
          );
        })}
        <span className="flex-1" />
        {aiAvailable && (
          <span className="text-badge inline-flex items-center gap-1.5 rounded-badge bg-ai-surface px-2 py-1 font-bold text-ai">
            <Sparkles className="h-3 w-3" aria-hidden="true" />AI が整えます
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2.5 p-3.5">
        <Textarea
          rows={4}
          value={text}
          disabled={!canEdit}
          aria-label="やり取りの内容"
          placeholder={
            kind === 'memo'
              ? '例）会場はこれから探すとのこと。総務部の田中さんが窓口。'
              : '例）配信の回線について確認。予備回線を入れる方向。金額は追って見積を出す。'
          }
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // **⌘/Ctrl + Enter で送る。** 書き終わりに手を離さず送れる
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submit(); }
          }}
        />
        <p className="text-note text-muted-foreground">
          {aiAvailable
            ? '打ったままで大丈夫です。見出し・箇条書き・要点・次にやること は AI が起こします（元の文もそのまま残ります）。'
            : 'この環境は AI につないでいないので、打ったままの形で記録します。'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex-1" />
          <Button
            variant="outline"
            disabled={!canEdit || !sttAvailable}
            title={!sttAvailable ? 'この環境は文字起こしにつないでいません（管理者にご連絡ください）' : undefined}
            onClick={onRecord}
          >
            <Mic className="mr-2 h-4 w-4 text-destructive" aria-hidden="true" />録音から起こす
          </Button>
          <Button disabled={!ready} onClick={submit}>
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
            記録する
          </Button>
        </div>
      </div>
    </section>
  );
}
