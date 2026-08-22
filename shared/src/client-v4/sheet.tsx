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
 *
 * ── スワイプで閉じる（M11「純粋な操作感の演出」） ────────────────
 *
 * **左端から右へなぞると閉じる**（iOS のモーダル／画面のスワイプバックと同じ手触り）。
 * **どこからでも**ではなく**左端 24px から始まったときだけ**にしてある —
 * シートの中には横スクロールする表（財務台帳の明細ダイアログ等）を持つものがあり、
 * 本文の途中から右へなぞる操作は「表を右へスクロールする」と衝突する。
 * 左端は本文のスクロール開始位置と重ならないので、安全に間借りできる。
 * **PC では効かない**（マウスは `touchstart` を発火しないので実質何もしない。
 * `lg:` のセンタリングは中央固定の `transform` クラスに任せたままにする —
 * ドラッグ中だけ inline の `transform` を足すので、離せば元のクラスに戻る）。
 * ロジックは `client-v4/edgeSwipeBack.ts` に切り出してあり、シートではない画面
 * （案件作成の3段ウィザード等）からも同じ手触りで使える。
 *
 * ── つまみ・見出しを下へなぞって閉じる（`swipeDownHandle`・opt-in） ──────
 *
 * 「AIに任せる」シートのように**本文が長く縦スクロールする**シートでは、
 * 本文のどこからでも下へなぞると本文のスクロールと衝突する。
 * **つまみ＋見出しの帯（押せる本文を持たない場所）に絞って**下へなぞると
 * 閉じるようにする。既定は off — 短い内容しか持たないシートまで巻き込むと、
 * 見出しの上で指を滑らせただけで閉じてしまい、かえって邪魔になる。
 */
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../client/utils';
import { useEdgeSwipeBack } from './edgeSwipeBack';

/** つまみ・見出しを下へなぞって閉じるときの境目（px）。ヘッダーの高さが短いぶん、
 *  横のスワイプバック（96px）より短くしてある */
const HANDLE_CLOSE_THRESHOLD = 64;

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
  /**
   * **PC の幅を 560px ではなく 760px にする**（2カラムの複合フォーム向け・opt-in）。
   *
   * 既定の 560px は1カラムのフォーム（v4対象3アプリの55か所を実測して決めた）には
   * ちょうどよいが、部屋を複数選ぶ・控室の利用者を並べる等**元から2カラムだった
   * フォーム**（`StudioBookingDialog` 等）を載せ替えると、560px に押し込められて
   * 縦に長くなりすぎる。**既定は変えない**（560px のまま使っている画面の手触りを
   * この prop で変えないため。広げたい呼び出し側だけ明示的に渡す）。
   */
  wide?: boolean;
  /**
   * **本文とフッターを `<form>` で束ねる（opt-in）。**
   *
   * 渡さないと本文（`children`）とフッター（`footer`）は別々の `<div>`（Sheet の
   * DOM 上は兄弟要素）になる。呼び出し側が `children` の中だけを `<form>` で
   * 囲んでも、フッターの送信ボタンはその外に出るため **Enterキー送信も
   * `<button type="submit">` も効かない**（ダイアログ移行で実際に発生し、
   * ボタンを `onClick` で送るやり方に倒された画面が複数ある）。
   * これを渡すと本文とフッターの両方を1つの `<form>` の中に置く。
   */
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  /**
   * **下敷き（オーバーレイ）クリックで閉じさせたくないときだけ渡す（opt-in）。**
   *
   * Radix の既定は外側クリックで `onOpenChange(false)` を呼ぶ。書きかけの下書きを
   * 持つフォーム（例: AI 投入の確認シート）でこれが起きると、誤クリック1回で
   * 確認もAPI呼び出しも無く中身が消える。`shared/src/client/ui/dialog.tsx` の
   * `DialogContent` を直接使う画面はこれを `onInteractOutside={(e) => e.preventDefault()}`
   * で個別に止めているが、`Sheet`/`FormDialog` はそれを渡す穴が無かった。
   * **既定（渡さない）は今までどおり**閉じる — 使っている画面の手触りを変えない。
   */
  onInteractOutside?: (e: Event) => void;
  /**
   * **つまみ・見出しの帯を下へなぞると閉じる**（opt-in）。本文が長く縦スクロール
   * するシートで使う（本文全体に付けると、いつものスクロールと衝突する）。
   */
  swipeDownHandle?: boolean;
  children: React.ReactNode;
}

