/**
 * ④ プロジェクトの欄 — 新規作成・編集で共有する値の形（PR③・項目17）
 *
 * 以前は新規作成（`BasicStep` の `BasicValues`）と編集
 * （`projectDetail/EditProjectDialog.tsx` のばらばらの `useState`）が
 * それぞれ別の形で値を持っていた。同じ「プロジェクトの基本情報」なのに
 * 型が2つあると、欄を1つ足すたびに2か所で足し引きすることになる
 * （実際に「区分・依頼元・いまの段」が編集側だけ抜けていた）。
 *
 * ここでは**共通の値の形**だけを定義する。新規作成・編集それぞれの
 * 呼び出し元は自分の state をこの形に合わせて渡し、`RequiredFields` /
 * `MoreFields` の欄の部品（`ProjectFields.tsx`）を共有する。
 */
import type { ProjectStage } from '@/types';
import type { GpmKind } from '../../types';

export type GpmFieldsMode = 'create' | 'edit';

export interface GpmFormValues {
  name: string;
  kind: GpmKind;
  /** 依頼元。お客様マスターの id（自社構築・未定は空） */
  customerId: string;
  pmCompany: string;
  pmUserId: string;
  stage: ProjectStage;
  startedOn: string;
  /** 完了予定日。**新規作成では使わない**（作ってから決まることが多い） */
  endsOn: string;
  notes: string;
}

/**
 * 作った直後に選べるステージ。**案件と同じ7段のうち手前の4つだけ**を出す。
 * 完了・見送りで作ることはないので出さない（作ってから変えられる）。
 */
export const CREATABLE_STAGES: ProjectStage[] = ['a_won', 'b_verbal', 'c_proposal', 'neta'];
