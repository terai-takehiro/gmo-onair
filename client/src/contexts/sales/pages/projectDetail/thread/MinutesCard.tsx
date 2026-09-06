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
import { useQuery } from '@tanstack/react-query';
import { Sparkles, Check, Trash2, ChevronDown, ChevronRight, Quote, AlertTriangle, Loader2, ListPlus } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Delayed } from '@gmo-onair/shared/src/client/states';
import { OpenItemAssignee } from './OpenItemAssignee';
import type { Minutes, MinutesPatch } from './types';

/**
 * 持ち帰りの行き先の決めごと。**`markKey` がサーバーが書き戻す印**で、
 * これがあると二度作れません（画面でボタンを隠すだけだと、同時に開いた
 * 別の画面が古いままボタンを出す）。
 */
export interface MinutesTrack {
  markKey: 'task_id' | 'ask_id';
  label: string;
  doneLabel: string;
  note: string;
}

/** 案件（GLS-A）の既定。持ち帰りはタスクになる */
export const TASK_TRACK: MinutesTrack = {
  markKey: 'task_id',
  label: 'タスクにする',
  doneLabel: 'タスクにしました',
  note: 'タスクにすると、この案件のタスクタブに入ります。',
};

/** プロジェクト管理（GLS-B）。持ち帰りは「持ち帰り」タブの項目になる */
export const ASK_TRACK: MinutesTrack = {
  markKey: 'ask_id',
  label: '持ち帰りに登録',
  doneLabel: '持ち帰りに登録しました',
  note: '登録すると、「持ち帰り」タブと全プロジェクトの一覧に出て、'
    + '止まっている件数として数えられます。',
};

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

/**
 * 文字起こしを開く枠。**失敗した行でも出します** — 整形で落ちても
 * 文字起こしだけは残っていることがあり、それを取り出せないと録音し直しになります
 * （失敗の行に「下の『文字起こしを見る』から取り出せます」と書いてあるのに、
 *  その枠が無い状態でした。Codex の指摘・PR #103）。
 */
function TranscriptBlock({
  chars, transcript, loading, open, onToggle,
}: {
  chars: number;
  transcript: string | null;
  loading: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  if (chars <= 0) return null;
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="text-sub min-h-tap flex items-center gap-1.5 font-bold text-primary hover:underline lg:min-h-[32px]"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
        文字起こしを見る（{chars.toLocaleString()}字）
      </button>
      {open && (
        loading && !transcript ? (
          <p className="text-sub mt-1.5 flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />読み込んでいます
          </p>
        ) : (
          <pre className="rounded-note text-sub mt-1.5 max-h-72 overflow-y-auto whitespace-pre-wrap border border-border bg-surface-subtle p-3 font-sans leading-[1.9]">
            {transcript ?? '文字起こしを取り出せませんでした。'}
          </pre>
        )
      )}
    </div>
  );
}

