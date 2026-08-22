import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { FormDialog } from "@gmo-onair/shared/src/client-v4/formDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Check, X, Users, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { confirmAction } from "@gmo-onair/shared/src/client/ui/confirm";
import { notifyApiError, notifySuccess } from "@gmo-onair/shared/src/client/notify";

export interface CustomColumn {
  id: string;
  name: string;
  col_type: 'text' | 'checkbox' | 'number';
  scope: 'personal' | 'shared';
  created_by: string | null;
  sort_order: number;
}

const COL_TYPE_LABELS: Record<string, string> = {
  text: 'テキスト',
  checkbox: 'チェックボックス',
  number: '数値',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CustomColumnDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const { currentUser } = useAuth();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [form, setForm] = useState({ name: '', col_type: 'text', scope: 'personal' });
  const [editForm, setEditForm] = useState({ name: '', col_type: 'text', scope: 'personal' });

  const { data: columns = [] } = useQuery<CustomColumn[]>({
    queryKey: ['equipment-custom-columns'],
    queryFn: async () => (await api.get('/equipment/custom-columns')).data.data,
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => api.post('/equipment/custom-columns', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipment-custom-columns'] });
      setForm({ name: '', col_type: 'text', scope: 'personal' });
      setAddMode(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof editForm }) =>
      api.put(`/equipment/custom-columns/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipment-custom-columns'] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/equipment/custom-columns/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipment-custom-columns'] });
      qc.invalidateQueries({ queryKey: ['equipment-custom-values'] });
      notifySuccess('列を消しました');
    },
    onError: (e) => notifyApiError('列を消せませんでした', e),
  });

  /**
   * 列を消すと**その列に入っている値も全部消えます**。
   * ブラウザ標準の `confirm()` では何がいっしょに消えるかを書けないので、
   * 共通の確認ダイアログに置き換えました。
   */
  const askDelete = async (col: CustomColumn) => {
    const ok = await confirmAction({
      title: `列「${col.name}」を消しますか`,
      description: col.scope === 'shared'
        ? 'この列に入れた値が全機材ぶん消えます。共有列なので全員の画面から消えます。取り消せません。'
        : 'この列に入れた値が全機材ぶん消えます。取り消せません。',
      confirmLabel: '消す',
      tone: 'danger',
    });
    if (ok) deleteMutation.mutate(col.id);
  };

  const startEdit = (col: CustomColumn) => {
    setEditForm({ name: col.name, col_type: col.col_type, scope: col.scope });
    setEditingId(col.id);
    setAddMode(false);
  };

  const canEdit = (col: CustomColumn) =>
    col.created_by === currentUser?.id || currentUser?.role === 'system_admin';

  const sharedCols = columns.filter(c => c.scope === 'shared');
  const personalCols = columns.filter(c => c.scope === 'personal');

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="カスタム列の管理">
        <div className="space-y-4 mt-2">
          {/* Shared columns */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Users className="h-3.5 w-3.5 text-blue-600" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">共有列（全員表示）</span>
            </div>
            {sharedCols.length === 0 && (
              <p className="text-xs text-muted-foreground px-1">共有列はありません</p>
            )}
            {sharedCols.map(col => (
              <ColRow
                key={col.id}
                col={col}
                isEditing={editingId === col.id}
                editForm={editForm}
                setEditForm={setEditForm}
                canEdit={canEdit(col)}
                onEdit={() => startEdit(col)}
                onSave={() => updateMutation.mutate({ id: col.id, data: editForm })}
                onCancel={() => setEditingId(null)}
                onDelete={() => askDelete(col)}
              />
            ))}
          </div>

          {/* Personal columns */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <User className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">個人列（自分のみ表示）</span>
            </div>
            {personalCols.length === 0 && (
              <p className="text-xs text-muted-foreground px-1">個人列はありません</p>
            )}
            {personalCols.map(col => (
              <ColRow
                key={col.id}
                col={col}
                isEditing={editingId === col.id}
                editForm={editForm}
                setEditForm={setEditForm}
                canEdit={canEdit(col)}
                onEdit={() => startEdit(col)}
                onSave={() => updateMutation.mutate({ id: col.id, data: editForm })}
                onCancel={() => setEditingId(null)}
                onDelete={() => askDelete(col)}
              />
            ))}
          </div>

          {/* Add new */}
          {addMode ? (
            <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
              <p className="text-sm font-medium">新しい列を追加</p>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">列名</Label>
                  <Input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="例: 管理メモ"
                    className="h-8 text-sm mt-1"
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">タイプ</Label>
                    <Select value={form.col_type} onValueChange={v => setForm(f => ({ ...f, col_type: v }))}>
                      <SelectTrigger className="h-8 text-sm mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">テキスト</SelectItem>
                        <SelectItem value="checkbox">チェックボックス</SelectItem>
                        <SelectItem value="number">数値</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">スコープ</Label>
                    <Select value={form.scope} onValueChange={v => setForm(f => ({ ...f, scope: v }))}>
                      <SelectTrigger className="h-8 text-sm mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="personal">個人</SelectItem>
                        <SelectItem value="shared">共有</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={() => { setAddMode(false); setForm({ name: '', col_type: 'text', scope: 'personal' }); }}>
                  <X className="h-3.5 w-3.5 mr-1" />キャンセル
                </Button>
                <Button
                  size="sm"
                  disabled={!form.name.trim() || createMutation.isPending}
                  onClick={() => createMutation.mutate(form)}
                >
                  <Check className="h-3.5 w-3.5 mr-1" />追加
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => { setAddMode(true); setEditingId(null); }}
            >
              <Plus className="h-4 w-4 mr-1" />列を追加
            </Button>
          )}
        </div>

        {/* Legend */}
        <div className="mt-4 pt-3 border-t text-xs text-muted-foreground space-y-1">
          <p className="flex items-center gap-1"><Users className="h-3 w-3 text-blue-500" />共有列: 機材一覧と機材詳細ページに表示されます</p>
          <p className="flex items-center gap-1"><User className="h-3 w-3 text-slate-400" />個人列: 機材一覧のみ、自分だけに表示されます</p>
        </div>
    </FormDialog>
  );
}

interface ColRowProps {
  col: CustomColumn;
  isEditing: boolean;
  editForm: { name: string; col_type: string; scope: string };
  setEditForm: React.Dispatch<React.SetStateAction<{ name: string; col_type: string; scope: string }>>;
  canEdit: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}

function ColRow({ col, isEditing, editForm, setEditForm, canEdit, onEdit, onSave, onCancel, onDelete }: ColRowProps) {
  if (isEditing) {
    return (
      <div className="border rounded-lg p-2.5 space-y-2 mb-1.5 bg-muted/20">
        <div className="grid grid-cols-[1fr,auto,auto] gap-2 items-center">
          <Input
            value={editForm.name}
            onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
            className="h-7 text-sm"
            autoFocus
          />
          <Select value={editForm.col_type} onValueChange={v => setEditForm(f => ({ ...f, col_type: v }))}>
            <SelectTrigger className="h-7 text-xs w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">テキスト</SelectItem>
              <SelectItem value="checkbox">チェック</SelectItem>
              <SelectItem value="number">数値</SelectItem>
            </SelectContent>
          </Select>
          <Select value={editForm.scope} onValueChange={v => setEditForm(f => ({ ...f, scope: v }))}>
            <SelectTrigger className="h-7 text-xs w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="personal">個人</SelectItem>
              <SelectItem value="shared">共有</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onCancel}>
            <X className="h-3 w-3 mr-0.5" />キャンセル
          </Button>
          <Button size="sm" className="h-6 px-2 text-xs" onClick={onSave} disabled={!editForm.name.trim()}>
            <Check className="h-3 w-3 mr-0.5" />保存
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/40 group mb-1">
      <span className="flex-1 text-sm font-medium truncate">{col.name}</span>
      <span className="text-xs text-muted-foreground shrink-0">{COL_TYPE_LABELS[col.col_type] ?? col.col_type}</span>
      {canEdit && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDelete} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
