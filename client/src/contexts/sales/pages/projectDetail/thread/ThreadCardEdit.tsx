/**
 * やり取りの1件をその場で編集する（利用者のご指摘4）
 *
 * ── なぜ要るか ──────────────────────────────────────────────
 *
 * 「やり取りの本文が編集できない。AI が整形したあとでも手動で編集できるように
 * してほしい（Notion のように）」。前の版で人ができたのは**「整え直す」を押して
 * AI にやり直させること**だけで、**自分の言葉に直す道が1つもありません**でした。
 * AI の読み取りが少しだけ違うとき（社名の表記・日付の取り違え）に、
 * 直す手段が「AI にもう一度賭ける」しか無いのは行き止まりです。
 *
 * ── 素のテキストで編集する ──────────────────────────────────
 *
 * 編集させるのは**素のテキスト**です（`bodyEdit.ts`）。構造や HTML を直接
 * 触らせると、閉じ忘れたタグ1つで**一覧全体のレイアウトが壊れます**。
 * 初期値は**いま画面に出ているもの**から作ります（`editableBodyText`）——
 * ここがずれると「編集を押した瞬間に別の文が出た」と読まれます。
 *
 * ── 保存すると何が変わるかを先に書く ────────────────────────
 *
 * 保存すると `body_struct`（AI が起こした発言ごとの枠）を捨て、
 * `body_html`（人の文章）に置き換えます。**戻せません**。さらにサーバーが
 * `body_edited_at` を立て、**毎晩 3:00 の自動整形の対象から外れます**
 * （外さないと、翌朝に AI の構造で上書きされて人の労力が消えます）。
 * これを**押す前に**書きます。原文（`description`）と AI の下書きは残ります。
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Info } from 'lucide-react';
import { notifyError } from '@gmo-onair/shared/src/client/notify';
import { KIND } from './kinds';
import { bodyHtmlFromText, editableBodyText } from './bodyEdit';
import type { ThreadEdit } from './useThreadEdit';
import type { ActivityLog } from '../types';

/**
 * 種類の並び。**`KIND` の集合から作る**（画面で言い換えない）。
 * `follow_up` は `followup` と同じ意味の古い綴りなので選択肢には出さず、
 * **その値が入っている行を開いたときだけ**足します（勝手に書き換えない）。
 */
const KIND_ORDER = ['email', 'call', 'meeting', 'visit', 'proposal', 'demo', 'followup', 'memo', 'other'];

/** 欄の下に出す注記（同じ字の段・同じ色を2か所に書かない） */
const HINT = 'text-note mt-1 text-muted-foreground';