export function Sheet({
  open, onOpenChange, title, sub, footer, rise, wide, onSubmit, onInteractOutside, swipeDownHandle, children,
}: SheetProps) {
  // スワイプバック（左端 → 右へ）。ドラッグ中だけ inline transform を足し、
  // 離したら 0 に戻す（開いたままなら 0、閉じるときは `onOpenChange` に任せて
  // Radix の exit アニメーションへ引き継ぐ）
  const back = useEdgeSwipeBack({ onBack: () => onOpenChange(false) });

  // つまみ・見出しを下へなぞって閉じる（opt-in）。横のスワイプバックとは別の
  // 状態で持つ — 縦横どちらのジェスチャーで動いたかを見た目にそのまま出すため
  const [dragY, setDragY] = React.useState(0);
  const [handleDragging, setHandleDragging] = React.useState(false);
  const startXH = React.useRef(0);
  const startYH = React.useRef(0);
  const trackingH = React.useRef(false);

  const onHandleTouchStart = (e: React.TouchEvent) => {
    if (!swipeDownHandle) return;
    // 横のスワイプバックが同じ帯で同時に動き出さないよう、ここで止める
    e.stopPropagation();
    startXH.current = e.touches[0].clientX;
    startYH.current = e.touches[0].clientY;
    trackingH.current = true;
    setHandleDragging(true);
  };
  const onHandleTouchMove = (e: React.TouchEvent) => {
    if (!trackingH.current) return;
    e.stopPropagation();
    const t = e.touches[0];
    const dx = t.clientX - startXH.current;
    const dy = t.clientY - startYH.current;
    if (dy < 0 || Math.abs(dx) > Math.abs(dy)) {
      // 上へ戻した、または横の動きのほうが大きい → 追わない
      trackingH.current = false;
      setHandleDragging(false);
      setDragY(0);
      return;
    }
    e.preventDefault();
    setDragY(dy);
  };
  const onHandleTouchEnd = (e: React.TouchEvent) => {
    if (!trackingH.current) { setHandleDragging(false); return; }
    e.stopPropagation();
    trackingH.current = false;
    setHandleDragging(false);
    if (dragY >= HANDLE_CLOSE_THRESHOLD) onOpenChange(false);
    setDragY(0);
  };

  const dragging = back.dragging || handleDragging;

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
          onInteractOutside={onInteractOutside}
          {...back.handlers}
          style={(back.dragX || dragY)
            ? { transform: `translate(${back.dragX}px, ${dragY}px)`, transition: 'none' }
            : undefined}
          className={cn(
            // スマホ: 下からせり上がる。PC: 中央のダイアログに寄せる
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col',
            'rounded-t-app border-t border-border bg-card shadow-2xl shadow-black/20',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
            !dragging && 'transition-transform duration-150 motion-reduce:transition-none',
            'lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-1/2',
            wide ? 'lg:w-[min(760px,calc(100vw-4rem))]' : 'lg:w-[min(560px,calc(100vw-4rem))]',
            'lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-card lg:border',
          )}
        >
          {/* つまみ＋見出し。`swipeDownHandle` のときはこの帯だけ下へなぞって閉じられる */}
          <div
            onTouchStart={onHandleTouchStart}
            onTouchMove={onHandleTouchMove}
            onTouchEnd={onHandleTouchEnd}
            onTouchCancel={onHandleTouchEnd}
            className="shrink-0"
          >
            {/* つまみ。**押せるものではない**ので読み上げから外す */}
            <span className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border lg:hidden" aria-hidden="true" />

            <div className="flex items-start gap-3 px-4 pb-3 pt-3.5 lg:px-6">
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
          </div>

          {/* **中身だけがスクロールする。** 下のボタンは常に見えている */}
          {onSubmit ? (
            // **本文とフッターを同じ `<form>` の中に入れる。** これが無いと
            // フッターの送信ボタンが本文と兄弟の別 div になり、Enterキー送信も
            // `<button type="submit">` も効かなくなる（実際にダイアログ移行で
            // 発生した — フッターの中身は変えず、外側だけ `<form>` にする）
            <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 lg:px-6">{children}</div>
              {footer && (
                <div
                  className="shrink-0 border-t border-border bg-card px-4 py-3 lg:px-6"
                  style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
                >
                  {footer}
                </div>
              )}
            </form>
          ) : (
            <>
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
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