export function MinutesCard({
  m, canEdit, canDelete, busy, detailPath, onSave, onDelete, onMakeTask, track = TASK_TRACK,
}: {
  m: Minutes;
  canEdit: boolean;
  /**
   * 消せるか。**`canEdit` と分ける** — サーバーは消すのを manager に絞っているので、
   * editor に消すボタンを出すと**押しても何も起きない**（プロジェクト管理側では
   * 黙って無視され、案件側では 403 が返るだけ）。Codex の指摘・PR #103。
   */
  canDelete: boolean;
  busy: boolean;
  /**
   * 文字起こしの本文を取りに行く先。**一覧は本文を積まない**ので、
   * 「文字起こしを見る」を押したときにここから取ります
   * （案件 `/projects/:pid/minutes/:id` ／ プロジェクト `/gpm/minutes/:id`）。
   */
  detailPath: (id: string) => string;
  onSave: (patch: MinutesPatch) => void;
  onDelete: () => void;
  /**
   * 持ち帰りの `index` 番目を追いかける形にする（案件=タスク／プロジェクト=未確認事項）。
   * 第2引数はタスク行きのときだけ入る担当者（Phase 2 ⑥・未選択なら undefined）。
   * 未確認事項側の呼び手は第2引数を受け取らなくてよい（TS は引数の少ない関数を許す）。
   */
  onMakeTask: (index: number, assignedTo?: string) => void;
  /**
   * 持ち帰りの行き先。**案件はタスク、プロジェクトは未確認事項**です
   * （工事・構築の持ち帰りはほとんどが「先方の判断待ち」で、タスクにすると
   * 「自分がやること」に相手待ちが混ざり、止まっている件数を数えられない）。
   * 部品を写さずここで差し替えます — 写すと、引用の出し方や確定の扱いが2つになります。
   */
  track?: MinutesTrack;
}) {
  const [open, setOpen] = useState(m.status === 'draft');
  const [showTranscript, setShowTranscript] = useState(false);
  /**
   * 文字起こしの本文。**押されてから取りに行きます**（数万字あるので一覧には載らない）。
   * 一覧が返す `transcript_chars` で「あるか・何字か」だけ先に分かります。
   */
  const chars = m.transcript?.length ?? m.transcript_chars ?? 0;
  const detail = useQuery({
    queryKey: ['minutes-transcript', m.id],
    queryFn: async () => (await api.get(detailPath(m.id))).data.data as { transcript: string | null },
    enabled: showTranscript && !m.transcript && chars > 0,
    staleTime: 5 * 60 * 1000,
  });
  const transcript = m.transcript ?? detail.data?.transcript ?? null;
  const [draft, setDraft] = useState<MinutesPatch>({});
  /** 持ち帰りごとの担当（Phase 2 ⑥）。空文字 = 選んでいない（未割当で入れる） */
  const [assignee, setAssignee] = useState<Record<number, string>>({});
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
          {canDelete && (
            <Button variant="outline" onClick={onDelete} disabled={busy}>
              <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />削除
            </Button>
          )}
        </div>
        <p className="text-sub mt-1.5 text-secondary-foreground">{m.error_message ?? '理由が分かりません'}</p>
        {/* **文字起こしだけ残っていることがある**（整形で落ちた場合）。捨てさせない */}
        {chars > 0 && (
          <>
            <p className="text-note mb-1.5 mt-1.5 text-muted-foreground">
              文字起こしは残っています。下の「文字起こしを見る」から取り出せます。
            </p>
            <TranscriptBlock
              chars={chars}
              transcript={transcript}
              loading={detail.isFetching}
              open={showTranscript}
              onToggle={() => setShowTranscript((v) => !v)}
            />
          </>
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
                言い切れる決定はありませんでした（「〜の方向で」は未解決事項に入れています）。
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
            <h4 className="text-th">未解決事項（{openItems.length}）</h4>
            {openItems.length === 0 ? (
              <p className="text-sub mt-1 text-muted-foreground">未解決事項はありません。</p>
            ) : (
              <ul className="mt-1 flex flex-col gap-1.5">
                {openItems.map((o, i) => (
                  <li key={i} className="text-list flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border-subtle pt-1.5 first:border-t-0 first:pt-0">
                    <span className="min-w-0 flex-1">{o.text}</span>
                    {o.owner && <span className="text-sub text-muted-foreground">{o.owner}</span>}
                    {o.due && <span className="font-number text-sub text-muted-foreground">{o.due}</span>}
                    {o[track.markKey] ? (
                      <span className="text-note inline-flex items-center gap-1 text-success">
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />{track.doneLabel}
                      </span>
                    ) : canEdit && (
                      <>
                        {/* 担当ピッカーはタスク行きだけ（未確認事項は担当を持たない） */}
                        {track.markKey === 'task_id' && (
                          <OpenItemAssignee
                            value={assignee[i] ?? ''}
                            onChange={(v) => setAssignee((s) => ({ ...s, [i]: v }))}
                            disabled={busy}
                          />
                        )}
                        <Button variant="outline" size="sm" disabled={busy}
                          onClick={() => onMakeTask(i, assignee[i] || undefined)}>
                          <ListPlus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />{track.label}
                        </Button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-note mt-1.5 text-muted-foreground">
              {track.note}
              {track.markKey === 'task_id' ? (
                // タスク行きは担当を選べるようになった（Phase 2 ⑥）。ただし自動では入れない
                <>担当は<strong className="font-bold">選んだときだけ</strong>入ります — 打合せで出た名前は
                文字起こしから拾った文字列で、自動では利用者に結びつけません。</>
              ) : (
                <><strong className="font-bold">担当は入りません</strong> — 打合せで出た名前は
                文字起こしから拾った文字列で、利用者と結びついていないためです。</>
              )}
              <strong className="font-bold">同じ未解決事項からは1つしか作れません。</strong>
            </p>
          </div>

          <TranscriptBlock
            chars={chars}
            transcript={transcript}
            loading={detail.isFetching}
            open={showTranscript}
            onToggle={() => setShowTranscript((v) => !v)}
          />

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
              {/* **消すのは manager だけ。** editor に出すと押しても何も起きない */}
              {canDelete && (
                <Button variant="outline" disabled={busy} onClick={onDelete}>
                  <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />削除
                </Button>
              )}
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
