/**
 * ケーブル・コネクタの 登録 / 編集 / コピー ダイアログ。
 *
 * **ケーブルとコネクタで1つ**です。違うのは「m」と「色」を出すかどうかだけなので、
 * `config.hasLength` で分けています (以前は2つのファイルに同じ入力欄が並んでいて、
 * 片方だけ並び順が違っていました)。
 *
 * 台帳が1枚になったので、**新しく足すときは種別（ケーブル／コネクタ）を先に選びます**。
 * 直すときは選べません — 種別を変えると保存先のテーブルが変わり、
 * 「直した」ではなく「片方を消してもう片方に作った」ことになるためです。
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CATALOG_KINDS, CONFIG_BY_SOURCE, EMPTY_FORM,
  type CatalogForm, type CatalogSource, type KindCode, type SupplyItem,
} from './types';

export type DialogMode =
  | { kind: 'new'; source: CatalogSource }
  | { kind: 'edit'; item: SupplyItem }
  | { kind: 'copy'; item: SupplyItem };

/** 品目 → 入力欄。**コピーのときだけ本数を 0 に戻す** (在庫数は個体ごとの値) */
function toForm(mode: DialogMode, fallbackKind: KindCode): CatalogForm {
  if (mode.kind === 'new') return { ...EMPTY_FORM, kind: fallbackKind };
  const it = mode.item;
  return {
    kind: it.kind,
    location_id: it.location_id || '',
    name: it.name || '',
    manufacturer_id: it.manufacturer_id || '',
    model_number: it.model_number || '',
    length_m: it.length_m == null ? '' : String(it.length_m),
    color: it.color || '',
    quantity: mode.kind === 'copy' ? '0' : String(it.quantity ?? 0),
    storage_method: it.storage_method || '',
    notes: it.notes || '',
  };
}

export function CatalogDialog({
  mode, locations, manufacturers, saving, error, onClose, onSubmit, onChangeSource,
}: {
  mode: DialogMode | null;
  locations: { id: string; name: string }[];
  manufacturers: { id: string; name: string }[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (form: CatalogForm) => void;
  /** 新しく足すときだけ、種別を切り替える */
  onChangeSource: (source: CatalogSource) => void;
}) {
  const [form, setForm] = useState<CatalogForm>(EMPTY_FORM);

  useEffect(() => {
    if (mode) setForm(toForm(mode, 'video'));
  }, [mode]);

  if (!mode) return null;

  const source: CatalogSource = mode.kind === 'new' ? mode.source : mode.item.source;
  const config = CONFIG_BY_SOURCE[source];

  const title = mode.kind === 'edit'
    ? `${config.label}を直す`
    : mode.kind === 'copy'
      ? `${config.label}を写して足す`
      : `${config.label}を足す`;

  const set = <K extends keyof CatalogForm>(k: K, v: CatalogForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <FormDialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={title}
      // 用途/設置場所・メーカー/型名・長さ/色/所有数 の複数の2〜3列グリッドを持つ複合フォームなので wide にする
      wide
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={onClose}>やめる</Button>
          <Button onClick={() => onSubmit(form)} disabled={!form.name.trim() || saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            {mode.kind === 'edit' ? '直す' : '足す'}
          </Button>
        </FormDialogFooter>
      }
    >
      {/* 保存できなかった理由は**上辺に固定**する。本文の末尾に置くと画面外で気づかれない */}
      {error && (
        <p className="mb-3 rounded-control border border-destructive-border bg-destructive-surface px-3 py-2 text-sub text-destructive">
          {error}
        </p>
      )}

      <div className="space-y-3">
          {mode.kind === 'new' && (
            <div className="space-y-1">
              <Label>種別 *</Label>
              <Select value={source} onValueChange={(v) => onChangeSource(v as CatalogSource)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cable">ケーブル（長さと色を持ちます）</SelectItem>
                  <SelectItem value="connector">コネクタ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>用途 *</Label>
              <Select value={form.kind} onValueChange={(v) => set('kind', v as KindCode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATALOG_KINDS.map((k) => <SelectItem key={k.code} value={k.code}>{k.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>設置場所</Label>
              <Select
                value={form.location_id || 'none'}
                onValueChange={(v) => set('location_id', v === 'none' ? '' : v)}
              >
                <SelectTrigger><SelectValue placeholder="選ぶ" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">なし</SelectItem>
                  {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>商品名 *</Label>
            <Input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder={config.namePlaceholder}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>メーカー</Label>
              <Select
                value={form.manufacturer_id || 'none'}
                onValueChange={(v) => set('manufacturer_id', v === 'none' ? '' : v)}
              >
                <SelectTrigger><SelectValue placeholder="選ぶ" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">なし</SelectItem>
                  {manufacturers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>型名</Label>
              <Input
                value={form.model_number}
                onChange={(e) => set('model_number', e.target.value)}
                placeholder={config.modelPlaceholder}
              />
            </div>
          </div>

          <div className={config.hasLength ? 'grid grid-cols-1 gap-3 sm:grid-cols-3' : 'grid grid-cols-1 gap-3 sm:grid-cols-2'}>
            {config.hasLength && (
              <>
                <div className="space-y-1">
                  <Label>長さ (m)</Label>
                  <Input
                    type="number" step="0.1" min="0"
                    value={form.length_m}
                    onChange={(e) => set('length_m', e.target.value)}
                    placeholder="3"
                  />
                </div>
                <div className="space-y-1">
                  <Label>色</Label>
                  <Input value={form.color} onChange={(e) => set('color', e.target.value)} placeholder="黒" />
                </div>
              </>
            )}
            <div className="space-y-1">
              <Label>所有{config.unit}数</Label>
              <Input
                type="number" min="0"
                value={form.quantity}
                onChange={(e) => set('quantity', e.target.value)}
              />
            </div>
            {!config.hasLength && (
              <div className="space-y-1">
                <Label>収納方法</Label>
                <Input
                  value={form.storage_method}
                  onChange={(e) => set('storage_method', e.target.value)}
                  placeholder={config.storagePlaceholder}
                />
              </div>
            )}
          </div>

          {config.hasLength && (
            <div className="space-y-1">
              <Label>収納方法</Label>
              <Input
                value={form.storage_method}
                onChange={(e) => set('storage_method', e.target.value)}
                placeholder={config.storagePlaceholder}
              />
            </div>
          )}

          <div className="space-y-1">
            <Label>備考</Label>
            <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>
    </FormDialog>
  );
}
