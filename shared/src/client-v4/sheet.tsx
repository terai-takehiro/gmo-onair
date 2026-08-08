/**
 * 下から出るシート（スマホ・M0）
 *
 * ── なぜ要るのか ────────────────────────────────────────────
 *
 * v4 のスマホの決めごとに **「終わらせるのはシートで」** があります
 * （`docs/design/v4/mobile.md`）。やってはいけない例が明記されています:
 *
 *   > 行タップ→別画面→戻ると先頭に戻る
 *
 * 一覧から1件ずつ片づける画面（やること・受付）で画面遷移すると、
 * **戻ったときにスクロールの位置を失い、次の1件を探し直す**ことになります。
 * 20件片づけるのに20回スクロールし直す形です。
 *
 * ── 置き場所が `client-v4/` な理由 ──────────────────────────
 *
 * `shared/src/client/` に置くと**凍結4アプリの CSS が増えます**
 * （各アプリの Tailwind が `shared/src/client/**` を走査するため。
 *  実測で `RichContent` が 4規則・231バイト増やした）。
 * v4 対象3アプリだけが `client-v4/**` を走査します。
 *
 * ── 実装の決めごと ──────────────────────────────────────────
 *
 * - **Radix の Dialog を土台にする**。焦点の閉じ込め・Esc・下敷きのクリックを
 *   自前で書くと必ずどれかが抜ける（`shared/src/client/ui/dialog.tsx` と同じ土台）
 * - **高さは中身なり、上限 85vh**。固定にすると短い内容で下が空き、
 *   長い内容で画面外に出る
 * - **下端は `env(safe-area-inset-bottom)` を足す**。ホームバーに重なると
 *   いちばん下のボタンが押せない（決めごと「セーフエリアを空ける」）
 * - **主ボタンはシートの下端に固定**（決めごと「主操作は下半分に置く」）。
 *   中身が長いときは中身だけがスクロールする
 * - **PC でも同じ部品を使う**。画面幅で出し分けると、同じ操作の見た目が
 *   2つになる（PC では中央のダイアログに寄せる）
 */
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../client/utils';

export interface SheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** シートの見出し。**必ず付ける**（読み上げが「ダイアログ」としか言わなくなる） */
  title: string;
  /** 見出しの下の1行。何をする場所かを書く */
  sub?: string;
  /** 下端に固定するボタン。**ここに置いたものだけが親指の届く位置に出る** */
  footer?: React.ReactNode;
  /**
   * **24px だけせり上がる**（トップページの AI シート。モック `v4-live`）。
   *
   * 既定は画面の外（100%）から出る動きです。書きかけを持ったまま開け閉めする
   * シートでは、毎回いちばん下から上がってくると**開くたびに待たされて見える**ので、
   * 短い距離にします。**opt-in にしてあるのは、既にあるシートの手触りを
   * この回で変えないため**（`data-v4-sheet` を見て `tokens-v4.css` が当てる）。
   */
  rise?: boolean;
  children: React.ReactNode;
}

export function Sheet({ open, onOpenChange, title, sub, footer, rise, children }: SheetProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/50',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          )}
        />
        <DialogPrimitive.Content
          data-v4-sheet={rise ? 'rise' : undefined}
          className={cn(
            // スマホ: 下からせり上がる。PC: 中央のダイアログに寄せる
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col',
            'rounded-t-app border-t border-border bg-card shadow-2xl shadow-black/20',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
            'lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:w-[min(560px,calc(100vw-4rem))]',
            'lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-card lg:border',
          )}
        >
          {/* つまみ。**押せるものではない**ので読み上げから外す */}
          <span className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border lg:hidden" aria-hidden="true" />

          <div className="flex shrink-0 items-start gap-3 px-4 pb-3 pt-3.5 lg:px-6">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-cardtitle">{title}</DialogPrimitive.Title>
              {sub && <DialogPrimitive.Description className="text-note mt-0.5 text-muted-foreground">{sub}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close
              aria-label="閉じる"
              className="min-h-tap min-w-tap -mr-2 -mt-1 flex shrink-0 items-center justify-center rounded-control text-muted-foreground hover:bg-muted"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>

          {/* **中身だけがスクロールする。** 下のボタンは常に見えている */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 lg:px-6">{children}</div>

          {footer && (
            <div
              className="shrink-0 border-t border-border bg-card px-4 py-3 lg:px-6"
              // ホームバーに重ねない（決めごと「セーフエリアを空ける」）
              style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
            >
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
