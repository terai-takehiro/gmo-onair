/**
 * 次のアクションの操作（完了 / 延期 / 編集 / 削除）— 案件詳細のやり取りタブ
 *
 * ── なぜ要るか（利用者のご指摘3）──────────────────────────────
 *
 * 「案件詳細に『見学日程打診（期限超過）』のような行が出るが編集できず、
 * 関係なくなっても残る」。**終わり方が3つある**のに、画面には1つも無い状態でした:
 *
 *   ・やった          → **完了**
 *   ・まだ先になった  → **延期**
 *   ・そもそも不要    → **削除**
 *
 * ── 削除だけ2段階にする ────────────────────────────────────
 *
 * 完了・延期は取り消せます（完了をもう一度押しても状態は変わらず、延期は
 * 日付を入れ直せる）。**削除だけは元に戻せません**。そこで
 *
 *   ① 押すと理由の欄が開く（**任意**。3択＋自由記入）
 *   ② 「削除」を押すと `confirmAction` が何が消えるかを書いて確かめる
 *
 * の2段にします。理由を**必須にしないこと** — 人に差分の入力を強いると
 * 運用が続かず、結局「削除ごと使われなくなる」ほうが損です
 * （`.claude/skills/ai-feedback-loop/`）。
 *
 * ── 言葉（`docs/wording.md` ルール8・9）────────────────────────
 *
 * ✕「できた」「期限をずらす」「＋1週」「直す」「消す」
 * ○「完了」「延期」「1週間延期」「編集」「削除」
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
/**
 * 削除の理由の3択は**営業活動記録と同じ1本**（`DELETE_REASONS`）。
 * サーバーの `buildAdvice` が「AI の見当違い」だけを分母に残せるように、
 * **文字列をそのまま送ります**（画面で言い換えないこと）。
 */
import { NextActionDeleteReason } from '../../activityLog/NextActionDeleteReason';
import { isAiAuthored } from './NextActionNote';
import { tomorrowStr, nextWeekStr, type ThreadEdit } from './useThreadEdit';
import type { ActivityLog } from '../types';

/** タップ領域は 44px（スマホの決めごと）。PC では詰める */
const BTN = 'min-h-tap px-2.5 text-xs lg:min-h-[32px]';

export function NextActionActions({ a, edit, onEdit }: {
  a: ActivityLog;
  edit: ThreadEdit;
  /** 「編集」。渡さなければ出さない（`sales` の editor が無い人には押せない） */
  onEdit?: () => void;
}) {
  const [mode, setMode] = useState<'idle' | 'postpone' | 'delete'>('idle');
  const [pickedDate, setPickedDate] = useState('');
  const [reason, setReason] = useState('');

  const close = () => { setMode('idle'); setPickedDate(''); setReason(''); };

  const runDelete = async () => {
    const ok = await confirmAction({
      title: '次のアクションを削除しますか',
      description: '削除されるのは次のアクションだけです。やり取りの本文と原文は残ります。\n\n'
        + (isAiAuthored(a)
          // AI が立てた行だけがこの文を出す。**人が書いた行で出すと嘘になる**
          // （差分は `ai_outputs` に直近の出力がある行にしか積めない）
          ? 'この次のアクションは AI が立てたものです。削除したことは記録され、'
            + '「確度の低い次のアクションを立てない」という改善の材料になります。'
          : 'この次のアクションは手動で入力されたものです。'),
      confirmLabel: '削除',
      tone: 'danger',
    });
    if (!ok) return;
    edit.deleteNextAction(a, reason);
    close();
  };

  // ── 延期: 先の日付を選んでから実行する ──────────────────────
  // 押した瞬間に1週間延びると、**取り消す手段がこの画面に無いまま期限だけが動く**
  if (mode === 'postpone') {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Button type="button" size="sm" variant="outline" className={BTN} disabled={edit.isPending}
          onClick={() => { edit.postpone(a.id, tomorrowStr()); close(); }}>
          明日
        </Button>
        <Button type="button" size="sm" variant="outline" className={BTN} disabled={edit.isPending}
          onClick={() => { edit.postpone(a.id, nextWeekStr()); close(); }}>
          1週間延期
        </Button>
        {/* 日付を選ぶ。**選んだ瞬間には動かさない**（押し間違いで期限が飛ぶ） */}
        <input
          type="date"
          value={pickedDate}
          onChange={(e) => setPickedDate(e.target.value)}
          aria-label="延期する期限"
          className="text-sub min-h-tap rounded-control border border-border bg-background px-2 lg:min-h-[32px]"
        />
        <Button type="button" size="sm" variant="outline" className={BTN}
          disabled={!pickedDate || edit.isPending}
          onClick={() => { edit.postpone(a.id, pickedDate); close(); }}>
          この日に延期
        </Button>
        <Button type="button" size="sm" variant="ghost" className={BTN} onClick={close}>
          キャンセル
        </Button>
      </div>
    );
  }

  // ── 削除: 理由（任意）を訊いてから `confirmAction` ─────────────
  if (mode === 'delete') {
    return (
      <div className="mt-2">
        <NextActionDeleteReason value={reason} onChange={setReason} />
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Button type="button" size="sm" variant="destructive" className={BTN}
            disabled={edit.isPending} onClick={runDelete}>
            削除
          </Button>
          <Button type="button" size="sm" variant="ghost" className={BTN} onClick={close}>
            キャンセル
          </Button>
        </div>
      </div>
    );
  }

  /**
   * **完了・延期は、開いている行にだけ出す。**
   *
   * 閉じた行（人が完了を押した／案件が終わって機械が閉じた）に「完了」を出すと、
   * 押しても何も変わらないボタンが並びます。**押しても何も起きない導線を作らない**
   * のがこの製品の決めごと（`ThreadCard` の「整え直す」と同じ）。
   * 編集・削除は閉じた行にも要ります — 中身が間違っていたときに直せないと、
   * 間違ったやることが「完了」として記録に残り続けます。
   */
  const open = !a.next_action_done_at;

  return (
    // **スマホで横に流さない**（`flex-wrap`）。375px でボタンが4つ並ぶと必ずはみ出す
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {open && (
        <Button type="button" size="sm" variant="outline" className={BTN}
          disabled={edit.isPending} onClick={() => edit.complete(a.id)}>
          完了
        </Button>
      )}
      {open && (
        <Button type="button" size="sm" variant="outline" className={BTN}
          onClick={() => setMode('postpone')}>
          延期
        </Button>
      )}
      {onEdit && (
        <Button type="button" size="sm" variant="ghost" className={BTN} onClick={onEdit}>
          編集
        </Button>
      )}
      <Button type="button" size="sm" variant="ghost" className={`${BTN} text-destructive`}
        onClick={() => setMode('delete')}>
        次のアクションを削除
      </Button>
    </div>
  );
}
