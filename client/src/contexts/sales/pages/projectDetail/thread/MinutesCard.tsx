/**
 * 議事録1件（下書き → 直す → 確定） (v4 ⑥ やり取りタブ)
 *
 * ── 「AI が書いた」ことを隠さない ────────────────────────────
 *
 * 下書きのあいだは**印を出し、確定するまで「下書き」と書きます**。
 * 議事録は取引先との合意の記録なので、AI が書いたものをそのまま
 * 決まったことのように見せてはいけません。
 *
 * ── 決定事項には引用が付いている ────────────────────────────
 *
 * AI には「そう判断した根拠を文字起こしからそのまま引用する」ことを
 * 求めています（引用が出せないものは持ち帰りに落としています）。
 * 引用を**開いて見られる**ようにしておくのが要点で、
 * これが無いと「本当にそう言ったのか」を確かめられません。
 */
import { useState } from 'react';
import { Sparkles, Check, Trash2, ChevronDown, ChevronRight, Quote, AlertTriangle, Loader2, ListPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Delayed } from '@gmo-onair/shared/src/client/states';
import type { Minutes, MinutesPatch } from './types';

const STATUS: Record<string, { label: string; tone: string }> = {
  transcribing: { label: '処理中', tone: 'border-transparent bg-muted text-muted-foreground' },
  draft: { label: '下書き', tone: 'border-transparent bg-ai-surface text-ai' },
  confirmed: { label: '確定', tone: 'border-transparent bg-success-surface text-success' },
  failed: { label: '失敗', tone: 'border-transparent bg-destructive-surface text-destructive' },
};

function minutesOf(sec: number | null): string | null {
  if (!sec) return null;
  return `${Math.max(1, Math.round(sec / 60))}分`;
}

