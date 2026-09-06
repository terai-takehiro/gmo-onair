/**
 * データビューア — **1行を直す／消すダイアログ**
 *
 * ── 何のまとまりか ──────────────────────────────────────────
 *
 * システム管理者だけが開く2枚。編集は
 * **触れる列を先に、触れないシステム列を後ろにまとめて**並べる
 * （DB のカラム順のままだと id / created_at のような触れない欄が
 * 入力欄の間に挟まり、そのたびに手が止まる）。送る中身は列名で持つ
 * `editFormValues` が決めるので、並べ替えても保存されるものは変わらない。
 * 削除は `deleted_at` に時刻を入れる論理削除で、**列名も用語も画面には出さない**。
 *
 * ── なぜ切り出したか ────────────────────────────────────────
 *
 * `DataViewerPage.tsx` が 400 行（1ファイルの上限）を大きく超えていたため、
 * **レール / 表の中身 / 行を直すダイアログ**に分けた。値の組み立て・送信
 * （`submitEdit` / `submitDelete`）は `DataViewerPage.tsx` に残したままで、
 * ここは受け取ったものを描くだけ。**JSX は1文字も変えずに移してある。**
 */
import type { Dispatch, SetStateAction } from 'react';
import { Loader2, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { COLUMN_LABELS } from './columns';
import { TABLE_LABELS } from './tables';

/** 表の列の形（`/data-viewer/tables/:name/schema` が返すもの） */
export type ColumnSchema = { name: string; type: string; nullable: boolean; editable: boolean };

export function RowEditDialog({
  editingRow, setEditingRow, editFormValues, setEditFormValues,
  selectedTable, schema, updateMutation, submitEdit,
}: {
  editingRow: Record<string, unknown> | null;
  setEditingRow: Dispatch<SetStateAction<Record<string, unknown> | null>>;
  editFormValues: Record<string, string>;
  setEditFormValues: Dispatch<SetStateAction<Record<string, string>>>;
  selectedTable: string;
  schema: ColumnSchema[] | undefined;
  updateMutation: { isPending: boolean };
  submitEdit: () => void;
}) {
  // v2.8.0+: 編集ダイアログ
  return (
    <FormDialog
      open={!!editingRow}
      onOpenChange={(open) => { if (!open) { setEditingRow(null); setEditFormValues({}); } }}
      title={`${TABLE_LABELS[selectedTable] || selectedTable} の行を編集`}
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={() => { setEditingRow(null); setEditFormValues({}); }}>
            キャンセル
          </Button>
          <Button onClick={submitEdit} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            保存
          </Button>
        </FormDialogFooter>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sub text-muted-foreground">
          <span className="text-xs">id: {editingRow?.id as string}</span><br />
          編集できないシステム列 (id / created_at / updated_at / deleted_at / 認証情報など) は無効化されています。
        </p>
        {schema && editingRow && (
          <div className="space-y-3">
            {/*
              **編集できる列を先に、編集できないシステム列を後ろにまとめる。**
              DB のカラム順のまま並べると id / created_at / 認証情報のような
              触れない欄が入力欄の間に挟まり、そのたびに手が止まる。
              並べ替えているのは描く順だけで、送る中身は列名で持つ
              `editFormValues` が決めるので変わらない（`sort` は安定なので、
              かたまりの中の並びは今までどおり DB のカラム順）。
            */}
            {[...schema].sort((a, b) => Number(!a.editable) - Number(!b.editable)).map((col) => {
              const isLong = col.type === 'text' || col.type === 'jsonb' || col.type === 'json';
              const value = editFormValues[col.name] ?? "";
              return (
                <div key={col.name} className="grid gap-1">
                  <label className="text-xs font-medium flex items-center gap-2">
                    <span>{COLUMN_LABELS[col.name] || col.name}</span>
                    <span className=" text-[10px] text-muted-foreground">{col.name} : {col.type}</span>
                    {!col.editable && <Badge variant="outline" className="text-[10px]">編集不可</Badge>}
                  </label>
                  {isLong ? (
                    <Textarea
                      value={value}
                      onChange={(e) => setEditFormValues((prev) => ({ ...prev, [col.name]: e.target.value }))}
                      disabled={!col.editable}
                      rows={3}
                      className=" text-xs"
                    />
                  ) : (
                    <Input
                      value={value}
                      onChange={(e) => setEditFormValues((prev) => ({ ...prev, [col.name]: e.target.value }))}
                      disabled={!col.editable}
                      className=" text-xs"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </FormDialog>
  );
}

export function RowDeleteDialog({
  deletingRow, setDeletingRow, selectedTable, deleteMutation, submitDelete,
}: {
  deletingRow: Record<string, unknown> | null;
  setDeletingRow: Dispatch<SetStateAction<Record<string, unknown> | null>>;
  selectedTable: string;
  deleteMutation: { isPending: boolean };
  submitDelete: () => void;
}) {
  // v2.8.0+: 削除確認ダイアログ
  return (
    <FormDialog
      open={!!deletingRow}
      onOpenChange={(open) => { if (!open) setDeletingRow(null); }}
      title="削除の確認"
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={() => setDeletingRow(null)}>
            キャンセル
          </Button>
          <Button variant="destructive" onClick={submitDelete} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
            削除
          </Button>
        </FormDialogFooter>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sub flex items-start gap-2 text-destructive">
          <Trash2 className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          {/* 実装は `deleted_at` に時刻を入れる論理削除。列名も用語も画面には出さない */}<span>この行を <strong className="font-bold">削除</strong> します。各画面から見えなくなりますが、記録は残るので必要なら戻せます。</span>
        </p>
        <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
          <div><span className="text-muted-foreground">テーブル:</span> {TABLE_LABELS[selectedTable] || selectedTable} <span className=" text-[10px]">({selectedTable})</span></div>
          <div><span className="text-muted-foreground">id:</span> <span className="">{deletingRow?.id as string}</span></div>
          {!!(deletingRow?.name || deletingRow?.title) && (
            <div><span className="text-muted-foreground">name:</span> {String(deletingRow?.name || deletingRow?.title)}</div>
          )}
        </div>
      </div>
    </FormDialog>
  );
}
