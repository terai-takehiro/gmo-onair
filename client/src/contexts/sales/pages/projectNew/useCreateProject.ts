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
import { invalidateProjectQueries } from '../../projectQueries';
import { DISMISS_LOST_REASON } from '../inbox/useInboxActions';
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
    // レギュラー案件が持つ取り決め（migration 262・264）。単発案件では空のまま
    // 送るのでサーバー側で NULL に落ちる（`RegularSeriesFields` は regular のときだけ出す）。
    // ⚠️ `recording_per_day_count`/`episode_unit_price` はここで送らない
    // （仕様変更 #16・migration 269 で案件全体の固定入力欄を廃止したため。
    // 新規作成では NULL のまま、既存案件の更新では「渡さなければ今の値を保つ」の
    // 規則でサーバーが既存値をそのまま残す — どちらの経路でもこの画面からは動かない）
    recording_cadence: v.recording_cadence || null,
    fixed_studio_note: v.fixed_studio_note.trim() || null,
    billing_cycle: v.billing_cycle,
    broadcast_offset_days: v.broadcast_offset_days ? Number(v.broadcast_offset_days) : null,
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
  /**
   * 見送ったあとに呼ぶ。**画面は移動せず、選択を外すだけ**（レビューでの指摘）。
   * 以前は `navigate('/sales/dashboard')` していたが、レールに並んだ引き合いを
   * 上から順に見送っていく作業（1件見送る→次を見送る…）のたびに画面が飛び、
   * 都度レールへ戻る手間になっていた。呼び出し元（`useNewProjectForm`）が
   * 選択を外す（`setSelected(null)`）ことで、この画面のままレールの続きを選べる
   */
  onDropped: () => void,
): ProjectDecisions {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const existingId = selection?.project?.id ?? null;
  const inquiryId = selection?.inquiry?.id ?? urlInquiryId;

  /**
   * 書いたあとに落とす鍵。
   *
   * ⚠️ **鍵を並べず `invalidateProjectQueries`（`../../projectQueries`）を呼ぶこと。**
   * 以前はここで `['projects']`・`['dashboard','sales-overview']`・
   * `['project', id]` の3つ（＋受信箱）だけを手書きしていた。**案件を書き換える
   * 画面が10以上、それぞれ別の鍵で同じ案件を持っている**（案件台帳
   * `project-ledger`・仕入の候補 `won-projects-for-purchase`・見積の回
   * `episodes` など）。この画面（受付レールから既存の「ネタ」案件を選んで
   * 案件分類・継続区分を直し「案件にする」「ネタのまま残す」で保存する経路）
   * だけが一元化された鍵の一覧を使わず、`project-ledger` をはじめ大半を
   * 落とし忘れていた — 保存した直後に案件台帳を開いても react-query の
   * `staleTime`（既定60秒）の間は古いまま表示され、**画面を再読み込みして
   * 初めて反映される**という、v4.5.20 で直したはずの症状の再発だった
   * （鍵を並べる形に戻すと、この足し忘れがまた起きる）。
   *
   * `queryKeys.dashboard.inbox()` は一元化リストに無い（レールの受付カード用）
   * ので、ここだけ個別に残す。
   *
   * レールからネタ案件を選ぶと、`useIntakeSeed` が**保存前の姿**を
   * `['project', <id>]` に載せる（詳細画面・直す画面と**同じ鍵**）。
   * ここで落とさないと、`staleTime` のあいだ詳細画面はその古い姿を
   * そのまま出す — **入れたばかりの案件分類・客入れの有無・ステージが
   * 画面に出ない**（「案件にしました」と出ているのに、分類は「その他」のまま）。
   * 押した人には保存できなかったようにしか見えず、しかも読み込み直すと
   * 直っているので**再現しないバグ**として扱われる。
   */
  const invalidate = (projectId?: string | null) => {
    invalidateProjectQueries(qc, projectId);
    qc.invalidateQueries({ queryKey: queryKeys.dashboard.inbox() });
  };

  /** 新しく作って、引き合いがあれば印を付けて、その案件を開く */
  const createNew = async (stage: string) => {
    /*
     * ⚠️ **同じ引き合いから2件作らせない**（レビューでの指摘 #62）。
     * ボタンの `disabled` は描き直しが1回入ってから効くので、
     * **同じ瞬間に2回押すと2回とも通ります**（スマホでは通信が返るまで
     * 無反応に見えるので、二度押しが普通に起きます）。
     * 鍵を渡すとサーバー（DB の一意索引）が2件目を止め、**先に出来たほうを返します**。
     */
    const row = (await api.post('/projects', {
      ...buildProjectBody(v),
      stage,
      ...(inquiryId ? { idempotency_key: `inquiry:${inquiryId}:project` } : {}),
    })).data.data as { id: string };
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

  /**
   * もうある行を、いまフォームに入っている内容で上書きしてからステージを動かす。
   *
   * ⚠️ **どの道を通っても「確認しました」の印が残ること。** 印が残らないと、
   * 決めたのにカードが受付に並び続けます（v4.1.2 までの壊れ方）。
   *
   *  ・**段が動くとき** … サーバーが押します（`markAiReviewedByStageDecision`）。
   *    段を動かすのは中身を読まないとできない操作なので、そこを印にしています。
   *    ⚠️ **ここから `/ai-review` を足さないこと** — 見送りまで「無修正で採用」に
   *    数えられ、拾いすぎの指標が消えます
   *  ・**段が動かないとき** … ここで押します。「**ネタのまま残す**」は
   *    ネタをネタのままにする操作なので**段が1つも動かず**、サーバー側の印も
   *    押されません。ここで押さないと、読んで残すと決めたものが
   *    **明日もレールの先頭に出続けます**（同じものを毎日読むことになる）
   */
  const saveExisting = async (id: string, stage: string) => {
    await api.put(`/projects/${id}`, buildProjectBody(v));
    if (selection?.project && selection.project.stage !== stage) {
      // 理由は受信箱の「不要」と同じ「見送り（案件化せず）」に揃える —
      // 以前は 'other' で、同じ意味の見送りが失注分析で2つの理由に割れていた
      await api.patch(`/projects/${id}/stage`, stage === 'e_lost'
        ? { stage, lost_reason: DISMISS_LOST_REASON, lost_reason_note: '案件作成で見送り' }
        : { stage });
    } else {
      // **AI が起こしたものは「確認済み」にする。** 印を付けないと、
      // 明日もレールの先頭に出続けて、同じものを何度も読むことになる。
      // AI 起票でない案件では何も起きない（サーバーが判定する）
      await api.post(`/projects/${id}/ai-review`).catch(() => undefined);
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
      invalidate(id);
      notifySuccess('案件にしました', {
        description: 'GLS 番号は受注が固まってから発番します。',
      });
      navigate(`/sales/projects/${id}`);
    },
    onError: (e) => notifyApiError('案件にできませんでした', e),
  });

  const keep = useMutation({
    mutationFn: async () => {
      // 「確認しました」の印は `saveExisting` が必ず残す（段が動くならサーバー、
      // 動かないならここから）。**この3つの決め方で扱いを分けないこと** —
      // 分けた結果が「ネタのまま残す だけ受付から消える」だった
      if (existingId) return saveExisting(existingId, 'neta');
      if (selection?.inquiry) {
        // 問い合わせは案件にせず、あとで見るところ（ストック）へ移す
        await api.post(`/dailyops/inquiries/${selection.inquiry.id}/state`, { state: 'stock' });
        return null;
      }
      return createNew('neta');
    },
    onSuccess: (id) => {
      invalidate(id);
      notifySuccess('ネタのまま残しました');
      if (id) navigate(`/sales/projects/${id}`);
    },
    onError: (e) => notifyApiError('残せませんでした', e),
  });

  const drop = useMutation({
    mutationFn: async () => {
      if (existingId) {
        await api.patch(`/projects/${existingId}/stage`, {
          stage: 'e_lost', lost_reason: DISMISS_LOST_REASON, lost_reason_note: '案件作成で見送り',
        });
        return;
      }
      if (selection?.inquiry) {
        await api.post(`/dailyops/inquiries/${selection.inquiry.id}/state`, { state: 'dropped' });
      }
    },
    onSuccess: () => {
      // 見送りは**もうある行のステージを動かす**だけ。**受信箱の鍵を落とす**
      // （`invalidate` の中）とレールから消える — これは**サーバー側が失注を
      // 受付から外している**からで（`AI_INBOX_SQL` の stage 条件と `ai_reviewed_at`
      // の印）、落とすだけでは消えなかった（v4.1.2 まで「見送りにしても何も起きない」状態）。
      // **画面は移動しない。** 選択だけ外し、レールの続きを次々見送れるようにする
      invalidate(existingId);
      notifySuccess('失注にしました');
      onDropped();
    },
    onError: (e) => notifyApiError('失注にできませんでした', e, '時間をおいて、もう一度お試しください。'),
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
