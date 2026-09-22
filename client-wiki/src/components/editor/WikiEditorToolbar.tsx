/**
 * ツールバー（PC）— **6つだけ**（設計 §6-③）
 *
 * 見出し／箇条書き／チェックリスト／表／画像／リンク。
 * ここに無いもの（注意書き・折りたたみ・コード・引用・区切り線・ONAiR カード）は
 * 「その他のブロック」にまとめます。**増やさないこと** — 6つに絞っているのは、
 * 記号を覚えていない人が迷わず押せる数にするためです。
 *
 * 押すと**カーソルの位置に記法を差し込みます**（行を選んでいればその行に付けます）。
 * 計算は `markdownEdits.ts`、当てるのは `WikiEditorTextarea` の `apply`。
 */
import { useRef } from 'react';
import {
  CheckSquare, Heading2, Image as ImageIcon, Link2, List, Plus, Table,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  disabled: boolean;
  /** 写真を上げている最中（二重に押させない） */
  uploading: boolean;
  onHeading: () => void;
  onBullet: () => void;
  onCheck: () => void;
  onTable: () => void;
  onLink: () => void;
  onPickImages: (files: FileList | null) => void;
  onOpenBlocks: () => void;
}

function ToolButton({
  label, icon: Icon, onClick, disabled,
}: {
  label: string;
  icon: typeof List;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-control px-2.5 text-sub text-foreground',
        'hover:bg-muted disabled:pointer-events-none disabled:opacity-50',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}

export default function WikiEditorToolbar({
  disabled, uploading, onHeading, onBullet, onCheck, onTable, onLink,
  onPickImages, onOpenBlocks,
}: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  return (
    // スマホは下のツールバー5つだけ（設計 §6-⑨）。ここは幅のある画面でだけ出す
    <div className="hidden h-11 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border px-2 lg:flex lg:px-6">
      <ToolButton label="見出し" icon={Heading2} onClick={onHeading} disabled={disabled} />
      <ToolButton label="箇条書き" icon={List} onClick={onBullet} disabled={disabled} />
      <ToolButton label="チェックリスト" icon={CheckSquare} onClick={onCheck} disabled={disabled} />
      <ToolButton label="表" icon={Table} onClick={onTable} disabled={disabled} />
      <ToolButton
        label={uploading ? '写真を上げています' : '画像'}
        icon={ImageIcon}
        onClick={() => fileRef.current?.click()}
        disabled={disabled || uploading}
      />
      <ToolButton label="リンク" icon={Link2} onClick={onLink} disabled={disabled} />

      <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />

      <ToolButton label="その他のブロック" icon={Plus} onClick={onOpenBlocks} disabled={disabled} />

      <span className="flex-1" />

      {/* 画像を選ぶところ。見せないで、上のボタンから開く */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          onPickImages(e.target.files);
          // 同じ写真をもう一度選べるようにする（値が同じだと change が起きない）
          e.target.value = '';
        }}
      />
    </div>
  );
}
