/**
 * ダイアログ・シートの幅の段（旧 `Dialog` と v4 `Sheet` の**共通の物差し**）
 *
 * ── なぜ要るのか ────────────────────────────────────────────
 *
 * 幅の上限が**2系統・別々の値**で持たれていて、どちらも狭すぎた:
 *
 * - 旧 `Dialog`（`shared/src/client/ui/dialog.tsx`）… 組み込みの 512px 段で**固定**
 * - v4 `Sheet`（`shared/src/client-v4/sheet.tsx`）… **560px と 760px の2段だけ**
 *   （`wide` を渡したときだけ 760px）
 * - `CrudFormDialog`… **560px から動かす口が無かった**
 *
 * 同じ「登録フォーム」でも、どちらの土台に載っているかで幅が変わり、
 * 呼び出し側は最大幅のクラスを各画面で書き足して散らかしていた。
 *
 * → **段の名前と px を1か所に置き、両系統がここを読む。**
 *
 * | 段 | PC 幅 | 使いどころ |
 * | --- | --- | --- |
 * | `sm` | 420px | 確認だけ（削除の確認・1項目） |
 * | `md` | 640px | **既定**。1カラムのフォーム |
 * | `lg` | 840px | 2カラムの複合フォーム（旧 `wide` の行き先） |
 * | `xl` | 1080px | 表・明細を含むもの |
 * | `full` | min(1400px,96vw) | 画面いっぱい（台帳の明細など） |
 *
 * ── 置き場所について ────────────────────────────────────────
 *
 * ここ（`src/client/ui/`）に置いてあるのは、**旧 `Dialog` が v4 以外からも
 * 使われる部品**だから。`shared/CLAUDE.md` の「v4 でしか使わないクラス名は
 * `src/client-v4/` へ」に従い、**v4 `Sheet` 専用のクラス**はここには置かず
 * `client-v4/sheet.tsx` 側に持たせている。
 * 数字の出どころは両方ともこのファイル（`DIALOG_SIZE_WIDTH`）で、
 * ずれは `shared/tests/dialogSize.test.ts` が止める。
 */

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

/** 段を指定しなかったときの幅。**512px / 560px から 640px に上げた**（狭すぎたため） */
export const DEFAULT_DIALOG_SIZE: DialogSize = 'md';

/** 段 → PC の幅（CSS の長さ）。**ここが唯一の情報源** */
export const DIALOG_SIZE_WIDTH: Record<DialogSize, string> = {
  sm: '420px',
  md: '640px',
  lg: '840px',
  xl: '1080px',
  full: 'min(1400px,96vw)',
};

/**
 * 段 → 旧 `Dialog` に当てるクラス。**完全なクラス文字列の静的な表**にしてある
 * （クラス名を文字列連結で組み立てると Tailwind の走査に載らず、
 *  ビルドしたときだけ幅が効かなくなる）。
 *
 * ⚠️ **画面幅の接頭辞（sm ほか）を付けていない**のは、**呼び出し側が既に付けている
 * 最大幅の指定を勝たせるため**。土台の側に接頭辞を付けると、接頭辞なしで
 * 最大幅を渡している既存の呼び出しは tailwind-merge の打ち消し対象から外れ、
 * CSS の並び順で**あとに出る接頭辞つきの側が勝ってしまう**
 * （接頭辞なしで幅を指定している呼び出しが実際に複数ある）。
 * 接頭辞なしなら tailwind-merge が確実に打ち消すので呼び出し側が勝つ。
 *
 * **スマホで効かないことは変わらない** — 土台が画面幅ぶんの `width` を持ち、
 * そちらのほうが必ず小さいので、`max-width` は広い画面でしか当たらない。
 */
export const DIALOG_MAX_WIDTH_CLASS: Record<DialogSize, string> = {
  sm: 'max-w-[420px]',
  md: 'max-w-[640px]',
  lg: 'max-w-[840px]',
  xl: 'max-w-[1080px]',
  full: 'max-w-[min(1400px,96vw)]',
};

/**
 * `size` と（旧 API の）`wide` から段を決める。
 * **`size` が指定されていればそちらが勝つ**。`wide` は `lg` の別名。
 */
export function resolveDialogSize(size?: DialogSize, wide?: boolean): DialogSize {
  if (size) return size;
  if (wide) return 'lg';
  return DEFAULT_DIALOG_SIZE;
}
