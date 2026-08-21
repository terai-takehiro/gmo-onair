/**
 * 出す列を選ぶ・並べ替える（案件台帳）
 *
 * 機材台帳の `ColumnPicker` と同じ形です。**↑↓ で隣と入れ替えるだけ**にしてあり、
 * 並び順の数字は入力させません（料金表と同じ決めごと — 「10 と 20 の間だから 15」は
 * 内部の都合の押し付けで、同じ数字を2つ入れると並びが不定になる）。
 *
 * **端末に残ることを画面に書きます。** 書かないと、別の端末で開いた人が
 * 「設定が消えた」と受け取ります（`client-v4/recent.ts` と同じ理由）。
 */
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormDialog } from '@gmo-onair/shared/src/client-v4/formDialog';
import { colDef, type LedgerColKey } from './types';
import type { ColumnPrefs } from './useColumnPrefs';

export function ColumnPicker({
  open, onOpenChange, prefs,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prefs: ColumnPrefs;
}) {
  const { order, visible, toggle, move, reset, changed } = prefs;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="出す列を選ぶ"
      footer={
        <div className="flex items-center justify-between gap-3">
          {/* **変えているときだけ出す。** 既定のまま「元に戻す」があると、
              何かを戻せる状態に見えて押されます */}
          {changed ? (
            <Button variant="outline" onClick={reset}>
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />既定に戻す
            </Button>
          ) : <span />}
          <Button onClick={() => onOpenChange(false)}>閉じる</Button>
        </div>
      }
    >
        <p className="text-note text-muted-foreground">
          チェックを外した列は表から消えます。↑↓ で並びを変えられます。
          <strong className="font-bold">この設定はこの端末にだけ残ります</strong>
          （別の端末では既定に戻ります）。
        </p>

        <div className="rounded-card divide-y divide-border-faint border border-border">
          {order.map((key: LedgerColKey, i) => {
            const c = colDef(key);
            const on = visible.has(key);
            return (
              <div key={key} className="flex items-center gap-2 px-3 py-2">
                <input
                  type="checkbox"
                  id={`col-${key}`}
                  checked={on}
                  onChange={() => toggle(key)}
                  className="h-[18px] w-[18px]"
                />
                <label htmlFor={`col-${key}`} className="text-sub min-w-0 flex-1 truncate">
                  {c.label}
                  {/* **名前の列だけが伸びる**ことを書いておく（幅の欄が空なのはそのため） */}
                  {!c.width && <span className="text-note ml-2 text-muted-foreground">幅は残りいっぱい</span>}
                </label>
                <Button
                  variant="outline" size="sm" aria-label={`${c.label} を上へ`}
                  disabled={i === 0} onClick={() => move(key, 'up')}
                >
                  <ChevronUp className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  variant="outline" size="sm" aria-label={`${c.label} を下へ`}
                  disabled={i === order.length - 1} onClick={() => move(key, 'down')}
                >
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            );
          })}
        </div>
    </FormDialog>
  );
}
