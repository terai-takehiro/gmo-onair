/**
 * CRUD の登録・編集フォーム用ダイアログ（スマホ=下シート・PC=中央ダイアログ）
 *
 * ── 何のために作ったか ──────────────────────────────────────
 *
 * `shared/src/client/ui/dialog.tsx`（`Dialog`/`DialogContent`/`DialogHeader`/
 * `DialogTitle`/`DialogFooter` の合成可能な API）で書かれたフォームが v4 対象3アプリに
 * 55か所あり、どれもスマホで**中央固定モーダル**のまま開く
 * （`docs/v4-native-ui-plan.md` バックログ A-1）。カレンダー①予定の
 * 「部屋を押さえる」だけが自前で下シートを実装していたが、
 * `client-v4/sheet.tsx` の `<Sheet>` を土台にしておらず、他画面へ展開できなかった。
 * この部品は**既存の `<Sheet>` を土台にする**（Radix の焦点閉じ込め・Esc・
 * 下敷きクリックを自前で書き直さない）。
 *
 * ── なぜ合成可能な API（`DialogContent`/`DialogHeader`…）にしなかったか ──
 *
 * 検討はしたが、**`<Sheet>` のフラットな props（title/sub/footer/children）を
 * そのまま使うほうが土台の決めごとに忠実**と判断した。理由:
 *
 * 1. `<Sheet>` は「見出し・閉じるボタン・下端固定フッター」という骨格を
 *    フラットな props で強制する設計（`shared/CLAUDE.md`）。`DialogHeader`/
 *    `DialogTitle` のような入れ子コンポーネントを新たに作ると、
 *    骨格を **props（Sheet 側）と JSX の子要素（合成 API 側）の2通り**で
 *    表現できてしまい、「見出しは `<Sheet title>` で渡す」という決めごとが
 *    ダイアログだけ別ルールになる
 * 2. 合成可能にするには `<FormDialogContent>` の子要素から `<FormDialogTitle>` を
 *    実行時に拾い上げる（`React.Children` を走査する）か、Context 経由で
 *    Sheet に流し込む実装が要る。**中身が増えるだけで、Sheet が既に強制している
 *    骨格をもう一度別の書き方で強制し直すだけ**になる
 * 3. 呼び出し側の書き換えコストは、合成 API でも実際には
 *    `<DialogHeader><DialogTitle>…</DialogTitle></DialogHeader>` を
 *    `title="…"` に潰す作業が要るので大差ない（55か所を実際に見て確認した）
 *
 * → **`FormDialog` は `<Sheet>` のフラットな props をそのまま使う薄いラッパー**
 * にした。名前を分けているのは、「フォームの登録・編集」という用途を型で示すため
 * （呼び出し側から見て `Sheet` と迷わない）。`rise`（AI シートの24pxせり上がり）は
 * フォームでは使わないので props に出していない。
 *
 * ── フッターの組み立ては呼び出し側に任せる ──────────────────────
 *
 * 保存・キャンセル・削除の並び順は画面ごとに違う（削除ボタンだけ左に寄せる、
 * 削除がそもそも無い、など）。共通の `<FormDialogFooter>` で並びまで決め打ちすると
 * 「削除ボタンを左に置きたいだけ」の画面が結局素の `<div>` を書くことになるので、
 * ここでは**並びの慣用クラス名**（旧 `DialogFooter` と同じ挙動）だけ export し、
 * 中身の並びは呼び出し側の JSX に任せている。
 */
import type { FormEvent, ReactNode } from 'react';
import { Sheet } from './sheet';
import { cn } from '../client/utils';
import type { DialogSize } from '../client/ui/dialogSize';

interface FormDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** ダイアログの見出し。**必ず付ける**（読み上げが「ダイアログ」としか言わなくなる） */
  title: string;
  /** 見出しの下の1行。何のフォームかの説明（旧 `DialogDescription`） */
  sub?: string;
  /** 下端に固定するボタン列。**旧 `DialogFooter` の中身をそのまま渡す** */
  footer?: ReactNode;
  /**
   * **PC での幅の段**（既定 `md` = 640px。`Sheet` にそのまま渡す）。
   * 段の定義は `shared/src/client/ui/dialogSize.ts`
   * （`sm` 420 / `md` 640 / `lg` 840 / `xl` 1080 / `full` min(1400px,96vw)）。
   * 2カラムの複合フォームは `lg`、表・明細を含むものは `xl` を使う。
   */
  size?: DialogSize;
  /**
   * @deprecated `size="lg"` を使うこと（互換のため残してある）。
   * `wide` は `size="lg"`（840px）の別名。**両方渡したときは `size` が勝つ。**
   */
  wide?: boolean;
  /**
   * **本文とフッターを `<form>` で束ねる（`Sheet` の `onSubmit` をそのまま渡す・opt-in）。**
   * 渡すと Enterキー送信・`<button type="submit">` が効くようになる。
   * 送信ボタンを `type="submit"` にして、この prop に保存処理を渡すこと
   * （`onClick` で送っている画面は渡さなくてよい — 両方指定すると二重送信になる）。
   */
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  /**
   * **下敷きクリックで閉じさせたくないときだけ渡す（opt-in・`Sheet` にそのまま渡す）。**
   * 書きかけの下書きを黙って破棄させたくない画面（例: AI 投入の確認）で使う。
   * 渡さなければ今までどおり外側クリックで閉じる。
   */
  onInteractOutside?: (e: Event) => void;
  children: ReactNode;
}

export function FormDialog({ open, onOpenChange, title, sub, footer, size, wide, onSubmit, onInteractOutside, children }: FormDialogProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} sub={sub} footer={footer} size={size} wide={wide} onSubmit={onSubmit} onInteractOutside={onInteractOutside}>
      {children}
    </Sheet>
  );
}

/**
 * 旧 `DialogFooter`（`shared/src/client/ui/dialog.tsx`）と同じ並びのクラス名。
 * スマホは縦積み（上から書いた順）・PC は右寄せ横並び。**旧実装は
 * `flex-col-reverse`（逆順）が既定だったが、55か所の呼び出しは軒並み
 * `className="flex-col sm:flex-row gap-2"` で明示的に打ち消しており、
 * 逆順のまま使っている画面は無かった**（実装を確認して決めた）ので、
 * ここでは非逆順を既定にしている。
 */
export const formDialogFooterClass = 'flex flex-col gap-2 sm:flex-row sm:justify-end';

/** `formDialogFooterClass` を当てた `<div>`。`<FormDialog footer={<FormDialogFooter>…}>` で使う */
export function FormDialogFooter({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn(formDialogFooterClass, className)}>{children}</div>;
}

/**
 * **フォームの中で2つの欄を横に並べるときの慣用クラス。**
 *
 * 日付＋時刻・開始＋終了・数量＋単価のように「対」で読む欄は横に並べたいが、
 * 画面ごとに素の2列を直書きすると**スマホでも2列のまま**になり、
 * 375px では入力欄が 150px ほどに潰れて日付も金額も読めなくなる
 * （実際にそうなっている画面がある）。
 *
 * **スマホは1列・`sm`(640px) 以上で2列**にそろえる。3列以上が要るときは
 * この定数を使わず、その画面で意図を書くこと（対で読むものではないため）。
 */
export const formGrid2 = 'grid grid-cols-1 gap-3 sm:grid-cols-2';
