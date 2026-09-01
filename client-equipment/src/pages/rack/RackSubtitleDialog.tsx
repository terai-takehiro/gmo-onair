/** ラック名下テキスト（サブタイトル）の設定ダイアログ。自動／非表示／カスタムの3択 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormDialog, FormDialogFooter } from "@gmo-onair/shared/src/client-v4/formDialog";
import { type RackConfig } from "./printConstants";

export function RackSubtitleDialog({ config, onSave, onClose }: {
  config: RackConfig;
  onSave: (c: RackConfig) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<RackConfig>(config);
  return (
    <FormDialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="ラック名下テキスト設定"
      footer={
        <FormDialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>キャンセル</Button>
          <Button size="sm" onClick={() => onSave(form)}>保存</Button>
        </FormDialogFooter>
      }
    >
      <div className="space-y-3">
        {[
          { value: "auto",   label: "自動（拠点・種別・建物情報）" },
          { value: "hidden", label: "非表示" },
          { value: "custom", label: "カスタム文字列" },
        ].map((opt) => (
          <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="radio" name="subtitleMode" value={opt.value}
              checked={form.subtitleMode === opt.value}
              onChange={() => setForm(f => ({ ...f, subtitleMode: opt.value as RackConfig["subtitleMode"] }))}
              className="h-3.5 w-3.5 accent-primary"
            />
            {opt.label}
          </label>
        ))}
        {form.subtitleMode === "custom" && (
          <Input
            placeholder="表示するテキスト"
            value={form.subtitleText}
            onChange={(e) => setForm(f => ({ ...f, subtitleText: e.target.value }))}
          />
        )}
      </div>
    </FormDialog>
  );
}
