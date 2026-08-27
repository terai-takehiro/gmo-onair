/**
 * 持ち帰り→タスクにするときの担当者ピッカー（Phase 2 ⑥）
 *
 * **案件（タスク行き）のときだけ出す** — GPM の未確認事項は「相手の判断待ち」を
 * 数える台で担当という概念が無く、サーバーの口（/open-items/:index/ask）も受けない。
 * 選ばずに「タスクにする」を押せば従来どおり未割当で入る（サーバーは
 * assigned_to を渡さなければ何も書かない）。
 *
 * 利用者の一覧は既存の共通鍵（users-by-module-sales）を使い回す —
 * 写しの一覧を作ると、出す人の範囲が画面ごとにずれる。
 */
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export function OpenItemAssignee({ value, onChange, disabled }: {
  value: string;
  onChange: (userId: string) => void;
  disabled?: boolean;
}) {
  const users = useQuery({
    queryKey: ['users-by-module-sales'],
    queryFn: async () =>
      (await api.get('/users/by-module/sales')).data.data as Array<{ id: string; name: string }>,
  });
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label="タスクの担当者"
      className="min-h-tap rounded-control text-sub max-w-[160px] border border-border bg-background px-2 lg:min-h-[32px]"
    >
      <option value="">担当を選ばない</option>
      {(users.data ?? []).map((u) => (
        <option key={u.id} value={u.id}>{u.name}</option>
      ))}
    </select>
  );
}
