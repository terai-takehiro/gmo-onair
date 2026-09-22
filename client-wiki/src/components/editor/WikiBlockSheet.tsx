/**
 * 「その他のブロック」の一覧（`/` を打っても同じものが開く）
 *
 * 下から出るシート（`shared/src/client-v4/sheet.tsx`）で PC もスマホも同じ形にします。
 * 画面幅で見た目を分けると、同じ操作の覚え方が2つになります。
 */
import { Sheet } from '@gmo-onair/shared/src/client-v4/sheet';
import { WIKI_BLOCKS, type WikiBlockChoice } from './blockCatalog';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (block: WikiBlockChoice) => void;
}

export default function WikiBlockSheet({ open, onOpenChange, onPick }: Props) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="その他のブロック"
      sub="カーソルの位置に差し込みます"
      size="md"
    >
      <div className="flex flex-col gap-1">
        {WIKI_BLOCKS.map((block) => (
          <button
            key={block.id}
            type="button"
            onClick={() => onPick(block)}
            className="flex min-h-tap items-center gap-3 rounded-control px-2 py-2 text-left hover:bg-muted"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-muted text-muted-foreground">
              <block.icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-list text-foreground">{block.label}</span>
              <span className="block truncate text-sub text-muted-foreground">{block.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
