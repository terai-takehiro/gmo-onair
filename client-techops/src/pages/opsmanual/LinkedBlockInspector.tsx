// 選択中の差し込みブロック（kind:'linked'）の右パネル（段C・production-manual.md
// §6④・§7-2）。自由ブロックの書式パネル（`BlockInspector.tsx`。Integrate 担当が触る）とは
// 別物 — こちらが持つのは「出す項目・見せ方」（`link.options`）と「秘密を紙に出すか」
// （`link.reveal`）の2つだけ。大きさ・色などの見た目（`style`）は段Bの仕組みをそのまま使う
// ので触らない。
//
// options の作り込みは段Cの本質ではない（凝りすぎない）— ブロック種別ごとに意味のある
// 1〜2個の設定があれば十分（options に無いキーは resolver 側が既定値で扱う）。
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, PenSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  | { kind: "timeRange"; startKey: string; endKey: string; label: string }
  | { kind: "select"; key: string; label: string; choices: { value: string; label: string }[] };

// ブロック種別ごとの「出す項目・見せ方」。ここに無い種別は既定のまま（options なし）で出す。
// `Record<string, ...>`（`Partial<Record<ManualLinkedBlockKey, ...>>` ではなく）にしてあるのは、
// `venue.*` を先に足したこちらが `ManualLinkedBlockKey` 側の並行作業とすれ違っても
// 過剰プロパティ検査（excess property check）で壊れないようにするため。
const OPTION_FIELDS: Record<string, OptionField[]> = {
  "schedule.day": [{ kind: "timeRange", startKey: "startTime", endKey: "endTime", label: "時間帯" }],
  "sheet.excerpt": [{ kind: "text", key: "sectionTitle", label: "セクション", placeholder: "見出しの文字を入力" }],
  "project.team": [{ kind: "checkbox", key: "showPhone", label: "電話番号も出す", defaultValue: true }],
  // 会場図面（venue-layout.md §9-2 の11番「範囲・縮尺・凡例・通り芯の有無・（items のときは）出す列」）。
  // 「範囲」「縮尺」は resolver がまだ読んでいない参考値（`venue.resolver.ts` 冒頭コメント）——
  // 紙の札の表記の上書きにだけ `VenueLinkedContent.tsx` が使う。「凡例」「通り芯」はクライアント側の
  // 見せ方としてそのまま効く。
  "venue.layout": [
    { kind: "select", key: "range", label: "範囲", choices: [{ value: "area", label: "エリア" }, { value: "floor", label: "階全体" }] },
    { kind: "select", key: "scale", label: "縮尺", choices: [
      { value: "auto", label: "自動" },
      ...[50, 75, 100, 150, 200, 250, 300, 400].map((s) => ({ value: String(s), label: `1:${s}` })),
    ] },
    { kind: "checkbox", key: "legend", label: "凡例を出す", defaultValue: true },
    { kind: "checkbox", key: "grid", label: "通り芯を出す", defaultValue: false },
  ],
  "venue.items": [
    { kind: "checkbox", key: "showCount", label: "数を出す", defaultValue: true },
    { kind: "checkbox", key: "showQty", label: "保有数を出す", defaultValue: true },
    { kind: "checkbox", key: "showStorage", label: "保管場所を出す", defaultValue: true },
  ],
  // 技術資料（tech-docs.md §8-2 の options 欄「系統で絞る／備考を出すか」「作業日で絞る／会社を出すか」）。
  // どちらも届いた `data` を絞り込むだけなので、クライアント側（`TechLinkedContent.tsx`）で効かせる。
  "tech.patch": [
    { kind: "text", key: "group", label: "系統", placeholder: "系統名を入力" },
    { kind: "checkbox", key: "showNote", label: "備考も出す", defaultValue: false },
  ],
  "tech.staff": [
    { kind: "text", key: "workDate", label: "作業日", placeholder: "2026-10-15" },
    { kind: "checkbox", key: "showCompany", label: "会社も出す", defaultValue: true },
  ],
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
  /** 「会場図面を編集」の戻り先（`?return=`）に要る。venue.* 以外は使わない */
  manualId?: string;
  /** true なら「先に確定を解いてから」を添える（venue-layout.md §9-4 の5点目） */
  isManualFixed?: boolean;
}

export default function LinkedBlockInspector({ block, def, onCommit, manualId, isManualFixed }: Props) {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const { link } = block;
  const fields = OPTION_FIELDS[def.key] ?? [];
  const revealed = !!link.reveal?.fields?.length;
  const isVenue = def.key === "venue.layout" || def.key === "venue.items";

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

      {/* 冊子から図面へ移って戻る（venue-layout.md §9-4）。sourceId は venue.* なら必ず持つ
          （InsertPanel.tsx の requiresSource で置く前に確定させている） */}
      {isVenue && link.sourceId && manualId && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-2">
          {isManualFixed && (
            <p className="text-sub-sm text-warning">この冊子は確定済みです。図面を直しても、配った紙は変わりません。直すなら先に確定を解いてください。</p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-tap w-fit"
            onClick={() => navigate(`/techops/venue-layouts/${link.sourceId}?return=${encodeURIComponent(`/techops/manuals/${manualId}`)}`)}
          >
            <PenSquare className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            会場図面を編集
          </Button>
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
  if (field.kind === "select") {
    const value = typeof options[field.key] === "string" ? (options[field.key] as string) : field.choices[0]?.value ?? "";
    return (
      <label className={FIELD_LABEL}>
        {field.label}
        <select value={value} onChange={(e) => onChange(field.key, e.target.value)} className={FIELD_INPUT}>
          {field.choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
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
