/**
 * shared/src/client/ui/crud-form-dialog.tsx — Phase 2C (v2.6.12)
 *
 * useCrudPage と組み合わせて使う「編集 / 新規追加」用ダイアログのラッパー。
 *
 * これまで各ページで以下のボイラーが繰り返されていた:
 *   <Dialog open={crud.dialogOpen} onOpenChange={crud.setDialogOpen}>
 *     <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
 *       <DialogHeader>
 *         <DialogTitle>{crud.isEditing ? "編集" : "追加"}</DialogTitle>
 *         <DialogDescription>...</DialogDescription>
 *       </DialogHeader>
 *       <form onSubmit={...} className="space-y-4">
 *         {fields}
 *         <DialogFooter>
 *           <Button type="button" variant="outline" onClick={crud.closeDialog}>キャンセル</Button>
 *           <Button type="submit" disabled={crud.save.isPending}>
 *             {crud.save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
 *             {crud.isEditing ? "更新" : "追加"}
 *           </Button>
 *         </DialogFooter>
 *       </form>
 *     </DialogContent>
 *   </Dialog>
 *
 * これを 1 コンポーネントに集約。フィールドだけが children として渡る。
 *
 * 使い方:
 *   <CrudFormDialog
 *     crud={crud}
 *     title={{ create: '顧客追加', edit: '顧客編集' }}
 *     description={{ create: '新しい顧客を追加します', edit: '顧客情報を編集します' }}
 *     onSubmit={form.handleSubmit((v) => crud.save.mutate(v))}
 *   >
 *     <FormField label="顧客名 *">
 *       <Input {...form.register('name', { required: true })} />
 *     </FormField>
 *     ...
 *   </CrudFormDialog>
 *
 * ── Sheet（下から出るシート）に載せ替えた回（2026-08）─────────
 *
 * v4 の決めごと「終わらせるのはシートで」（`client-v4/sheet.tsx` の冒頭）に対して、
 * 中央固定の `Dialog` のまま唯一取り残されていた部品（スマホ最適化の洗い出し
 * 2026-08-20・要対応7）。`取引先マスター`（/sales/companies）と`取引先`
 * （/budget/vendors）はどちらもスマホ対応済み画面で、新規追加・編集はここを通る。
 *
 * - **保存ボタンをシートの下端（footer）に固定した。** 中身が長いフォームでも
 *   ホームバー付近まで指を伸ばせば押せる（決めごと「主操作は下半分に置く」）
 * - **フォームと保存ボタンが DOM 上で離れる**（保存ボタンは footer、フォームは
 *   スクロール領域の中）ので、`<form id>` ＋ 保存ボタンの `form=` 属性で結ぶ
 *   （ネイティブ HTML の仕組みで、同じ文書内なら要素が離れていても送信できる）
 * - **`title`/`description` は文字列に絞った。** `Sheet` の見出しは読み上げの
 *   ためにプレーンな文字列を要求する（実際の呼び出し2か所とも文字列だった）
 * - **`size` は `Sheet` にそのまま渡す**（幅の段の定義は `./dialogSize.ts`）。
 *   Sheet 化した回はここを「受け取るだけで効かない」互換 prop にしていたが、
 *   その結果 **PC でも 560px から動かす口が無くなり**、2カラムのフォーム
 *   （取引先マスターの登録は `size="lg"` を渡していた）まで1カラム幅に
 *   押し込められていた。段は旧 `Dialog` と同じ名前・同じ px を使う
 */
import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../utils';
import { Sheet } from '../../client-v4/sheet';
import { Button } from './button';
import type { DialogSize } from './dialogSize';

/**
 * useCrudPage が返すオブジェクトのうち、CrudFormDialog が必要とする部分。
 * shared/hooks/useCrudPage の CrudPageResult のサブセット。
 */
export interface CrudPageBindings {
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  isEditing: boolean;
  closeDialog: () => void;
  save: { isPending: boolean };
}

export interface LabelByMode {
  create: React.ReactNode;
  edit: React.ReactNode;
}

/** タイトル・説明文だけの専用の型。`Sheet` の見出しは文字列を要求するため */
export interface TextByMode {
  create: string;
  edit: string;
}

export interface CrudFormDialogProps {
  /** useCrudPage の戻り値、または互換のあるオブジェクト */
  crud: CrudPageBindings;

  /** タイトル: 文字列 1 本 (create/edit 共通) または TextByMode (モード別) */
  title: string | TextByMode;
  /** 説明文 (任意) */
  description?: string | TextByMode;

  /** 送信ハンドラ。typically form.handleSubmit(...) */
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;

  /**
   * **PC での幅の段**（既定 `md` = 640px。`Sheet` にそのまま渡す）。
   * 段の定義は `./dialogSize.ts`
   * （`sm` 420 / `md` 640 / `lg` 840 / `xl` 1080 / `full` min(1400px,96vw)）。
   * 2カラムの複合フォームは `lg`、表・明細を含むものは `xl`。
   */
  size?: DialogSize;

  /** 保存ボタンのラベル (default: { create: '追加', edit: '更新' }) */
  submitLabel?: React.ReactNode | LabelByMode;
  /** キャンセルボタンのラベル (default: 'キャンセル') */
  cancelLabel?: React.ReactNode;

  /** 保存ボタンの無効化条件 (crud.save.isPending とは AND される) */
  submitDisabled?: boolean;

  /** フッターを差し替えたい場合 (削除ボタンを左側に置く等)。指定すると default の 2 ボタンは描画しない */
  footer?: React.ReactNode;

  /** form 要素にクラスを足したい場合 (default: 'space-y-4') */
  formClassName?: string;

  /** フォーム本体 (フィールド群) */
  children: React.ReactNode;
}

function pickText(value: string | TextByMode | undefined, isEditing: boolean): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'object') return isEditing ? value.edit : value.create;
  return value;
}

function pickLabel(value: React.ReactNode | LabelByMode | undefined, isEditing: boolean): React.ReactNode {
  if (value == null) return null;
  if (typeof value === 'object' && value !== null && 'create' in (value as object) && 'edit' in (value as object)) {
    return isEditing ? (value as LabelByMode).edit : (value as LabelByMode).create;
  }
  return value as React.ReactNode;
}

export function CrudFormDialog({
  crud,
  title,
  description,
  onSubmit,
  size,
  submitLabel,
  cancelLabel = 'キャンセル',
  submitDisabled = false,
  footer,
  formClassName,
  children,
}: CrudFormDialogProps) {
  const formId = React.useId();
  const titleText = pickText(title, crud.isEditing) ?? '';
  const descriptionText = pickText(description, crud.isEditing);
  const defaultSubmitLabel: LabelByMode = { create: '追加', edit: '更新' };
  const submitNode = pickLabel(submitLabel ?? defaultSubmitLabel, crud.isEditing);

  return (
    <Sheet
      open={crud.dialogOpen}
      onOpenChange={crud.setDialogOpen}
      title={titleText}
      sub={descriptionText}
      size={size}
      footer={footer ?? (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={crud.closeDialog}>
            {cancelLabel}
          </Button>
          <Button type="submit" form={formId} disabled={submitDisabled || crud.save.isPending}>
            {crud.save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {submitNode}
          </Button>
        </div>
      )}
    >
      <form id={formId} onSubmit={onSubmit} className={cn('space-y-4', formClassName)}>
        {children}
      </form>
    </Sheet>
  );
}