export function MinutesCard({
  m, canEdit, busy, onSave, onDelete, onMakeTask,
}: {
  m: Minutes;
  canEdit: boolean;
  busy: boolean;
  onSave: (patch: MinutesPatch) => void;
  onDelete: () => void;
  /** 持ち帰りの `index` 番目をタスクにする */
  onMakeTask: (index: number) => void;
}) {
  const [open, setOpen] = useState(m.status === 'draft');
  const [showTranscript, setShowTranscript] = useState(false);
  const [draft, setDraft] = useState<MinutesPatch>({});
  const st = STATUS[m.status] ?? STATUS.draft;

  const val = <K extends keyof MinutesPatch>(k: K, fallback: MinutesPatch[K]): MinutesPatch[K] =>
    (k in draft ? draft[k] : fallback) as MinutesPatch[K];
  const set = (patch: MinutesPatch) => setDraft((d) => ({ ...d, ...patch }));
  const dirty = Object.keys(draft).length > 0;

  if (m.status === 'transcribing') {
    return (
      <section className="rounded-card border border-border bg-card p-4 lg:px-5">
        <div className="flex items-center gap-2.5">
          <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
          <h3 className="text-cardtitle">文字起こしをしています</h3>
          <TableBadge label={st.label} w={null} className={st.tone} />
        </div>
        <p className="text-note mt-1.5 text-muted-foreground">
          1時間の録音で数分かかります。<strong className="font-bold">画面を閉じても進みます</strong> — できたらここに出ます。
        </p>
        <Delayed><span className="sr-only">処理中</span></Delayed>
      </section>
    );
  }

  if (m.status === 'failed') {
    return (
      <section className="rounded-card border border-destructive-border bg-card p-4 lg:px-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />
          <h3 className="text-cardtitle text-destructive">文字起こしができませんでした</h3>
          <div className="flex-1" />
          {canEdit && (
            <Button variant="outline" onClick={onDelete} disabled={busy}>
              <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />消す
            </Button>
          )}
        </div>
        <p className="text-sub mt-1.5 text-secondary-foreground">{m.error_message ?? '理由が分かりません'}</p>
        {/* **文字起こしだけ残っていることがある**（整形で落ちた場合）。捨てさせない */}
        {m.transcript && (
          <p className="text-note mt-1.5 text-muted-foreground">
            文字起こしは残っています。下の「文字起こしを見る」から取り出せます。
          </p>
        )}
      </section>
    );
  }

  const decisions = m.decisions ?? [];
  const openItems = m.open_items ?? [];

  return (
    <section className="rounded-card overflow-hidden border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-2.5 p-4 text-left lg:px-5"
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
        <h3 className="text-cardtitle min-w-0 flex-1 truncate">{m.title || '（表題なし）'}</h3>
        <TableBadge label={st.label} w={null} className={st.tone} />
        <span className="font-number text-sub-sm text-muted-foreground">
          {[m.met_on, minutesOf(m.duration_sec)].filter(Boolean).join(' ・ ')}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3.5 border-t border-border-subtle p-4 lg:px-5">
          {m.status === 'draft' && (
            <p className="rounded-note text-sub flex items-start gap-2 bg-ai-surface px-3 py-2 text-ai">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                <strong className="font-bold">AI の下書きです。まだ確定していません。</strong>
                直してから「確定する」を押してください。
                <strong className="font-bold">直したところは記録され、AI の直しに使われます</strong>（入力は要りません）。
              </span>
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>表題</Label>
              <Input value={val('title', m.title) ?? ''} disabled={!canEdit}
                onChange={(e) => set({ title: e.target.value })} />
            </div>
            <div>
              <Label>出席者</Label>
              <Input value={val('attendees', m.attendees ?? '') ?? ''} disabled={!canEdit}
                onChange={(e) => set({ attendees: e.target.value })} />
            </div>
            <div>
              <Label>打合せの日</Label>
              <Input type="date" value={val('met_on', m.met_on ?? '') ?? ''} disabled={!canEdit}
                onChange={(e) => set({ met_on: e.target.value })} />
            </div>
            <div>
              <Label>次回</Label>
              <Input type="date" value={val('next_meeting', m.next_meeting ?? '') ?? ''} disabled={!canEdit}
                onChange={(e) => set({ next_meeting: e.target.value })} />
            </div>
          </div>

          <div>
            <Label>まとめ</Label>
            <Textarea rows={4} value={val('summary', m.summary ?? '') ?? ''} disabled={!canEdit}
              onChange={(e) => set({ summary: e.target.value })} />
          </div>

          <div>
            <h4 className="text-th">決まったこと（{decisions.length}）</h4>
            {decisions.length === 0 ? (
              <p className="text-sub mt-1 text-muted-foreground">
                言い切れる決定はありませんでした（「〜の方向で」は持ち帰りに入れています）。
              </p>
            ) : (
              <ul className="mt-1 flex flex-col gap-2">
                {decisions.map((d, i) => (
                  <li key={i} className="border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
                    <p className="text-list">{d.text}</p>
                    {/* **引用を出す。** これが無いと「本当にそう言ったのか」を確かめられない */}
                    {d.quote && (
                      <p className="text-note mt-0.5 flex items-start gap-1.5 text-muted-foreground">
                        <Quote className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                        <span className="[overflow-wrap:anywhere]">{d.quote}</span>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h4 className="text-th">持ち帰り・未確認（{openItems.length}）</h4>
            {openItems.length === 0 ? (
              <p className="text-sub mt-1 text-muted-foreground">ありません。</p>
            ) : (
              <ul className="mt-1 flex flex-col gap-1.5">
                {openItems.map((o, i) => (
                  <li key={i} className="text-list flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border-subtle pt-1.5 first:border-t-0 first:pt-0">
                    <span className="min-w-0 flex-1">{o.text}</span>
                    {o.owner && <span className="text-sub text-muted-foreground">{o.owner}</span>}
                    {o.due && <span className="font-number text-sub text-muted-foreground">{o.due}</span>}
                    {o.task_id ? (
                      <span className="text-note inline-flex items-center gap-1 text-success">
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />タスクにしました
                      </span>
                    ) : canEdit && (
                      <Button variant="outline" size="sm" disabled={busy} onClick={() => onMakeTask(i)}>
                        <ListPlus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />タスクにする
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-note mt-1.5 text-muted-foreground">
              タスクにすると、この案件のタスクタブに入ります。
              <strong className="font-bold">担当は入りません</strong> — 打合せで出た名前は
              文字起こしから拾った文字列で、利用者と結びついていないためです（説明に書いてあります）。
              <strong className="font-bold">同じ持ち帰りからは1つしか作れません。</strong>
            </p>
          </div>

          {m.transcript && (
            <div>
              <button type="button" onClick={() => setShowTranscript((v) => !v)}
                className="text-sub min-h-tap flex items-center gap-1.5 font-bold text-primary hover:underline lg:min-h-[32px]">
                {showTranscript ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                  : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
                文字起こしを見る（{m.transcript.length.toLocaleString()}字）
              </button>
              {showTranscript && (
                <pre className="rounded-note text-sub mt-1.5 max-h-72 overflow-y-auto whitespace-pre-wrap border border-border bg-surface-subtle p-3 font-sans leading-[1.9]">
                  {m.transcript}
                </pre>
              )}
            </div>
          )}

          {canEdit && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
              {m.status === 'draft' ? (
                <Button disabled={busy} onClick={() => onSave({ ...draft, confirm: true })}>
                  <Check className="mr-2 h-4 w-4" aria-hidden="true" />確定する
                </Button>
              ) : (
                <Button disabled={busy || !dirty} onClick={() => onSave(draft)}>保存する</Button>
              )}
              {m.status === 'draft' && dirty && (
                <span className="text-note text-muted-foreground">直したところは確定時に記録されます</span>
              )}
              <div className="flex-1" />
              <Button variant="outline" disabled={busy} onClick={onDelete}>
                <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />消す
              </Button>
            </div>
          )}

          {m.model && (
            <p className="text-note text-muted-foreground">
              下書き: {m.model}
              {m.prompt_version ? `（${m.prompt_version}）` : ''}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
