// テロップCG — スロット間の自動退出ルール設定（段6-4・ハブ画面のヘッダー付近）。
//
// docs/design/v4/graphics.md §2「スロット間ルール（例: フルスクリーンが来たら
// 下部テロップを自動 OUT）はテンプレート側に宣言的な表で持つ。衝突の解決を
// オペレーターの注意力に任せない」の最小実装。テンプレート層（段6-2）はまだ無いため、
// 今回は CGプロジェクト単位の設定として持つ（graphics-awards-migration-plan.md §2-2の5番。
// テンプレート層ができたらそちらへ移設する前提）。
//
// UI は「◯◯が出たら△△を自動的に退出させる」という行の表だけ（過剰に凝ったUIに
// しない — ユーザー指示）。プルダウン2つ＋追加ボタンで足し、行の✕で消す。
// 追加・削除のたびに `updateGraphicsProject` で即保存する（ThemePicker と同じ
// 「選んだら即反映」の作法）。既定は空配列＝オプトインなので、何も設定していない
// プロジェクトは今までどおり自動OUTが一切起きない。
import { useState } from 'react';
import { Plus, X, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { notifyError, notifySuccess } from '@/lib/notify';
import {
  GRAPHICS_SLOTS, SLOT_LABELS, updateGraphicsProject,
  type GraphicsSlot, type SlotExitRule,
} from '@/lib/graphicsApi';

/** SlotExitRule[]（whenSlot→複数autoOutSlots）と、表の1行1組ペアの相互変換。 */
interface Pair { whenSlot: GraphicsSlot; outSlot: GraphicsSlot; }

function rulesToPairs(rules: SlotExitRule[]): Pair[] {
  return rules.flatMap((r) => r.autoOutSlots.map((outSlot) => ({ whenSlot: r.whenSlot, outSlot })));
}

function pairsToRules(pairs: Pair[]): SlotExitRule[] {
  const byWhen = new Map<GraphicsSlot, GraphicsSlot[]>();
  for (const { whenSlot, outSlot } of pairs) {
    const list = byWhen.get(whenSlot) ?? [];
    if (!list.includes(outSlot)) list.push(outSlot);
    byWhen.set(whenSlot, list);
  }
  return [...byWhen.entries()].map(([whenSlot, autoOutSlots]) => ({ whenSlot, autoOutSlots }));
}

export default function SlotExitRulesEditor({ projectId, rules, onSaved }: {
  projectId: string | number;
  rules: SlotExitRule[];
  onSaved: () => void | Promise<void>;
}) {
  const pairs = rulesToPairs(rules);
  const [whenSlot, setWhenSlot] = useState<GraphicsSlot>(GRAPHICS_SLOTS[0]);
  const [outSlot, setOutSlot] = useState<GraphicsSlot>(GRAPHICS_SLOTS[1]);
  const [saving, setSaving] = useState(false);

  const save = async (nextPairs: Pair[]) => {
    setSaving(true);
    try {
      await updateGraphicsProject(projectId, { slotExitRules: pairsToRules(nextPairs) });
      await onSaved();
    } catch {
      notifyError('自動退出ルールを保存できませんでした');
    } finally {
      setSaving(false);
    }
  };

  const addRule = async () => {
    if (whenSlot === outSlot) {
      notifyError('同じスロット同士は選べません');
      return;
    }
    if (pairs.some((p) => p.whenSlot === whenSlot && p.outSlot === outSlot)) {
      notifyError('すでに追加されています');
      return;
    }
    await save([...pairs, { whenSlot, outSlot }]);
    notifySuccess(`「${SLOT_LABELS[whenSlot]}」が出たら「${SLOT_LABELS[outSlot]}」を自動OUTにしました`);
  };

  const removeRule = async (target: Pair) => {
    await save(pairs.filter((p) => !(p.whenSlot === target.whenSlot && p.outSlot === target.outSlot)));
  };

  return (
    <section className="mt-4 overflow-hidden rounded-card border border-border bg-card">
      <div className="flex items-center gap-1.5 border-b border-border-faint bg-surface-subtle px-4 py-2 text-th text-muted-foreground">
        <Zap className="h-3.5 w-3.5" aria-hidden="true" />
        スロット間の自動退出ルール
      </div>
      <div className="p-4">
        <p className="text-sub text-muted-foreground">
          あるスロットが TAKE されたとき、別のスロットを自動で OUT にします（例: フルスクリーンが出たら下部テロップを自動退出）。
          何も設定していなければ、これまでどおり自動では何も起きません。
        </p>

        {pairs.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5">
            {pairs.map((p) => (
              <li
                key={`${p.whenSlot}->${p.outSlot}`}
                className="flex flex-wrap items-center gap-2 rounded-control-md border border-border-faint bg-surface-subtle px-3 py-1.5 text-sub"
              >
                <span className="font-bold">{SLOT_LABELS[p.whenSlot]}</span>
                <span className="text-muted-foreground">が出たら</span>
                <span className="font-bold">{SLOT_LABELS[p.outSlot]}</span>
                <span className="text-muted-foreground">を自動OUT</span>
                <span className="flex-1" />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`「${SLOT_LABELS[p.whenSlot]}→${SLOT_LABELS[p.outSlot]}」のルールを削除`}
                  disabled={saving}
                  onClick={() => { void removeRule(p); }}
                >
                  <X className="h-4 w-4 text-destructive" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SlotSelect value={whenSlot} onChange={setWhenSlot} ariaLabel="対象スロット（出たら）" disabled={saving} />
          <span className="text-sub text-muted-foreground">が出たら</span>
          <SlotSelect value={outSlot} onChange={setOutSlot} ariaLabel="自動退出させるスロット" disabled={saving} />
          <span className="text-sub text-muted-foreground">を自動OUT</span>
          <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => { void addRule(); }}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />追加
          </Button>
        </div>
      </div>
    </section>
  );
}

function SlotSelect({ value, onChange, ariaLabel, disabled }: {
  value: GraphicsSlot;
  onChange: (slot: GraphicsSlot) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as GraphicsSlot)} disabled={disabled}>
      {/* 表の列幅ではなくドロップダウンの幅なので col-width-by-hand の対象外（ThemePicker と同じ理由） */}
      <SelectTrigger className="min-h-tap w-[168px]" aria-label={ariaLabel}> {/* ui-tokens-ok */}
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {GRAPHICS_SLOTS.map((s) => (
          <SelectItem key={s} value={s}>{SLOT_LABELS[s]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