export function ThreadCardEdit({ a, edit, onClose, focus }: {
  a: ActivityLog;
  edit: ThreadEdit;
  onClose: () => void;
  /** どの欄に最初のフォーカスを置くか（「編集」を押した場所で変える） */
  focus?: 'body' | 'next_action';
}) {
  const [date, setDate] = useState(a.activity_date ?? '');
  const [kind, setKind] = useState(a.activity_type ?? 'other');
  const [subject, setSubject] = useState(a.subject ?? '');
  const [body, setBody] = useState(() => editableBodyText(a));
  const [nextAction, setNextAction] = useState(a.next_action ?? '');
  const [nextDate, setNextDate] = useState(a.next_action_date ?? '');

  const kinds = KIND_ORDER.includes(kind) ? KIND_ORDER : [...KIND_ORDER, kind];
  /** AI が起こした構造・整形がある行だけ、置き換わることを書く */
  const replacesAi = !!a.body_struct || !!a.ai_formatted;

  const submit = () => {
    if (!subject.trim()) { notifyError('件名を入力してください'); return; }
    if (!date) { notifyError('日付を入力してください'); return; }
    edit.save(a, {
      activity_date: date,
      activity_type: kind,
      subject: subject.trim(),
      // 本文は**許可タグだけの HTML**にして送る（`bodyEdit.ts` が必ずエスケープする）。
      // 空にしたときは `null` を送る — 空文字だとサーバーが `null` に落とすので同じだが、
      // 「消した」ことを明示で表す
      body_html: bodyHtmlFromText(body),
      /*
       * **AI の構造を捨てる。** `null` を明示で送らないとサーバーは触りません
       * （`data.body_struct !== undefined` で判定している）。捨てた事実は
       * 同じ保存で `ai_corrections` に `body_struct` の `reject` として積まれます
       * （会社方針の条件2。`body_edited_at` は「人が触った」印でしかなく、
       * **何がどう違ったかは1バイトも入っていません**）。
       */
      body_struct: null,
      // 空文字は**削除**の合図（サーバーが `null` に落とす）
      next_action: nextAction.trim(),
      next_action_date: nextAction.trim() ? (nextDate || null) : null,
    });
    onClose();
  };

  return (
    // **1カラムの縦積み**（スマホの決めごと）。PC だけ日付と種類を横に並べる
    <div className="mt-3 flex flex-col gap-3 border-t border-border-faint pt-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="sm:w-40">
          <Label htmlFor={`d-${a.id}`}>日付</Label>
          <Input id={`d-${a.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="sm:w-40">
          <Label htmlFor={`k-${a.id}`}>種類</Label>
          {/*
            **素の `<select>` を使う。** 10 個の選択肢を 375px のシートで
            開かせるより、端末の標準の選び方のほうが速い（`min-h-tap` は満たす）
          */}
          <select
            id={`k-${a.id}`}
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="text-sub min-h-tap w-full rounded-control border border-border bg-background px-2 lg:min-h-[40px]"
          >
            {kinds.map((v) => <option key={v} value={v}>{(KIND[v] ?? KIND.other).label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <Label htmlFor={`s-${a.id}`}>件名</Label>
        <Input id={`s-${a.id}`} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>

      <div>
        <Label htmlFor={`b-${a.id}`}>本文</Label>
        <Textarea
          id={`b-${a.id}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          // 「編集」を押して開く枠なので、最初のフォーカスをここに置いてよい
          // （押した本人が本文を直しに来ている。読み上げでも迷子にならない）
          autoFocus={focus !== 'next_action'}
          className="font-normal"
        />
        <p className={HINT}>
          行の頭に <span className="font-number">- </span>
          を書くと箇条書きになります。空行は段落の区切りとして残ります。
        </p>
      </div>

      <div>
        <Label htmlFor={`na-${a.id}`}>次のアクション</Label>
        <Textarea
          id={`na-${a.id}`}
          value={nextAction}
          onChange={(e) => setNextAction(e.target.value)}
          rows={3}
          // 次のアクションの「編集」から開いたときだけ、ここにフォーカスを置く
          autoFocus={focus === 'next_action'}
        />
        <p className={HINT}>空にして保存すると、次のアクションは削除されます（本文と原文は残ります）。</p>
      </div>

      <div className="sm:w-48">
        <Label htmlFor={`nd-${a.id}`}>期限</Label>
        <Input id={`nd-${a.id}`} type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
        <p className={HINT}>空のままなら期限未設定です。</p>
      </div>

      {replacesAi && (
        <div className="rounded-note flex items-start gap-2.5 border border-border-subtle px-3 py-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="text-note text-secondary-foreground">
            AI が作成した発言ごとの枠は文章に置き換わり、以後は夜間の自動整形の対象外となります。
            原文と AI の下書きは保存されるため、いつでも参照できます。
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" className="min-h-tap lg:min-h-[36px]"
          disabled={edit.isPending} onClick={submit}>
          保存
        </Button>
        <Button type="button" size="sm" variant="ghost" className="min-h-tap lg:min-h-[36px]" onClick={onClose}>
          キャンセル
        </Button>
      </div>
    </div>
  );
}
