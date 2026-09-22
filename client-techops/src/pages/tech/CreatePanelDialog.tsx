// ⑤ パッチ盤を1枚足すダイアログ（`TechPersonDialog.tsx` と同じ作法）。
// `TechPanelsPage.tsx` の「盤を追加」から開く。manager 専用（呼び出し側で権限を確認済み）。
import { useEffect, useState } from "react";
import { FormDialog, FormDialogFooter } from "@gmo-onair/shared/src/client-v4/formDialog";
import type { PatchPanelKind } from "@gmo-onair/shared/src/tech/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import BufferedInput from "@/components/editor/BufferedInput";
import { notifyError } from "@/lib/notify";
import * as techApi from "@/lib/techApi";

const fieldClass =
  "h-11 w-full rounded-control-lg border border-border bg-card px-3 text-list font-normal text-foreground outline-none placeholder:text-fg-disabled";

export function CreatePanelDialog({
  open,
  onOpenChange,
  /** 送れたら `true`（`useTechMasters` の契約）。`false` のときはダイアログを閉じない */
  onSubmit,
  /** 追加できた盤の id。一覧の読み直しが済んでから渡す（呼び出し側で選択に使う） */
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: techApi.CreatePatchPanelPayload) => Promise<boolean>;
  onCreated: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [jackCount, setJackCount] = useState<"48" | "32">("48");
  const [kind, setKind] = useState<PatchPanelKind>("jack");
  const [location, setLocation] = useState("");
  const [model, setModel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setJackCount("48");
    setKind("jack");
    setLocation("");
    setModel("");
    setSaving(false);
  }, [open]);

  const save = async () => {
    const trimmed = name.trim();
    if (trimmed === "") {
      notifyError("盤の名前を入力してください。");
      return;
    }
    setSaving(true);
    try {
      // ⚠️ 失敗は投げずに `false` で返る。閉じてしまうと入力が消えるので、送れたときだけ閉じる
      const ok = await onSubmit({
        name: trimmed,
        jack_count: jackCount === "32" ? 32 : 48,
        kind,
        location: location.trim(),
        model: model.trim(),
      });
      if (ok) {
        onOpenChange(false);
        onCreated(trimmed);
      }
    } catch {
      notifyError("盤を追加できませんでした。", { description: "少し待ってから、もう一度お試しください。" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="盤を追加"
      sub="名前・ch数・種類・場所・型番を入れて追加します。"
      onSubmit={(e) => { e.preventDefault(); void save(); }}
      footer={
        <FormDialogFooter>
          <Button type="button" variant="outline" className="min-h-tap" onClick={() => onOpenChange(false)} disabled={saving}>
            キャンセル
          </Button>
          <Button type="submit" className="min-h-tap" disabled={saving}>
            {saving ? "追加中…" : "追加"}
          </Button>
        </FormDialogFooter>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tech-panel-name">盤の名前</Label>
          <BufferedInput
            id="tech-panel-name"
            value={name}
            onCommit={setName}
            placeholder="例: VJP1900"
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tech-panel-jack-count">ch数</Label>
          <Select value={jackCount} onValueChange={(v) => setJackCount(v as "48" | "32")}>
            <SelectTrigger id="tech-panel-jack-count" className="min-h-tap"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="48">48</SelectItem>
              <SelectItem value="32">32</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tech-panel-kind">種類</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as PatchPanelKind)}>
            <SelectTrigger id="tech-panel-kind" className="min-h-tap"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="jack">パッチ番号</SelectItem>
              <SelectItem value="trunk">TRK</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tech-panel-location">場所</Label>
          <BufferedInput id="tech-panel-location" value={location} onCommit={setLocation} className={fieldClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tech-panel-model">型番</Label>
          <BufferedInput id="tech-panel-model" value={model} onCommit={setModel} className={fieldClass} />
        </div>
      </div>
    </FormDialog>
  );
}

export default CreatePanelDialog;
