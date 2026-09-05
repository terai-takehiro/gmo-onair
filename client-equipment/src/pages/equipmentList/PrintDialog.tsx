/**
 * 機材台帳の印刷設定 (何を・どの向きで印刷するか)。
 * 棚卸しを紙で回すときにチェック欄を足せます。
 */
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { Switch } from '@gmo-onair/shared/src/client/ui/switch';
import { ToggleButtonGroup } from '@gmo-onair/shared/src/client/ui/toggle-button-group';
import { PRINT_COLS } from './types';

export interface PrintSettings {
  title: string;
  cols: Set<string>;
  checkbox: boolean;
}

export function PrintDialog({ open, count, value, onChange, onClose, onPrint }: {
  open: boolean;
  count: number;
  value: PrintSettings;
  onChange: (next: PrintSettings) => void;
  onClose: () => void;
  onPrint: () => void;
}) {
  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="印刷の設定"
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={onClose}>キャンセル</Button>
          <Button onClick={onPrint}>
            <Printer className="mr-1 h-4 w-4" aria-hidden="true" />印刷
          </Button>
        </FormDialogFooter>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <Label>表題</Label>
          <Input value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>印刷する列</Label>
          <ToggleButtonGroup
            options={PRINT_COLS.map((c) => ({ value: c.key, label: c.label }))}
            value={Array.from(value.cols)}
            onChange={(next) => onChange({ ...value, cols: new Set(next) })}
            multi
            cols={{ base: 2, sm: 3 }}
            size="sm"
            showSelectAll
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sub">チェック欄を追加 (棚卸しを紙で回すとき)</span>
          <Switch
            checked={value.checkbox}
            onCheckedChange={(v) => onChange({ ...value, checkbox: !!v })}
            aria-label="チェック欄を追加"
          />
        </div>
        {/*
          **「用紙の向き」の切り替えは外しました。** 旧実装は `body` に
          `print-landscape` を付けていましたが、**その名前の CSS がどこにも
          ありません** (機材一覧・ケーブル・コネクタの3か所で同じ)。
          押しても縦のまま出るので、押せる形で残しません。
          向きはブラウザの印刷設定で選びます。
        */}
        <p className="text-note text-muted-foreground">
          いま絞り込んでいる <span className="font-number font-bold">{count}</span> 件を刷ります。
          用紙の向き・余白はブラウザの印刷設定で選んでください。
        </p>
      </div>
    </FormDialog>
  );
}
