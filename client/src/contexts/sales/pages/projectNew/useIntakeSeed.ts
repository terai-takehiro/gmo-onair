/**
 * 選んだカードの中身をフォームに写す（案件作成の上のレール）
 *
 * ── 上書きの決めごと ────────────────────────────────────────
 *
 * **カードを選び直したら、そのカードの読み取り結果で上書きします。**
 * 「人が書いた文字は残す」形にすると、1枚目を選んで直したあと2枚目を選んだときに
 * **1枚目の内容が混ざったまま**になり、どちらの引き合いを登録しているのか
 * 分からなくなります（実際に起きると気づけない壊れ方）。
 *
 * その代わり、**カードを選ぶのは1回押すだけの操作**なので、
 * 間違えたら「選択をやめる」で空に戻せます。
 *
 * ── ネタ案件と問い合わせで読む先が違う ──────────────────────
 *
 *  ・**ネタ案件**（`ai_project`）… もう `projects` の行になっているので
 *    `GET /projects/:id` を読みます。一覧の `meta` では足りません
 *    （分類・担当・想定金額など「案件にできるか」を決める項目が入っていない）
 *  ・**問い合わせ**（`inquiry`）… まだ案件ではないので
 *    `GET /dailyops/inquiries/:id` を読みます
 */
import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { EMPTY_NEW_PROJECT, type NewProjectValues } from './fields';
import type { InboxItem } from '../inbox/kinds';
import type { InquirySeed } from './fromInquiry';
import type { Audience, ProjectCategory } from '../../classification';
import type { ProjectStage } from '@/types';

/** 案件（ネタ）の読み取り結果のうち、この画面が使う分だけ */
export interface SeedProject {
  id: string;
  name: string;
  customer_id: string | null;
  customer_name: string | null;
  contact_name: string | null;
  assigned_to: string | null;
  stage: ProjectStage;
  audience: string | null;
  project_category: string | null;
  recurrence: string | null;
  attendee_count: number | null;
  goal: string | null;
  expected_amount: number | string | null;
  intake_channel: string | null;
  notes: string | null;
  event_start: string | null;
  event_end: string | null;
  gls_number: string | null;
  dates?: { date: string }[];
}

export interface IntakeSelection {
  item: InboxItem;
  /** ネタ案件のとき。問い合わせのときは null */
  project: SeedProject | null;
  /** 問い合わせのとき。ネタ案件のときは null */
  inquiry: InquirySeed | null;
}

/** 案件（ネタ）の値をフォームの形に落とす */
function fromProject(p: SeedProject): NewProjectValues {
  return {
    ...EMPTY_NEW_PROJECT,
    customer_id: p.customer_id ?? '',
    contact_name: p.contact_name ?? '',
    name: p.name ?? '',
    audience: (p.audience ?? '') as Audience | '',
    project_category: (p.project_category ?? '') as ProjectCategory | '',
    recurrence: p.recurrence === 'regular' ? 'regular' : 'single',
    // ネタのままのものはネタで開く。すでに進んでいるものはその段から始める
    stage: p.stage ?? 'neta',
    dates: (p.dates ?? []).map((d) => d.date).filter(Boolean).sort(),
    attendee_count: p.attendee_count != null ? String(p.attendee_count) : '',
    goal: p.goal ?? '',
    expected_amount: Number(p.expected_amount) > 0 ? String(Number(p.expected_amount)) : '',
    intake_channel: p.intake_channel ?? '',
    assigned_to: p.assigned_to ?? '',
    notes: p.notes ?? '',
  };
}

/** 問い合わせの値をフォームの形に落とす（`fromInquiry.ts` と同じ写し方） */
function fromInquiryValues(d: InquirySeed): NewProjectValues {
  return {
    ...EMPTY_NEW_PROJECT,
    // 案件名は件名 → 要約の順。どちらも無ければ空のまま（作り話をしない）
    name: (d.subject ?? '').replace(/^件名[:：]\s*/, '').trim() || d.summary || '',
    contact_name: d.sender ?? '',
    goal: d.summary ?? '',
    // 出どころは**リード経路の選択肢にある語だけ**移す（`talk` / `slack` は無い）
    intake_channel: d.source === 'mail' ? 'mail' : d.source === 'phone' ? 'phone' : '',
    notes: [d.action_needed, d.body_text].filter(Boolean).join('\n\n'),
  };
}

export function useIntakeSeed(
  selected: InboxItem | null,
  setV: (v: NewProjectValues) => void,
): IntakeSelection | null {
  const projectId = selected?.kind === 'ai_project' ? String(selected.meta.id ?? '') : null;
  const inquiryId = selected?.kind === 'inquiry' ? String(selected.meta.id ?? '') : null;

  const { data: project } = useQuery<SeedProject>({
    queryKey: ['project', projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}`)).data.data,
    enabled: !!projectId,
  });

  const { data: inquiry } = useQuery<InquirySeed>({
    queryKey: ['inquiry-for-new-project', inquiryId],
    queryFn: async () => (await api.get(`/dailyops/inquiries/${inquiryId}`)).data.data,
    enabled: !!inquiryId,
  });

  /**
   * **同じカードでは1回しか写さない。** 読み直し（`refetchOnMount` など）が
   * 走るたびに写すと、書きかけの文字が消えます。
   * 別のカードを選んだら鍵が変わるので、そのときは写します。
   */
  const filledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!selected) {
      // **選択をやめたら空に戻す。** 残すと、手で入れているつもりの人が
      // 前のカードの内容ごと登録します
      if (filledFor.current !== null) {
        filledFor.current = null;
        setV({ ...EMPTY_NEW_PROJECT });
      }
      return;
    }
    if (filledFor.current === selected.key) return;
    if (projectId && project) {
      filledFor.current = selected.key;
      setV(fromProject(project));
    } else if (inquiryId && inquiry) {
      filledFor.current = selected.key;
      setV(fromInquiryValues(inquiry));
    }
  }, [selected, project, inquiry, projectId, inquiryId, setV]);

  if (!selected) return null;
  return { item: selected, project: project ?? null, inquiry: inquiry ?? null };
}
