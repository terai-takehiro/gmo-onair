/**
 * Interactive API キー管理ページ (manager 以上のみ)。
 *
 * 外部システム (表彰CG など) から
 *   GET /api/v1/external/interactive/...
 * を呼ぶ際に必要な X-API-Key を発行/取消できる。
 *
 * 発行直後の 1 回のみ平文キーを画面に表示 (それ以降は prefix のみ)。
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Key, Plus, Trash2, Copy, AlertCircle, Eye, EyeOff } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  scope: string[];
  created_by: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

interface CreatedKey {
  id: string;
  name: string;
  keyPrefix: string;
  secret: string;
  scope: string[];
}

function fmt(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ja-JP', { hour12: false });
  } catch {
    return iso;
  }
}

export default function ApiKeysPage() {
  const { currentUser } = useAuth();
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);
  const [reveal, setReveal] = useState(false);

  const canManage = currentUser?.role === 'system_admin' ||
    ['manager', 'owner'].includes(currentUser?.permissions?.interactive ?? '');

  const keysQuery = useQuery({
    queryKey: ['interactive-api-keys'],
    queryFn: async () => {
      const res = await api.get('/interactive/api-keys');
      return res.data.data as ApiKeyRow[];
    },
    enabled: canManage,
  });

  const createMut = useMutation({
    mutationFn: async (name: string) => {
      const res = await api.post('/interactive/api-keys', { name });
      return res.data.data as CreatedKey;
    },
    onSuccess: (data) => {
      setCreatedKey(data);
      setNewName('');
      setReveal(true);
      qc.invalidateQueries({ queryKey: ['interactive-api-keys'] });
    },
  });

  const revokeMut = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/interactive/api-keys/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['interactive-api-keys'] }),
  });

  if (!canManage) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="rounded-xl border bg-amber-50 p-4 text-sm text-amber-800 flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          API キーを管理するには Interactive の manager 以上の権限が必要です。
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-violet-100 text-violet-700 p-2">
          <Key className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg sm:text-xl font-bold">API キー管理</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            外部システム (表彰CG など) からクイズ/アンケート集計を取得するためのキーを発行します。
          </p>
        </div>
      </div>

      {/* 発行直後のキー表示 */}
      {createdKey && (
        <div className="rounded-2xl border-2 border-violet-400 bg-violet-50 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-violet-900">
            <Key className="h-4 w-4" />
            新しいキーを発行しました: {createdKey.name}
          </div>
          <div className="text-xs text-violet-900">
            この画面を閉じると平文キーは二度と表示されません。安全な場所に保管してください。
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate rounded-lg bg-white px-3 py-2 text-xs font-mono select-all">
              {reveal ? createdKey.secret : '••••••••••••••••••••••••••••••••••••••••'}
            </code>
            <button
              onClick={() => setReveal((v) => !v)}
              className="shrink-0 rounded-lg border px-2 py-2 hover:bg-white"
              title={reveal ? '隠す' : '表示'}
            >
              {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button
              onClick={() => navigator.clipboard.writeText(createdKey.secret)}
              className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-violet-600 text-white px-3 py-2 text-xs hover:bg-violet-700"
            >
              <Copy className="h-3 w-3" />
              コピー
            </button>
          </div>
          <button
            onClick={() => setCreatedKey(null)}
            className="text-xs text-violet-700 hover:underline"
          >
            閉じる
          </button>
        </div>
      )}

      {/* 新規発行フォーム */}
      <div className="rounded-2xl border bg-card p-4">
        <h2 className="text-sm font-semibold mb-3">新しいキーを発行</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim()) createMut.mutate(newName.trim());
          }}
          className="flex flex-col sm:flex-row gap-2"
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="名前 (例: Awards 連携)"
            className="flex-1 rounded-lg border px-3 py-2 text-sm"
            required
            maxLength={200}
          />
          <button
            type="submit"
            disabled={!newName.trim() || createMut.isPending}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-violet-600 text-white px-4 py-2 text-sm hover:bg-violet-700 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            発行
          </button>
        </form>
      </div>

      {/* キー一覧 */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left p-3">名前</th>
              <th className="text-left p-3">Prefix</th>
              <th className="text-left p-3 hidden sm:table-cell">発行</th>
              <th className="text-left p-3 hidden md:table-cell">最終使用</th>
              <th className="text-left p-3">状態</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {keysQuery.isLoading && (
              <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">読み込み中…</td></tr>
            )}
            {keysQuery.data?.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">まだ発行されたキーはありません</td></tr>
            )}
            {keysQuery.data?.map((k) => (
              <tr key={k.id} className="border-t">
                <td className="p-3 font-medium">{k.name}</td>
                <td className="p-3 font-mono text-xs">{k.key_prefix}…</td>
                <td className="p-3 text-xs text-muted-foreground hidden sm:table-cell">{fmt(k.created_at)}</td>
                <td className="p-3 text-xs text-muted-foreground hidden md:table-cell">{fmt(k.last_used_at)}</td>
                <td className="p-3">
                  {k.revoked_at ? (
                    <span className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-[11px]">取消済</span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[11px]">有効</span>
                  )}
                </td>
                <td className="p-3 text-right">
                  {!k.revoked_at && (
                    <button
                      onClick={() => {
                        if (confirm(`キー "${k.name}" を取消します。よろしいですか？`)) {
                          revokeMut.mutate(k.id);
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 text-red-700 px-2 py-1 text-xs hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3" />
                      取消
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl bg-slate-50 border p-3 text-xs text-muted-foreground">
        <div className="font-medium text-foreground mb-1">使い方</div>
        <ol className="list-decimal ml-4 space-y-1">
          <li>上で「発行」したキーをコピー</li>
          <li>表彰CG (Awards) アプリの「イベント設定」→「Interactive 連携」セクションに貼り付け</li>
          <li>連携先 Interactive イベントの ID を入力 → 問題ごとに「選択肢 → ノミネート」のマッピングを設定</li>
          <li>本番中は表彰CG の操作画面右上「Interactive取込」ボタンで結果を反映</li>
        </ol>
      </div>
    </div>
  );
}
