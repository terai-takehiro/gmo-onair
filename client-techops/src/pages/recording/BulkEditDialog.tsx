/**
 * 選んだ台をまとめて変える（モック Main.dc.html の `bulkEdit`）。
 *
 * ⚠️ **なぜ要るか**（監査 2026-08-22）
 * 12台 × 8欄 を1つずつ触ると **96 回**の操作になる。実際の現場は
 * 「本線8台は全部 1080p59.94 / ProRes:HQ / 2ch」のように**同じ値が並ぶ**ので、
 * まとめて入れられないと入力そのものが罰ゲームになっていた。
 *
 * **機種グループを越える指定はできない。** 本線と控えを同時に選んだときは
 * `commonOptions()` が両方の機種が持てる値だけに絞る（4K・DNxHR・SSD・8ch は消える）。
 */
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { commonOptions, isHdPlus, DECK_FIELDS, type DeckFieldKey } from './deckOptions';

const KEEP = '__keep__';
const fieldCls =
  'h-11 w-full rounded-control-lg border border-input bg-background px-3 text-sub ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export interface BulkPatch {
  videoFormat?: string;
  codec?: string;
  audioChannels?: number;
  slot?: string;
  /** ファイル名の接頭辞。`<接頭辞>_<デッキ id>` にする */
  filePrefix?: string;
}

export default function BulkEditDialog({
  open,
  onOpenChange,
  deckIds,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deckIds: string[];
  onApply: (patch: BulkPatch) => void;
}) {
  const [values, setValues] = useState<Record<DeckFieldKey, string>>({
    videoFormat: KEEP, codec: KEEP, audioChannels: KEEP, slot: KEEP,
  });
  const [prefix, setPrefix] = useState('');

  // 開き直すたびに白紙に戻す（前回の指定が残っていると、意図しない台に効く）
  useEffect(() => {
    if (open) {
      setValues({ videoFormat: KEEP, codec: KEEP, audioChannels: KEEP, slot: KEEP });
      setPrefix('');
    }
  }, [open]);

  const mixedModels = deckIds.some(isHdPlus) && deckIds.some((id) => !isHdPlus(id));
  const sample = deckIds[0] ?? 'REC1';

  const apply = () => {
    const patch: BulkPatch = {};
    if (values.videoFormat !== KEEP) patch.videoFormat = values.videoFormat;
    if (values.codec !== KEEP) patch.codec = values.codec;
    if (values.audioChannels !== KEEP) patch.audioChannels = Number(values.audioChannels);
    if (values.slot !== KEEP) patch.slot = values.slot;
    if (prefix.trim()) patch.filePrefix = prefix.trim();
    onApply(patch);
    onOpenChange(false);
  };

  const nothingToDo = Object.values(values).every((v) => v === KEEP) && !prefix.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>選んだ {deckIds.length} 台にまとめて変える</DialogTitle>
        </DialogHeader>

        {mixedModels && (
          <p className="rounded-note border border-warning-border bg-warning-surface px-3 py-2 text-sub text-warning">
            本線（4K Pro）と控え（HD Plus）を同時に選んでいます。
            <strong>両方の機種が持てる値だけ</strong>を出しています（4K・DNxHR・SSD・8ch は選べません）。
          </p>
        )}

        <div className="space-y-4">
          {DECK_FIELDS.map((f) => {
            const opts = commonOptions(deckIds, f.key);
            return (
              <div key={f.key}>
                <Label htmlFor={`bulk-${f.key}`}>{f.label}</Label>
                <select
                  id={`bulk-${f.key}`}
                  className={fieldCls}
                  value={values[f.key]}
                  onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                >
                  <option value={KEEP}>変えない</option>
                  {opts.map((v) => (
                    <option key={v} value={v}>{f.key === 'audioChannels' ? `${v}ch` : v}</option>
                  ))}
                </select>
                {opts.length === 0 && (
                  <p className="mt-1 text-sub-sm text-muted-foreground">
                    選んだ機種の組み合わせでは共通の候補がありません（1台ずつ直してください）。
                  </p>
                )}
              </div>
            );
          })}

          <div>
            <Label htmlFor="bulk-prefix">ファイル名の接頭辞</Label>
            <input
              id="bulk-prefix"
              className={fieldCls}
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="GLS002-003"
            />
            <p className="mt-1 text-sub-sm text-muted-foreground">
              台ごとに <strong>接頭辞_デッキ</strong> にします（例: {(prefix.trim() || 'GLS002-003')}_{sample}）。
              空のままなら変えません。
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>やめる</Button>
          <Button className="h-11" onClick={apply} disabled={nothingToDo}>
            {deckIds.length} 台に反映する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
