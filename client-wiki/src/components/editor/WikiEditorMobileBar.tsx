/**
 * スマホのツールバー（設計 §6-⑨）— **5つだけ**
 *
 * 見出し／箇条書き／チェック／写真／その他。キーボードのすぐ上に置きます。
 * PC の6つから「表」と「リンク」を外しているのは、どちらも片手で打つには細かく、
 * 手入力の邪魔になるためです（表の列の増減も PC だけ）。どちらも「その他」から選べます。
 *
 * ⚠️ 5つめは設計 §6-⑨ では「AI で整える」ですが、**その機能は段E で作ります**。
 * 作っていない機能のボタンを押せる形で出さない（`client-wiki/CLAUDE.md`）ため、
 * いまは「その他」を置いてあります。段E で「AI で整える」に差し替えます。
 *
 * - 高さは 44px 以上（指で押せる最小の大きさ）
 * - 下端は `env(safe-area-inset-bottom)` を足す（ホームバーに重ねない）
 */
import { useRef } from 'react';
import { CheckSquare, Heading2, ImagePlus, List, Plus } from 'lucide-react';

interface Props {
  disabled: boolean;
  uploading: boolean;
  onHeading: () => void;
  onBullet: () => void;
  onCheck: () => void;
  onPickImages: (files: FileList | null) => void;
  onOpenBlocks: () => void;
}

function BarButton({
  label, icon: Icon, onClick, disabled,
}: {
  label: string;
  icon: typeof List;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-tap flex-1 flex-col items-center justify-center gap-0.5 rounded-control text-sub-sm text-foreground active:bg-muted disabled:opacity-50"
    >
      <Icon className="h-5 w-5" aria-hidden />
      {label}
    </button>
  );
}

export default function WikiEditorMobileBar({
  disabled, uploading, onHeading, onBullet, onCheck, onPickImages, onOpenBlocks,
}: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  return (
    <div
      className="sticky bottom-0 z-10 flex shrink-0 items-stretch gap-1 border-t border-border bg-card px-2 pt-1 lg:hidden"
      style={{ paddingBottom: 'max(4px, env(safe-area-inset-bottom))' }}
    >
      <BarButton label="見出し" icon={Heading2} onClick={onHeading} disabled={disabled} />
      <BarButton label="箇条書き" icon={List} onClick={onBullet} disabled={disabled} />
      <BarButton label="チェック" icon={CheckSquare} onClick={onCheck} disabled={disabled} />
      <BarButton
        label={uploading ? '送信中' : '写真'}
        icon={ImagePlus}
        onClick={() => fileRef.current?.click()}
        disabled={disabled || uploading}
      />
      <BarButton label="その他" icon={Plus} onClick={onOpenBlocks} disabled={disabled} />

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          onPickImages(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
