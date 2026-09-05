/**
 * 選んだ案件をまとめて直す（`sales` の manager 以上）
 *
 * ── 1回に1項目だけ ──────────────────────────────────────────
 *
 * 機材台帳と同じで、**項目を1つ選んで、選んだ全件に同じ値を当てます**。
 * いくつも同時に変えられるようにすると、確認の文が「N件の 5 項目を変えます」に
 * なり、**何が変わるのかを押す前に読めなくなります**。
 *
 * ── 押す前に「何件が・何から・何に」を出す ──────────────────
 *
 * まとめて書き換えるのは取り消せません（履歴を持たない列です）。
 * **選んだ件数と、これから入る値**を確認の1行に必ず出します。
 *
 * ── 案件分類は2つで1つ ──────────────────────────────────────
 *
 * ⚠️ サーバーは**2つ揃ったときだけ**保存します（`resolveClassification`）。
 * 片方だけ送ると導けずに**黙って捨てられ**、押した人には
 * 「選んだのに入っていない」としか見えません。だからこのダイアログは
 * **客入れの有無と分類を2つとも選ばせてから**でないと押せません。
 *
 * ── ステージはここに無い ────────────────────────────────────
 *
 * 段を動かすと履歴が1行増え、失注なら理由が要り、受注なら GLS 発番の確認が
 * 挟まります。`PATCH /projects/bulk` はそのどれもしないので、**記録の残らない
 * 段の移動**を作らないよう外してあります（`types.ts` の `BULK_FIELDS`）。
 */
import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormDialog } from '@gmo-onair/shared/src/client-v4/formDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  AUDIENCES, AUDIENCE_LABEL, PROJECT_CATEGORIES, PROJECT_CATEGORY_LABEL,
  classificationLabel,
} from '@/contexts/sales/classification';
import { BULK_FIELDS, type BulkFieldKey } from './types';
// 送る中身は**純粋な関数**に出してある（試験で1つずつ固定するため。`bulkSet.ts` の冒頭）
import { buildBulkSet } from './bulkSet';

export interface BulkTarget { id: string; name: string }
export interface BulkOption { id: string; name: string }

export function BulkEditDialog({
  open, onOpenChange, targets, users, customers, saving, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  targets: BulkTarget[];
  users: BulkOption[];
  customers: BulkOption[];
  saving: boolean;
  onSubmit: (set: Record<string, unknown>) => void;
}) {
  const [field, setField] = useState<BulkFieldKey>('classification');
  const [audience, setAudience] = useState('');
  const [category, setCategory] = useState('');
  const [text, setText] = useState('');
  const [flag, setFlag] = useState('');

  const set = buildBulkSet(field, { audience, category, text, flag });
  const count = targets.length;

  /** 何に変わるかの1行（押す前に必ず読ませる） */
  const preview = (() => {
    if (!set) return null;
    switch (field) {
      case 'classification': return classificationLabel(audience, category);
      case 'assigned_to': return users.find((u) => u.id === text)?.name ?? null;
      case 'customer_id': return customers.find((c) => c.id === text)?.name ?? null;
      case 'application_form': return flag === '1' ? 'あり' : 'なし';
      default: return text;
    }
  })();

  const reset = () => { setAudience(''); setCategory(''); setText(''); setFlag(''); };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`選んだ ${count} 件をまとめて直す`}
      footer={
        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
          <Button disabled={!set || saving || count === 0} onClick={() => set && onSubmit(set)}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {count} 件を編集
          </Button>
        </div>
      }
    >
        <div className="space-y-4">
          <div>
            <Label htmlFor="bulk-field">直す項目</Label>
            <Select
              value={field}
              onValueChange={(x) => { setField(x as BulkFieldKey); reset(); }}
            >
              <SelectTrigger id="bulk-field" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BULK_FIELDS.map((f) => (
                  <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-note mt-1 text-muted-foreground">
              1回に1項目です。<strong className="font-bold">ステージはここでは変えられません</strong> —
              段を動かすと履歴・失注理由・GLS 発番の確認が要るので、案件詳細から1件ずつ動かします
            </p>
          </div>

          {field === 'classification' && (
            <div className="space-y-3">
              <div>
                <Label>客入れの有無</Label>
                <div className="mt-1 flex gap-2">
                  {AUDIENCES.map((a) => (
                    <button
                      key={a}
                      type="button"
                      aria-pressed={audience === a}
                      onClick={() => setAudience(a)}
                      className={`min-h-tap text-sub flex flex-1 items-center justify-center rounded-control border font-bold lg:min-h-[40px] ${
                        audience === a
                          ? 'border-primary-border-strong bg-primary-surface text-primary'
                          : 'border-border bg-card text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {AUDIENCE_LABEL[a]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="bulk-cat">案件分類</Label>
                <Select value={category || undefined} onValueChange={setCategory}>
                  <SelectTrigger id="bulk-cat" className="mt-1"><SelectValue placeholder="選ぶ" /></SelectTrigger>
                  <SelectContent>
                    {PROJECT_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{PROJECT_CATEGORY_LABEL[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-note text-muted-foreground">
                <strong className="font-bold">2つとも選んでください。</strong>
                片方だけではサーバーが分類を決められず、選んだ値が保存されません
              </p>
            </div>
          )}

          {field === 'assigned_to' && (
            <div>
              <Label>社内の担当</Label>
              <div className="mt-1">
                <SearchableSelect
                  options={users.map((u) => ({ value: u.id, label: u.name }))}
                  value={text} onChange={setText} placeholder="担当を選ぶ"
                />
              </div>
            </div>
          )}

          {field === 'customer_id' && (
            <div>
              <Label>お客様</Label>
              <div className="mt-1">
                <SearchableSelect
                  options={customers.map((c) => ({ value: c.id, label: c.name }))}
                  value={text} onChange={setText} placeholder="会社を選ぶ"
                />
              </div>
            </div>
          )}

          {(field === 'event_start' || field === 'event_end') && (
            <div>
              <Label htmlFor="bulk-date">{field === 'event_start' ? '実施日（開始）' : '実施日（終了）'}</Label>
              <Input id="bulk-date" type="date" className="mt-1" value={text} onChange={(e) => setText(e.target.value)} />
              <p className="text-note mt-1 text-muted-foreground">
                ⚠️ ここで入れるのは案件の期間です。<strong className="font-bold">スタジオの予約は動きません</strong>
              </p>
            </div>
          )}

          {field === 'application_form' && (
            <div>
              <Label htmlFor="bulk-flag">申込書</Label>
              <Select value={flag || undefined} onValueChange={setFlag}>
                <SelectTrigger id="bulk-flag" className="mt-1"><SelectValue placeholder="選ぶ" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">あり</SelectItem>
                  <SelectItem value="0">なし</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/*
            **押す前に「何件が・何に」を出す。** まとめて書き換えたものは戻せません
            （どの案件が元は何だったかを持っていない）。
          */}
          <div className="rounded-note border border-warning-border bg-warning-surface px-3.5 py-2">
            <p className="text-sub flex items-start gap-2 text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {preview
                  ? <>選んだ <strong className="font-number font-bold">{count}</strong> 件の
                    「{BULK_FIELDS.find((f) => f.key === field)?.label}」を
                    <strong className="font-bold">{preview}</strong> にします。
                    <strong className="font-bold">元に戻せません。</strong></>
                  : <>変える値をまだ選んでいません。</>}
              </span>
            </p>
          </div>
        </div>
    </FormDialog>
  );
}
