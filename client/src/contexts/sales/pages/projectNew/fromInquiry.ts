/**
 * 「入ってきた情報」から案件を起こす（v4 大②）
 *
 * 日常業務の ⑤ 入ってきた情報 で **案件の受付へ送る** を押すと、
 * `/sales/projects/new?inquiry=<id>` へ来ます。
 *
 * ── なぜ向こうで案件を作らないのか ──────────────────────────
 *
 * 顧客の選択・必須の4項目・権限の判定を持っているのは**この画面だけ**です。
 * 向こうにもう1つ登録画面を作ると、必須が片方だけ増えて食い違います。
 * ここで作り、作れたら向こうに「案件になった」と書き戻します。
 *
 * ── 書き戻しは必須（これが無いと案件が2件できる）────────────
 *
 * 印を付けないと、元の情報は**未仕分けのまま**残ります。受付は毎日その順に
 * 消化する画面なので、翌日また送られて**同じ引き合いから案件が2件**できます。
 * ただし書き戻せなくても案件は出来ているので、**作成そのものは失敗にしません**。
 */
import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { NewProjectValues } from './fields';

export interface InquirySeed {
  id: string;
  summary: string;
  subject: string | null;
  sender: string | null;
  action_needed: string | null;
  body_text: string | null;
  source: string;
  project_id: string | null;
  project_name: string | null;
}

export function useInquirySeed(
  inquiryId: string | null,
  setV: (fn: (f: NewProjectValues) => NewProjectValues) => void,
): InquirySeed | undefined {
  const { data } = useQuery({
    queryKey: ['inquiry-for-new-project', inquiryId],
    queryFn: async () => (await api.get(`/dailyops/inquiries/${inquiryId}`)).data.data as InquirySeed,
    enabled: !!inquiryId,
  });

  // 写すのは**1回だけ**。以後の再取得で人が直した文字を上書きしない
  const filled = useRef(false);
  useEffect(() => {
    if (!data || filled.current) return;
    filled.current = true;
    setV((f) => ({
      ...f,
      // 案件名は件名 → 要約の順。どちらも無ければ空のまま（作り話をしない）
      name: f.name || (data.subject ?? '').replace(/^件名[:：]\s*/, '').trim() || data.summary,
      contact_name: f.contact_name || (data.sender ?? ''),
      goal: f.goal || data.summary,
      // 出どころは**入口の選択肢にある語だけ**移す（`talk` / `slack` は入口には無い）
      intake_channel: f.intake_channel
        || (data.source === 'mail' ? 'mail' : data.source === 'phone' ? 'phone' : ''),
      notes: f.notes || [data.action_needed, data.body_text].filter(Boolean).join('\n\n'),
    }));
  }, [data, setV]);

  return data;
}

/** 案件が出来たら元の情報に印を付ける。**失敗しても案件は残す** */
export async function linkInquiryToProject(inquiryId: string, projectId: string): Promise<void> {
  await api.post(`/dailyops/inquiries/${inquiryId}/link-project`, { project_id: projectId });
}
