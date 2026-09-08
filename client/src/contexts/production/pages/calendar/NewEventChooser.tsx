/**
 * ① 予定 / 「何の予定を入れますか」（モックの `pickKind`）
 *
 * ── なぜ選ばせるか ──────────────────────────────────────────
 *
 * 3つは**入れ方も持ち物もまったく違います**（部屋・人・自分）。
 * 1つのフォームにまとめると、部屋の欄が空のまま保存できる／自分の予定に
 * 部屋の欄が出る、といった形になります。
 *
 * ── 着手前は「入れる」導線が無かった ────────────────────────
 *
 * 統合カレンダーには**新規作成が1つもなく**、「予定を入れるには別の
 * カレンダーへ行ってください」と書いてあるだけでした（旧実装のコメント）。
 * v4 は ① 予定が1本なので、ここから入れられないと**入れる場所が消えます**。
 *
 * ── 新規は「押さえる」と書かない ────────────────────────────
 *
 * 旧文言は「部屋を押さえる」で、③ の**仮押さえ**（`status='tentative'`）と
 * 語幹が同じだった。ここから作るのは仮押さえとは限らないので、
 * **「スタジオを予約する」**と書く。「仮押さえ」は仮押さえのままにする。
 */
import { DoorOpen, User, Users } from 'lucide-react';
import { FormDialog } from '@gmo-onair/shared/src/client-v4/formDialog';

export type NewKind = 'room' | 'mine' | 'partner';

const KINDS: Array<{ k: NewKind; label: string; hint: string; icon: typeof DoorOpen; color: string }> = [
  { k: 'room', label: 'スタジオを予約する', hint: '本番・リハ・設営・内覧など', icon: DoorOpen, color: '#dc2626' },
  // ⚠️ 「自分の予定」「パートナーの予定」はまだ利用できない機能（要望を受け一旦
  // ラベルに明示。使えるようにする作業自体は別途）
  { k: 'mine', label: '自分の予定（未使用）', hint: '打合せ・移動・作業。共有すると他の人にも出ます', icon: User, color: '#2563eb' },
  { k: 'partner', label: 'パートナーの予定（未使用）', hint: '代休・有給・出張・社外活動。人の空きを見るために入れます', icon: Users, color: '#8b5cf6' },
];

export function NewEventChooser({
  open, onOpenChange, allow, onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 権限のあるものだけ出す。**押せば 403 になるものを並べない** */
  allow: Record<NewKind, boolean>;
  onPick: (k: NewKind) => void;
}) {
  const items = KINDS.filter((x) => allow[x.k]);
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="何の予定を入れますか"
      sub="スタジオの予約と、自分・パートナーの予定は入れ方が違います。ここで選んでから中身を書きます。"
    >
        <div className="flex flex-col gap-2">
          {items.map((x) => (
            <button
              key={x.k}
              type="button"
              onClick={() => { onPick(x.k); onOpenChange(false); }}
              className="rounded-card min-h-tap flex items-center gap-3 border border-border bg-card px-3.5 py-3 text-left"
            >
              <span
                className="rounded-note inline-flex h-9 w-9 shrink-0 items-center justify-center"
                style={{ backgroundColor: `${x.color}1a` }}
              >
                <x.icon className="h-4 w-4" style={{ color: x.color }} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-list block">{x.label}</span>
                <span className="text-note block text-muted-foreground">{x.hint}</span>
              </span>
            </button>
          ))}
        </div>
    </FormDialog>
  );
}
