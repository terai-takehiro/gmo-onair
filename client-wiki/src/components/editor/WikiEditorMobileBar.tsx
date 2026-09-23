/**
 * スマホのツールバー（設計 §6-⑨）— **5つだけ**
 *
 * 見出し／箇条書き／チェック／写真／**AI で整える**。キーボードのすぐ上に置きます。
 * PC の6つから「表」と「リンク」を外しているのは、どちらも片手で打つには細かく、
 * 手入力の邪魔になるためです（表の列の増減も PC だけ）。どちらも `/` の一覧から選べます。
 *
 * **5つめは「AI で整える」**（設計 §6-⑨・段E で差し替えた）。スマホの編集は
 * 「手入力＋AI で整える」に絞る、という設計の決めどおりです。
 * その他のブロック（注意書き・折りたたみ・コード・ONAiR カード）は、
 * **行頭で `/` を打つと同じ一覧が開きます** — ボタンは PC のツールバーにだけ置きます。
 *
 * - 高さは 44px 以上（指で押せる最小の大きさ）
 * - 下端は `env(safe-area-inset-bottom)` を足す（ホームバーに重ねない）
 */
import { useRef } from 'react';
import { CheckSquare, Heading2, ImagePlus, List, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  disabled: boolean;
  uploading: boolean;
  onHeading: () => void;
  onBullet: () => void;
  onCheck: () => void;
  onPickImages: (files: FileList | null) => void;
  /** AI で整える（選んだところ・無ければ本文全体） */
  onTidy: () => void;
}

function BarButton({
  label, icon: Icon, onClick, disabled, tone,
}: {
  label: string;
  icon: typeof List;
  onClick: () => void;
  disabled?: boolean;
  /** AI のボタンだけ色で見分けが付くようにする（設計 §6-⑨ の主役） */
  tone?: 'ai';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex min-h-tap flex-col items-center justify-center gap-0.5 rounded-control text-sub-sm active:bg-muted disabled:opacity-50',
        // AI だけ字が長いので、375px でも1行に収まるよう少し広く取る
        tone === 'ai'
          ? 'flex-[1.35] whitespace-nowrap bg-ai-surface font-bold text-ai'
          : 'flex-1 text-foreground',
      )}
    >
      <Icon className="h-5 w-5" aria-hidden />
      {label}
    </button>
  );
}

export default function WikiEditorMobileBar({
  disabled, uploading, onHeading, onBullet, onCheck, onPickImages, onTidy,
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
      <BarButton label="AI で整える" icon={Sparkles} onClick={onTidy} disabled={disabled} tone="ai" />

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
