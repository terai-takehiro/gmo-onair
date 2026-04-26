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
 */
import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from './dialog';
import { Button } from './button';

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

export interface CrudFormDialogProps {
  /** useCrudPage の戻り値、または互換のあるオブジェクト */
  crud: CrudPageBindings;

  /** タイトル: 文字列 1 本 (create/edit 共通) または LabelByMode (モード別) */
  title: React.ReactNode | LabelByMode;
  /** 説明文 (任意) */
  description?: React.ReactNode | LabelByMode;

  /** 送信ハンドラ。typically form.handleSubmit(...) */
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;

  /** ダイアログサイズ (default: 'md') */
  size?: 'sm' | 'md' | 'lg' | 'xl';

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

const SIZE_CLASSES: Record<NonNullable<CrudFormDialogProps['size']>, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-2xl',
};

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
  size = 'md',
  submitLabel,
  cancelLabel = 'キャンセル',
  submitDisabled = false,
  footer,
  formClassName,
  children,
}: CrudFormDialogProps) {
  const titleNode = pickLabel(title, crud.isEditing);
  const descriptionNode = pickLabel(description, crud.isEditing);
  const defaultSubmitLabel: LabelByMode = { create: '追加', edit: '更新' };
  const submitNode = pickLabel(submitLabel ?? defaultSubmitLabel, crud.isEditing);

  return (
    <Dialog open={crud.dialogOpen} onOpenChange={crud.setDialogOpen}>
      <DialogContent className={cn(SIZE_CLASSES[size], 'max-h-[90vh] overflow-y-auto')}>
        <DialogHeader>
          <DialogTitle>{titleNode}</DialogTitle>
          {descriptionNode ? <DialogDescription>{descriptionNode}</DialogDescription> : null}
        </DialogHeader>
        <form onSubmit={onSubmit} className={cn('space-y-4', formClassName)}>
          {children}
          {footer ?? (
            <DialogFooter>
              <Button type="button" variant="outline" onClick={crud.closeDialog}>
                {cancelLabel}
              </Button>
              <Button type="submit" disabled={submitDisabled || crud.save.isPending}>
                {crud.save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                {submitNode}
              </Button>
            </DialogFooter>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
