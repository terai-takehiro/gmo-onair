/**
 * 「…」で開く小さなメニュー（ツリーの行・ページの上の1行で使い回す）
 *
 * ⚠️ **画面の外側（body 直下）に出します。** ツリーは共通の左メニューの中の
 * `overflow-y-auto` な箱に入っているので、その中に絶対位置で置くと
 * **メニューが箱の縁で切れます**（248px 幅では右半分が消えます）。
 * 上辺バーの本人メニュー（`shared/src/client/shell/AppTopbar.tsx`）と同じく、
 * ボタンの位置を測って固定位置で描きます。
 *
 * 閉じるきっかけは4つ: 項目を選ぶ・外を押す・Esc・画面が動く（巻物／幅の変更）。
 * 画面が動いたら閉じるのは、測った位置がその場でずれるためです。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface WikiMenuItem {
  key: string;
  label: string;
  icon?: LucideIcon;
  /** 押したときにすること。閉じるのはこの部品がやります */
  onSelect: () => void;
  /** 取り消せない操作（赤で出す） */
  danger?: boolean;
  disabled?: boolean;
  /** 下に区切り線を引く（まとまりの切れ目） */
  separatorAfter?: boolean;
}

export interface WikiMoreMenuProps {
  /** 読み上げ用。「○○ の操作」の○○ */
  label: string;
  items: WikiMenuItem[];
  /** ボタンの見た目を小さくする（ツリーの行）。既定は普通の大きさ */
  compact?: boolean;
  /**
   * ボタンの絵柄。既定は「…」。
   * ツリーの「＋」（ページ／データベースのどちらを追加するか選ぶ）で差し替えます。
   */
  icon?: LucideIcon;
  /** 読み上げと吹き出しの文。既定は「○○ の操作」 */
  triggerLabel?: string;
  className?: string;
}

const MENU_WIDTH = 224;

export default function WikiMoreMenu({
  label,
  items,
  compact,
  icon: TriggerIcon = MoreHorizontal,
  triggerLabel,
  className,
}: WikiMoreMenuProps) {
  const buttonLabel = triggerLabel ?? `${label} の操作`;
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    // 右端からはみ出さない。狭い画面では左に寄せる
    const left = Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    setPos({ top: r.bottom + 4, left });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    // 巻物は**中の箱でも**起きる（ツリーの箱）。capture で拾う
    const onMove = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open]);

  // 出せる操作が1つも無い（権限が足りない）ときは「…」そのものを出さない
  if (items.length === 0) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={buttonLabel}
        title={buttonLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          'flex shrink-0 items-center justify-center rounded-control text-muted-foreground hover:bg-muted hover:text-foreground',
          compact ? 'h-8 w-8 lg:h-7 lg:w-7' : 'min-h-tap min-w-tap lg:h-9 lg:min-h-0 lg:w-9 lg:min-w-0',
          open && 'bg-muted text-foreground',
          className,
        )}
      >
        <TriggerIcon className="h-4 w-4" aria-hidden />
      </button>

      {open && pos
        && createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={buttonLabel}
            style={{ top: pos.top, left: pos.left, width: MENU_WIDTH }}
            className="fixed z-[9999] rounded-card border border-border bg-card p-1.5 shadow-2xl shadow-black/10"
          >
            {items.map((it) => (
              <div key={it.key}>
                <button
                  type="button"
                  role="menuitem"
                  disabled={it.disabled}
                  onClick={() => {
                    setOpen(false);
                    it.onSelect();
                  }}
                  className={cn(
                    'flex min-h-tap w-full items-center gap-2.5 rounded-control px-2.5 text-left text-list lg:min-h-0 lg:h-9',
                    it.disabled
                      ? 'text-fg-disabled'
                      : it.danger
                        ? 'text-destructive hover:bg-destructive-surface'
                        : 'text-foreground hover:bg-muted',
                  )}
                >
                  {it.icon && <it.icon className="h-4 w-4 shrink-0" aria-hidden />}
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                </button>
                {it.separatorAfter && <div className="my-1 border-t border-border-faint" />}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
