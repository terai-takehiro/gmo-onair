import { useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

// 共同編集 (collab) 有効時でも別経路で列に反映する「メタ列」だけの集合。
// **`data`（台本本体）は絶対に含めないこと** — data は Yjs 経由 (collab.ts) だけが書く。
export interface DocMetaColumns {
  title: string;
  status: string;
  broadcast_date: string | null;
  episode_id: string | null;
  episode_code: string | null;
}

interface UseCollabMetaSyncArgs {
  collabEnabled: boolean;
  docId: string | undefined;
  /** 現在のメタ列の値。ドキュメント未読込みなら null */
  meta: DocMetaColumns | null;
  /** サーバーへの反映が成功したときに呼ばれる (楽観ロック用の updated_at を渡す) */
  onSynced: (updatedAt: string) => void;
}

/**
 * collab (Yjs) 有効時は `PUT /qsheet/documents/:id` が一度も飛ばないため、
 * `qsheet_documents` の `title` / `status` / `broadcast_date` / `episode_id` / `episode_code`
 * という**メタ列だけ**が更新されなくなる不具合の直し
 * (段5 PR11・docs/design/v4/qsheet-v4-coding/impl/05-editor-impl.md §3-3 ★追加(重大))。
 *
 * 台本の内容 (`data` 列・JSONB) は Yjs 経由でこれまでどおり保存される。
 * このフックが呼ぶ `PATCH /documents/:id/meta` は **`data` 列に一切触れない別のUPDATE文**
 * (サーバー側: `server/src/contexts/qsheet/routes/documents.routes.ts`)。
 *
 * 値が変わってから 2 秒 (通常の自動保存と同じ間隔) デバウンスして PATCH する。
 * 初回呼び出し (ドキュメントを開いた直後・切り替えた直後) は基準値を記録するだけで送らない。
 */
export function useCollabMetaSync({ collabEnabled, docId, meta, onSynced }: UseCollabMetaSyncArgs) {
  const queryClient = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const lastSynced = useRef<(DocMetaColumns & { docId: string }) | null>(null);

  const mutation = useMutation({
    mutationFn: async (payload: { id: string; meta: DocMetaColumns }) => {
      const res = await api.patch(`/qsheet/documents/${payload.id}/meta`, payload.meta);
      return res.data.data as { updated_at: string };
    },
    onSuccess: (saved) => {
      if (saved?.updated_at) onSynced(saved.updated_at);
      queryClient.invalidateQueries({ queryKey: ["qsheet-documents"] });
    },
    // メタ列の反映に失敗しても台本本体の保存 (Yjs) には影響しない。次の変更で再送されるので
    // ここではサイレントに留める (collab の保存ステータス表示を汚さない)。
  });

  useEffect(() => {
    if (!collabEnabled || !docId || !meta) return;
    const prev = lastSynced.current;
    // 初回、またはドキュメントが切り替わった直後はサーバーの値と一致しているはずなので、
    // 基準値として記録するだけで送らない (無駄な PATCH を出さない)。
    if (prev === null || prev.docId !== docId) {
      lastSynced.current = { ...meta, docId };
      return;
    }
    const changed =
      prev.title !== meta.title ||
      prev.status !== meta.status ||
      prev.broadcast_date !== meta.broadcast_date ||
      prev.episode_id !== meta.episode_id ||
      prev.episode_code !== meta.episode_code;
    if (!changed) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      lastSynced.current = { ...meta, docId };
      mutation.mutate({ id: docId, meta });
    }, 2000);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collabEnabled, docId, meta?.title, meta?.status, meta?.broadcast_date, meta?.episode_id, meta?.episode_code]);
}
