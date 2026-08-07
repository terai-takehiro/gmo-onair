/**
 * 案件をつくる（PC のフォームとスマホの段組みで**共通**）
 *
 * ── なぜ切り出したか ────────────────────────────────────────
 *
 * スマホの ④「受付／案件の種類をきめる」を作るにあたって、
 * **送る中身を書き写す**選択肢がありました。写すと:
 *
 *   - 列が1つ増えたときに片方だけ送らなくなる（PC で入れた項目が消える）
 *   - 引き合いへの書き戻し（`link-project`）を片方だけ忘れる
 *     → **未仕分けに残って翌日また送られ、同じ引き合いから案件が2件できる**
 *
 * どちらも**気づけない壊れ方**なので、送る所は1つにしました。
 * 画面が違うのは**訊く順番**だけで、`POST /projects` に渡す形は同じです。
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { linkInquiryToProject } from './fromInquiry';
import type { NewProjectValues } from './fields';

export function buildProjectBody(v: NewProjectValues): Record<string, unknown> {
  const body: Record<string, unknown> = {
    customer_id: v.customer_id,
    contact_name: v.contact_name.trim() || null,
    name: v.name.trim(),
    project_type: v.project_type,
    gls_category: v.gls_category,
    recurrence: v.recurrence,
    stage: v.stage,
    assigned_to: v.assigned_to,
    attendee_count: v.attendee_count ? Number(v.attendee_count) : null,
    goal: v.goal.trim() || null,
    expected_amount: v.expected_amount ? Number(v.expected_amount) : 0,
    reply_due: v.reply_due || null,
    wants: v.wants.trim() || null,
    intake_channel: v.intake_channel || undefined,
    notes: v.notes.trim() || null,
  };
  // 実施日は**複数日**を持てる（飛び日）。1日でも同じ形で送る
  if (v.dates.length > 0) body.dates = v.dates.map((d) => ({ date: d }));
  if (v.first_task_title.trim()) {
    body.first_task = {
      title: v.first_task_title.trim(),
      assigned_to: v.assigned_to,
      due_date: v.first_task_due || null,
    };
  }
  return body;
}

export function useCreateProject(v: NewProjectValues, inquiryId: string | null) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () =>
      (await api.post('/projects', buildProjectBody(v))).data.data as { id: string; code: string },
    onSuccess: async (row) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['dashboard', 'sales-overview'] });
      // 元の情報に「案件になった」と書き戻す。**これが無いと未仕分けに残り、
      // 翌日また送られて同じ引き合いから案件が2件できる**。
      // 書き戻せなくても案件は出来ているので、**作成そのものは失敗にしない**
      if (inquiryId) {
        try {
          await linkInquiryToProject(inquiryId, row.id);
        } catch (e) {
          notifyApiError('案件はつくれましたが、元の情報に印を付けられませんでした', e);
        }
      }
      notifySuccess('案件をつくりました', {
        description: v.first_task_title.trim()
          ? '最初のタスクも入れました。'
          : 'タスクは案件詳細から足せます。',
      });
      navigate(`/sales/projects/${row.id}`);
    },
    onError: (e) => notifyApiError('案件をつくれませんでした', e),
  });
}
