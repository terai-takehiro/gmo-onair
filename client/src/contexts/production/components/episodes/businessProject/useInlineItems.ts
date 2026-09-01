/**
 * GPM の請求タブ — 売上明細カード上の「明細項目インライン編集」（段11）
 *
 * ⚠️ **`BusinessProjectView.tsx` から切り出したもので、中身は1文字も変えていません。**
 *
 * ⚠️ **保存は `items` だけを差し替える形にしてある。** 税区分・計上日・請求日・支払期日・
 * 備考は**読み込んだ売上の値をそのまま送り返す**（PUT が全項目を要求するため）。
 * ここを「送らなくても消えないだろう」と間引くと、**日付が NULL に落ちます**。
 *
 * ⚠️ 金額は数量・単価が変わったときだけ計算し直す。行を消したときには触らない
 * （行が消えれば合計は保存時に `cleanedItems` から算出される）。
 */
import { useState } from 'react';
import { useMutation, type QueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { Project } from '@/types';
import type { Revenue, RevenueItem } from './types';

export function useInlineItems({
  projectId, project, revenues, qc,
}: {
  projectId: string;
  project: Project;
  revenues: Revenue[];
  qc: QueryClient;
}) {
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineItems, setInlineItems] = useState<RevenueItem[]>([]);

  // v2.8.104+: 売上明細項目のインライン保存 (ダイアログを開かずに items のみ更新)
  const inlineSaveMutation = useMutation({
    mutationFn: async ({ id, items }: { id: string; items: RevenueItem[] }) => {
      const rev = revenues.find((r) => r.id === id);
      if (!rev) throw new Error("revenue not found");
      const cleanedItems = items.filter((it) => it.description);
      const totalAmount = cleanedItems.reduce((s, it) => s + (it.amount || 0), 0);
      return (
        await api.put(`/revenues/${id}`, {
          project_id: projectId,
          customer_id: project?.customer_id,
          tax_category: rev.tax_category,
          amount: totalAmount,
          recognition_date: rev.recognition_date,
          billing_date: rev.billing_date,
          payment_due_date: rev.payment_due_date,
          notes: rev.notes,
          subtitle: rev.subtitle,
          items: cleanedItems,
        })
      ).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["revenues-project", projectId] });
      qc.invalidateQueries({ queryKey: ["project-summary", projectId] });
      qc.invalidateQueries({ queryKey: ["revenues-all"] });
      setInlineEditId(null);
      setInlineItems([]);
    },
  });

  const startInlineEdit = (rev: Revenue) => {
    setInlineEditId(rev.id);
    // 既存 items を deep copy。空ならテンプレ 1 行を提示。
    const seed: RevenueItem[] =
      rev.items && rev.items.length > 0
        ? rev.items.map((it) => ({ ...it }))
        : [{ description: "", quantity: 1, unit_price: 0, amount: 0 }];
    setInlineItems(seed);
  };
  const cancelInlineEdit = () => {
    setInlineEditId(null);
    setInlineItems([]);
  };
  const updateInlineItem = (idx: number, field: keyof RevenueItem, value: string | number) => {
    setInlineItems((prev) => {
      const next = [...prev];
      const it = { ...next[idx], [field]: value };
      // 数量・単価変更時は金額を再計算
      if (field === "quantity" || field === "unit_price") {
        const q = field === "quantity" ? Number(value) : it.quantity;
        const u = field === "unit_price" ? Number(value) : it.unit_price;
        it.amount = (q || 0) * (u || 0);
      }
      next[idx] = it;
      return next;
    });
  };
  const addInlineItem = () => {
    setInlineItems((prev) => [...prev, { description: "", quantity: 1, unit_price: 0, amount: 0 }]);
  };
  const removeInlineItem = (idx: number) => {
    setInlineItems((prev) => prev.filter((_, i) => i !== idx));
  };

  return {
    inlineEditId, inlineItems, inlineSaveMutation,
    startInlineEdit, cancelInlineEdit, updateInlineItem, addInlineItem, removeInlineItem,
  };
}
