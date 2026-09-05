/**
 * 設定タブの行の右端に置く「編集・削除」。
 *
 * 4つのタブに同じ2つのボタンを書くと、必ずどれか1つだけ大きさや
 * 読み上げの名前が変わります (旧実装は保管場所が `h-8`、メーカーが `h-7` でした)。
 */
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function RowActions({
  name, onEdit, onDelete, disabled,
}: {
  /** 読み上げの名前に使う (「〇〇 を削除」) */
  name: string;
  onEdit: () => void;
  onDelete?: () => void;
  disabled?: boolean;
}) {
  return (
    <span className="flex gap-0.5">
      <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`${name} を編集`}>
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
      {onDelete && (
        <Button
          variant="ghost" size="icon-sm" className="text-destructive"
          onClick={onDelete} disabled={disabled} aria-label={`${name} を削除`}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      )}
    </span>
  );
}
