// ⑤ パッチ盤を1枚足すダイアログ（`TechPersonDialog.tsx` と同じ作法）。
// `TechPanelsPage.tsx` の「盤を追加」から開く。manager 専用（呼び出し側で権限を確認済み）。
import { useEffect, useRef, useState } from "react";
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

  // ⚠️ `BufferedInput` は最大500msバッファしてから `onCommit` を呼ぶ（IME対策・
  // `lib/useBufferedValue.ts`）。Enter送信はその途中でも起きるため、state (`name` 等)
  // だけを読むと入力中の1文字が欠けたまま送信されてしまう。ref は `onCommit` から
  // 同期的に書くので、フォーカス中の欄を明示的に blur（送信前に必ず行う）した直後は
  // 必ず最新値が入っている。`save()` は state ではなく ref を読む
  const nameRef = useRef(name);
  const locationRef = useRef(location);
  const modelRef = useRef(model);

  useEffect(() => {
    if (!open) return;
    setName("");
    setJackCount("48");
    setKind("jack");
    setLocation("");
    setModel("");
    setSaving(false);
    nameRef.current = "";
    locationRef.current = "";
    modelRef.current = "";
  }, [open]);

  const save = async () => {
    // 送信直前にフォーカス中の `BufferedInput` を確定させる（blur → 同期的に commit）。
    // これをしないと、打ち終わった直後に Enter で送ったときだけ最後の入力が消える
    (document.activeElement as HTMLElement | null)?.blur();
    const trimmed = nameRef.current.trim();
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
        location: locationRef.current.trim(),
        model: modelRef.current.trim(),
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
      sub="名前・ch数・種類・場所・型番を入力して追加します。"
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
            onCommit={(v) => { nameRef.current = v; setName(v); }}
            placeholder="例: VJP1900"
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tech-panel-jack-count">ch数</Label>
          <Select value={jackCount} onValueChange={(v) => setJackCount(v as "48" | "32")}>
            <SelectTrigger id="tech-panel-jack-count" className="min-h-tap"><SelectValue /></SelectTrigger>
            <SelectContent>
              {/* TRK盤は TRK1〜32 の固定（一覧・盤の絵が「TRK 32」と決め打っている・
                  `TechPanelsPage.tsx`/`TechPanelBoard.tsx`）。48chのTRK盤を作らせない */}
              <SelectItem value="48" disabled={kind === "trunk"}>48</SelectItem>
              <SelectItem value="32">32</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tech-panel-kind">種類</Label>
          <Select
            value={kind}
            onValueChange={(v) => {
              const nextKind = v as PatchPanelKind;
              setKind(nextKind);
              // TRKはch数を32に固定する（上のch数欄の「48」も同時に無効化する）
              if (nextKind === "trunk") setJackCount("32");
            }}
          >
            <SelectTrigger id="tech-panel-kind" className="min-h-tap"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="jack">パッチ番号</SelectItem>
              <SelectItem value="trunk">TRK</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tech-panel-location">場所</Label>
          <BufferedInput
            id="tech-panel-location"
            value={location}
            onCommit={(v) => { locationRef.current = v; setLocation(v); }}
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tech-panel-model">型番</Label>
          <BufferedInput
            id="tech-panel-model"
            value={model}
            onCommit={(v) => { modelRef.current = v; setModel(v); }}
            className={fieldClass}
          />
        </div>
      </div>
    </FormDialog>
  );
}

export default CreatePanelDialog;
