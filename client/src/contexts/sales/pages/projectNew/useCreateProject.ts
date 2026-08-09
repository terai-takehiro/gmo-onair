/**
 * 案件作成の3つの決め方（PC のフォームとスマホの段組みで**共通**）
 *
 * ── 上辺の操作は3つだけ ────────────────────────────────────
 *
 *   ネタのまま残す ／ 見送りにする ／ 案件にする（与件化）
 *
 * 「案件にする（与件化）」で **GLS 番号は発番しません。** GLS は受注が固まった
 * 時点で採ります（案件詳細から）。ここで採ると、まだ受注していないものに
 * 正式な番号が並び、番号を見せてから確認する仕掛けを飛ばすことになります。
 *
 * ── 手で入れたときと、レールから選んだときで行き先が違う ────
 *
 * | 決め方 | 手で入れた（新しい行を作る） | ネタ案件を選んだ（もう行がある） | 問い合わせを選んだ |
 * | --- | --- | --- | --- |
 * | ネタのまま残す | `POST /projects`（ネタで作る） | 内容を保存して確認済みにする | 案件は作らずストックへ |
 * | 見送りにする | — （作っていないので何もしない） | ステージを失注に | 問い合わせを見送りに |
 * | 案件にする | `POST /projects`（選んだ段で作る） | 内容を保存してステージを上げる | 案件を作って引き合いに印を付ける |
 *
 * ── なぜ送るところを1つにまとめているか ────────────────────
 *
 * スマホの3段組み（`MobileNewProject`）と PC の1枚もので**送る中身を書き写す**と:
 *
 *   - 列が1つ増えたときに片方だけ送らなくなる（PC で入れた項目が消える）
 *   - 引き合いへの書き戻し（`link-project`）を片方だけ忘れる
 *     → **未仕分けに残って翌日また送られ、同じ引き合いから案件が2件できる**
 *
 * どちらも**気づけない壊れ方**なので、送る所は1つにしてあります。
 * 画面が違うのは**訊く順番**だけです。
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { queryKeys } from '@gmo-onair/shared/src/client/hooks/queryKeys';
import { linkInquiryToProject } from './fromInquiry';
import type { NewProjectValues } from './fields';
import type { IntakeSelection } from './useIntakeSeed';

export function buildProjectBody(v: NewProjectValues): Record<string, unknown> {
  const body: Record<string, unknown> = {
    customer_id: v.customer_id,
    contact_name: v.contact_name.trim() || null,
    name: v.name.trim(),
    // **2段だけ送る。** 旧 `project_type` はサーバーがこの2つから導く
    // （両方送ると片方だけ更新された行ができる。`project-classification.ts`）
    audience: v.audience || null,
    project_category: v.project_category || null,
    gls_category: v.gls_category,
    recurrence: v.recurrence,
    stage: v.stage,
    assigned_to: v.assigned_to,
    // 無観客のときは欄を出していないので空。サーバー側でも落とす
    attendee_count: v.attendee_count ? Number(v.attendee_count) : null,
    goal: v.goal.trim() || null,
    expected_amount: v.expected_amount ? Number(v.expected_amount) : 0,
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

export interface ProjectDecisions {
  /** 案件にする（与件化）。GLS は発番しない */
  promote: () => void;
  /** ネタのまま残す */
  keep: () => void;
  /** 見送りにする。手で入れているときは押せない（`canDrop` が false） */
  drop: () => void;
  canDrop: boolean;
  busy: boolean;
}

export function useProjectDecisions(
  v: NewProjectValues,
  selection: IntakeSelection | null,
  /** 日常業務の「入ってきた情報」から `?inquiry=` で来たとき */
  urlInquiryId: string | null,
): ProjectDecisions {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const existingId = selection?.project?.id ?? null;
  const inquiryId = selection?.inquiry?.id ?? urlInquiryId;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['projects'] });
    qc.invalidateQueries({ queryKey: ['dashboard', 'sales-overview'] });
    qc.invalidateQueries({ queryKey: queryKeys.dashboard.inbox() });
  };

  /** 新しく作って、引き合いがあれば印を付けて、その案件を開く */
  const createNew = async (stage: string) => {
    const row = (await api.post('/projects', { ...buildProjectBody(v), stage })).data.data as { id: string };
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
    return row.id;
  };

  /** もうある行を、いまフォームに入っている内容で上書きしてからステージを動かす */
  const saveExisting = async (id: string, stage: string) => {
    await api.put(`/projects/${id}`, buildProjectBody(v));
    if (selection?.project && selection.project.stage !== stage) {
      await api.patch(`/projects/${id}/stage`, stage === 'e_lost'
        ? { stage, lost_reason: 'other', lost_reason_note: '案件作成で見送り' }
        : { stage });
    }
    return id;
  };

  const promote = useMutation({
    mutationFn: async () => {
      // ネタのままでは「案件にした」ことにならないので、
      // ステージがネタのときだけ仮押さえまで上げる
      const stage = v.stage === 'neta' ? 'd_hold' : v.stage;
      return existingId ? saveExisting(existingId, stage) : createNew(stage);
    },
    onSuccess: (id) => {
      invalidate();
      notifySuccess('案件にしました', {
        description: 'GLS 番号は受注が固まってから発番します。',
      });
      navigate(`/sales/projects/${id}`);
    },
    onError: (e) => notifyApiError('案件にできませんでした', e),
  });

  const keep = useMutation({
    mutationFn: async () => {
      if (existingId) {
        await saveExisting(existingId, 'neta');
        // **AI が起こしたものは「確認済み」にする。** 印を付けないと、
        // 明日もレールの先頭に出続けて、同じものを何度も読むことになる
        await api.post(`/projects/${existingId}/ai-review`).catch(() => undefined);
        return existingId;
      }
      if (selection?.inquiry) {
        // 問い合わせは案件にせず、あとで見るところ（ストック）へ移す
        await api.post(`/dailyops/inquiries/${selection.inquiry.id}/state`, { state: 'stock' });
        return null;
      }
      return createNew('neta');
    },
    onSuccess: (id) => {
      invalidate();
      notifySuccess('ネタのまま残しました');
      if (id) navigate(`/sales/projects/${id}`);
    },
    onError: (e) => notifyApiError('残せませんでした', e),
  });

  const drop = useMutation({
    mutationFn: async () => {
      if (existingId) {
        await api.patch(`/projects/${existingId}/stage`, {
          stage: 'e_lost', lost_reason: 'other', lost_reason_note: '案件作成で見送り',
        });
        return;
      }
      if (selection?.inquiry) {
        await api.post(`/dailyops/inquiries/${selection.inquiry.id}/state`, { state: 'dropped' });
      }
    },
    onSuccess: () => {
      invalidate();
      notifySuccess('見送りにしました');
      navigate('/sales/dashboard');
    },
    onError: (e) => notifyApiError('見送りにできませんでした', e),
  });

  return {
    promote: () => promote.mutate(),
    keep: () => keep.mutate(),
    drop: () => drop.mutate(),
    // **手で入れているときは押せない。** まだ何も無いものを見送りにはできない
    // （押せるように見せると「登録せずに閉じる」と誤解される）
    canDrop: !!existingId || !!selection?.inquiry,
    busy: promote.isPending || keep.isPending || drop.isPending,
  };
}
