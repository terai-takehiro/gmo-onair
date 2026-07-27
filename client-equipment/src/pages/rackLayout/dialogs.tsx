// ラック図のダイアログ (ラック名の設定 / セルの見せ方) — v2.9.294 で切り出し。
// **中身は 1 行も変えていない**（移動 + export のみ）。
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ToggleButtonGroup } from '@gmo-onair/shared/src/client/ui/toggle-button-group';
import { type CellConfig, type RackConfig } from './config';

// ── RackSubtitleDialog ────────────────────────────────────────────────────────
export function RackSubtitleDialog({ config, onSave, onClose }: {
  config: RackConfig;
  onSave: (c: RackConfig) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<RackConfig>(config);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>ラック名下テキスト設定</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
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
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>キャンセル</Button>
          <Button size="sm" onClick={() => onSave(form)}>保存</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── ItemTooltip ───────────────────────────────────────────────────────────────

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
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>表示設定 — {item.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">優先表示</Label>
            <div className="flex flex-col gap-1.5">
              {[
                { value: "model", label: "型名を優先" },
                { value: "name",  label: "機材名を優先" },
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
            <Label className="text-xs font-semibold uppercase text-muted-foreground">追加表示項目</Label>
            <div>
              <ToggleButtonGroup
                options={[
                  { value: 'showName',   label: '機材名' },
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

        <div className="flex justify-between gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onReset} className="text-muted-foreground text-xs">
            デフォルトに戻す
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>キャンセル</Button>
            <Button size="sm" onClick={() => onSave(form)}>保存</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── RackDisplay ───────────────────────────────────────────────────────────────
