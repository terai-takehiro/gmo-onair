// 選択中の差し込みブロック（kind:'linked'）の右パネル（段C・production-manual.md
// §6④・§7-2）。自由ブロックの書式パネル（`BlockInspector.tsx`。Integrate 担当が触る）とは
// 別物 — こちらが持つのは「出す項目・見せ方」（`link.options`）と「秘密を紙に出すか」
// （`link.reveal`）の2つだけ。大きさ・色などの見た目（`style`）は段Bの仕組みをそのまま使う
// ので触らない。
//
// options の作り込みは段Cの本質ではない（凝りすぎない）— ブロック種別ごとに意味のある
// 1〜2個の設定があれば十分（options に無いキーは resolver 側が既定値で扱う）。
import { useState } from "react";
import { Lock } from "lucide-react";
import { confirmAction } from "@gmo-onair/shared/src/client/ui/confirm";
import BufferedInput from "@/components/editor/BufferedInput";
import { useAuth } from "@/hooks/useAuth";
import type { ManualLinkedBlock, ManualLinkedBlockLink } from "@gmo-onair/shared/src/opsmanual/types";
import type { ManualLinkedBlockDef, ManualLinkedBlockKey } from "@gmo-onair/shared/src/production/manualBlocks";

// 差し込み元ごとの伏せ字対象（production-manual.md §7-2）。`hasSecrets: true` の2種だけ
const REVEAL_FIELDS: Partial<Record<ManualLinkedBlockKey, string[]>> = {
  "streaming.list": ["streamKey"],
  "streaming.webMeeting": ["passcode"],
};

type OptionField =
  | { kind: "text"; key: string; label: string; placeholder?: string }
  | { kind: "checkbox"; key: string; label: string; defaultValue: boolean }
  | { kind: "timeRange"; startKey: string; endKey: string; label: string };

// ブロック種別ごとの「出す項目・見せ方」。ここに無い種別は既定のまま（options なし）で出す
const OPTION_FIELDS: Partial<Record<ManualLinkedBlockKey, OptionField[]>> = {
  "schedule.day": [{ kind: "timeRange", startKey: "startTime", endKey: "endTime", label: "時間帯" }],
  "sheet.excerpt": [{ kind: "text", key: "sectionTitle", label: "セクション", placeholder: "見出しの文字を入力" }],
  "project.team": [{ kind: "checkbox", key: "showPhone", label: "電話番号も出す", defaultValue: true }],
};

const FIELD_LABEL = "flex items-center justify-between gap-2 text-sub-sm text-muted-foreground";
const FIELD_INPUT = "w-28 rounded border border-input bg-background px-2 py-1 text-sub-sm text-foreground";

function formatRevealAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface Props {
  block: ManualLinkedBlock;
  def: ManualLinkedBlockDef;
  /** `link` へマージする差分だけを渡す（呼び出し側が `{ ...block.link, ...patch }` を保存する） */
  onCommit: (patch: Partial<ManualLinkedBlockLink>) => void;
}

export default function LinkedBlockInspector({ block, def, onCommit }: Props) {
  const { currentUser } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const { link } = block;
  const fields = OPTION_FIELDS[def.key] ?? [];
  const revealed = !!link.reveal?.fields?.length;

  const patchOptions = (key: string, value: unknown) => {
    onCommit({ options: { ...link.options, [key]: value } });
  };

  const handleRevealChange = async (checked: boolean) => {
    if (!checked) {
      onCommit({ reveal: undefined }); // 消す（JSON化すると欄ごと無くなる＝サーバーは伏せ字のまま返す）
      return;
    }
    setConfirming(true);
    const ok = await confirmAction({
      tone: "danger",
      title: "秘密を紙に出しますか",
      description: "この項目は紙に出ます。配った人は誰でも見られます。よろしいですか",
    });
    setConfirming(false);
    if (!ok) return; // 既定は「出さない」に戻る（チェックは付かない）
    onCommit({
      reveal: { by: currentUser?.id ?? "", at: new Date().toISOString(), fields: REVEAL_FIELDS[def.key] ?? [] },
    });
  };

  const revealedByLabel = link.reveal
    ? link.reveal.by === currentUser?.id
      ? currentUser?.name ?? link.reveal.by
      : link.reveal.by
    : null;

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-sub-sm font-medium text-foreground">{def.label}</span>
        <span className="text-sub-sm text-muted-foreground">{def.description}</span>
      </div>

      {fields.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-2">
          {fields.map((f) => (
            <OptionFieldRow key={f.kind === "timeRange" ? f.startKey : f.key} field={f} options={link.options} onChange={patchOptions} />
          ))}
        </div>
      )}

      {def.hasSecrets && (
        <div className="flex flex-col gap-1 border-t border-border pt-2">
          <label className={FIELD_LABEL}>
            <span className="flex items-center gap-1 text-foreground">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              秘密を紙に出す
            </span>
            <input
              type="checkbox"
              checked={revealed}
              disabled={confirming}
              onChange={(e) => handleRevealChange(e.target.checked)}
              className="h-4 w-4"
            />
          </label>
          {revealed && link.reveal && (
            <span className="text-sub-sm text-muted-foreground">
              {revealedByLabel ?? "不明な人"}さんが解除しました（{formatRevealAt(link.reveal.at)}）
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function OptionFieldRow({
  field,
  options,
  onChange,
}: {
  field: OptionField;
  options: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  if (field.kind === "text") {
    // 日本語のセクション名等を打つ欄なので、素の <input onChange> ではなく IME を壊さない
    // BufferedInput を使う（client-techops/CLAUDE.md「入力欄は素の <input value onChange> で書かない」）
    return (
      <label className={FIELD_LABEL}>
        {field.label}
        <BufferedInput
          value={typeof options[field.key] === "string" ? (options[field.key] as string) : ""}
          onCommit={(v) => onChange(field.key, v)}
          placeholder={field.placeholder}
          className={FIELD_INPUT}
        />
      </label>
    );
  }
  if (field.kind === "checkbox") {
    const checked = typeof options[field.key] === "boolean" ? (options[field.key] as boolean) : field.defaultValue;
    return (
      <label className={FIELD_LABEL}>
        {field.label}
        <input type="checkbox" checked={checked} onChange={(e) => onChange(field.key, e.target.checked)} className="h-4 w-4" />
      </label>
    );
  }
  // timeRange
  return (
    <div className={FIELD_LABEL}>
      {field.label}
      <span className="flex items-center gap-1">
        <input
          type="time"
          value={typeof options[field.startKey] === "string" ? (options[field.startKey] as string) : ""}
          onChange={(e) => onChange(field.startKey, e.target.value)}
          className={FIELD_INPUT}
        />
        <span aria-hidden="true">〜</span>
        <input
          type="time"
          value={typeof options[field.endKey] === "string" ? (options[field.endKey] as string) : ""}
          onChange={(e) => onChange(field.endKey, e.target.value)}
          className={FIELD_INPUT}
        />
      </span>
    </div>
  );
}
