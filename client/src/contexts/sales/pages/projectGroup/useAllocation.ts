/**
 * 按分プレビュー（均等按分／任意比率） (v4)
 *
 * 仕入ダイアログ・売上ダイアログの両方が持っていた同じロジック（コピー2つ）を
 * 1つの hook にまとめた。**式が2か所に分かれていると、片方だけ直したときに
 * 均等按分の端数処理（先頭の案件に寄せる）が食い違う**ため。
 *
 * **初期値は直す行の按分から決める。** 均等に割れていれば「均等按分」、
 * そうでなければ「任意比率」で開く（`RevenueDialog.tsx` と同じ「マウントに任せる」
 * 作り — 呼ぶ側は `{open && <PurchaseDialog key={…} />}` で描くので、
 * 開くたびに初期化し直され、消し忘れの前の値が残らない）
 */
import { useMemo, useState } from 'react';
import type { GroupMember } from './types';

export interface AllocationPreviewItem {
  project_id: string;
  gls_number: string;
  name: string;
  allocated_amount: number;
}

function initialModeAndCustom(
  initial: { project_id: string; allocated_amount: number }[] | undefined,
  amount: number,
): { mode: 'equal' | 'custom'; custom: Record<string, number> } {
  if (!initial || initial.length === 0) return { mode: 'equal', custom: {} };
  const per = amount / initial.length;
  const allEqual = initial.every((a) => Math.abs(a.allocated_amount - per) <= 1);
  if (allEqual) return { mode: 'equal', custom: {} };
  const custom: Record<string, number> = {};
  initial.forEach((a) => { custom[a.project_id] = a.allocated_amount; });
  return { mode: 'custom', custom };
}

export function useAllocation(
  members: GroupMember[],
  total: number,
  initialAllocations?: { project_id: string; allocated_amount: number }[],
) {
  // **`useState` の遅延初期化子。** 呼ばれるのはマウント時の1回だけなので、
  // ここで直す行の按分を読んでも以後の再描画で計算し直されない
  const [mode, setMode] = useState<'equal' | 'custom'>(() => initialModeAndCustom(initialAllocations, total).mode);
  const [custom, setCustom] = useState<Record<string, number>>(() => initialModeAndCustom(initialAllocations, total).custom);

  const preview: AllocationPreviewItem[] = useMemo(() => {
    if (members.length === 0 || !total) return [];
    if (mode === 'equal') {
      // **端数は先頭の案件に寄せる。** 3人で1,000円を割ると333/333/334になるが、
      // 誰か1人に端数が乗ることは避けられない。「先頭」で固定すれば毎回同じ結果になる
      const per = Math.floor(total / members.length);
      const remainder = total - per * members.length;
      return members.map((m, idx) => ({
        project_id: m.id, gls_number: m.gls_number, name: m.name,
        allocated_amount: per + (idx === 0 ? remainder : 0),
      }));
    }
    return members.map((m) => ({
      project_id: m.id, gls_number: m.gls_number, name: m.name,
      allocated_amount: custom[m.id] || 0,
    }));
  }, [members, total, mode, custom]);

  const previewTotal = preview.reduce((s, a) => s + a.allocated_amount, 0);

  return {
    mode, setMode, custom, setCustom, preview, previewTotal,
    /** サーバーへ送る形（プレビューから表示用の項目名を落とす） */
    toPayload: () => preview.map((a) => ({ project_id: a.project_id, allocated_amount: a.allocated_amount })),
  };
}
