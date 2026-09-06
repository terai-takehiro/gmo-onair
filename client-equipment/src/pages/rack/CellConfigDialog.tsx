/** セル表示設定ダイアログ（表示変更モードで機材ブロックを押すと開く）。優先表示＋追加表示項目を選ぶ */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@gmo-onair/shared/src/client-v4/formDialog";
import { ToggleButtonGroup } from "@gmo-onair/shared/src/client/ui/toggle-button-group";
import { type CellConfig } from "./printConstants";

export function CellConfigDialog({
  item, config, onSave, onReset, onClose,
}: {
  item: any;
  config?: CellConfig;
  onSave: (c: CellConfig) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const defaultCfg: CellConfig = {
    primary: "model",
    showName: false,
    showModel: true,
    showNo: true,
    showCustom: false,
    customText: "",
  };
  const [form, setForm] = useState<CellConfig>(config ?? defaultCfg);

  return (
    <FormDialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={`表示設定 — ${item.name}`}
      footer={
        <div className="flex w-full justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={onReset} className="text-muted-foreground text-xs">
            既定に戻す
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>キャンセル</Button>
            <Button size="sm" onClick={() => onSave(form)}>保存</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase text-muted-foreground">優先表示</Label>
          <div className="flex flex-col gap-1.5">
            {[
              { value: "model", label: "型名を優先" },
              { value: "name",  label: "商品名を優先" },
              { value: "custom", label: "任意文字列" },
            ].map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="primary"
                  value={opt.value}
                  checked={form.primary === opt.value}
                  onChange={() => setForm(f => ({ ...f, primary: opt.value as CellConfig["primary"] }))}
                  className="h-3.5 w-3.5 accent-primary"
                />
                {opt.label}
              </label>
            ))}
          </div>
          {form.primary === "custom" && (
            <Input
              placeholder="表示するテキスト"
              value={form.customText}
              onChange={(e) => setForm(f => ({ ...f, customText: e.target.value }))}
              className="mt-1"
            />
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase text-muted-foreground">追加表示項目</Label>
          <div>
            <ToggleButtonGroup
              options={[
                { value: 'showName',   label: '商品名' },
                { value: 'showModel',  label: '型名' },
                { value: 'showNo',     label: 'No.' },
                { value: 'showCustom', label: '任意文字列' },
              ]}
              value={(['showName','showModel','showNo','showCustom'] as const).filter(k => form[k as keyof CellConfig])}
              onChange={(next) => setForm(f => ({
                ...f,
                showName:   next.includes('showName'),
                showModel:  next.includes('showModel'),
                showNo:     next.includes('showNo'),
                showCustom: next.includes('showCustom'),
              }))}
              multi
              cols={{ base: 2 }}
              size="sm"
            />
          </div>
          {form.showCustom && form.primary !== "custom" && (
            <Input
              placeholder="追加表示するテキスト"
              value={form.customText}
              onChange={(e) => setForm(f => ({ ...f, customText: e.target.value }))}
              className="mt-1"
            />
          )}
        </div>
      </div>
    </FormDialog>
  );
}
