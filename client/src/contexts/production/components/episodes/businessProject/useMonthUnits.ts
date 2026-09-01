/**
 * GPM の請求タブ — 月次ユニット（エピソードを「月」として流用した月締め請求の単位）（段15）
 *
 * ⚠️ **`BusinessProjectView.tsx` から切り出したもので、中身は1文字も変えていません。**
 *
 * ⚠️ **`openEdit` / `openNewForMonth` を引数で受け取る。** 月を作った直後に
 * 売上ダイアログを開くため、`useRevenueForm` の返り値が要る。
 * **この hook を `useRevenueForm` より先に呼ぶと、初期化前の参照になります**
 * （`addMonthMutation.onSuccess` が閉じ込めた `openEdit` を呼ぶ）。
 *
 * ⚠️ **月の削除は、紐づく売上・仕入が1件でもあれば止める。** 先に消させないと、
 * どこにも出ない売上（月ユニットが無い `episode_id`）が残ります。
 */
import { useState } from 'react';
import { useQuery, useMutation, type QueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { Revenue } from './types';

export function useMonthUnits({
  projectId, monthlyMode, revenues, purchases, openEdit, openNewForMonth, qc,
}: {
  projectId: string;
  monthlyMode: boolean;
  revenues: Revenue[];
  purchases: any[];
  openEdit: (rev: Revenue) => void;
  openNewForMonth: (epId: string, monthTitle: string, recMonth?: string) => void;
  qc: QueryClient;
}) {
  // 月次ユニット (ビジネス案件の月締め請求単位) — 売上をエピソード(月)に紐づける
  const [newMonth, setNewMonth] = useState(""); // YYYY-MM (月を追加ピッカー)

  // 月次ユニット (エピソードを「月」として流用) の一覧
  const { data: episodesData } = useQuery({
    queryKey: ["episodes-months", projectId],
    queryFn: async () =>
      (await api.get(`/projects/${projectId}/episodes`, { params: { limit: 200 } })).data,
    enabled: monthlyMode,
  });
  const monthEpisodes: Array<{ id: string; episode_code: string; episode_number: number; title: string | null }> =
    episodesData?.data ?? [];

  // 月ユニット作成 → その月の売上明細入力ダイアログを開く
  const addMonthMutation = useMutation({
    mutationFn: async (ym: string) =>
      (await api.post(`/projects/${projectId}/episodes/month`, { year_month: ym })).data,
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["episodes-months", projectId] });
      setNewMonth("");
      const ep = res.data;
      // 既にその月の売上があればそれを編集、無ければ新規で開く
      const existingRev = revenues.find((r) => (r as any).episode_id === ep.id);
      if (existingRev) openEdit(existingRev);
      else {
        const mm2 = String(ep.episode_code || "").match(/-(\d{2})(\d{2})$/);
        openNewForMonth(ep.id, ep.title || "", mm2 ? `20${mm2[1]}-${mm2[2]}` : undefined);
      }
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.error?.message || err?.message || "月ユニットの作成に失敗しました";
      alert(`月の追加に失敗しました: ${msg}`);
    },
  });

  // 月ユニット削除 (紐づく売上/仕入が残っている場合は先に削除を促す)
  const deleteMonthMutation = useMutation({
    mutationFn: async (epId: string) =>
      (await api.delete(`/projects/${projectId}/episodes/${epId}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["episodes-months", projectId] });
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.error?.message || err?.message || "削除に失敗しました";
      alert(`月ユニットの削除に失敗しました: ${msg}`);
    },
  });

  const handleDeleteMonth = (ep: { id: string; episode_code: string }) => {
    const linkedRevs = revenues.filter((r) => (r as any).episode_id === ep.id).length;
    const linkedPurs = purchases.filter((p) => (p as any).episode_id === ep.id).length;
    if (linkedRevs > 0 || linkedPurs > 0) {
      alert(
        `${ep.episode_code} には売上 ${linkedRevs} 件 / 仕入 ${linkedPurs} 件が紐づいています。\n先にそれらを削除（または編集で紐づけを変更）してから月を削除してください。`,
      );
      return;
    }
    if (!confirm(`${ep.episode_code} を削除しますか？`)) return;
    deleteMonthMutation.mutate(ep.id);
  };

  return { newMonth, setNewMonth, monthEpisodes, addMonthMutation, handleDeleteMonth };
}
