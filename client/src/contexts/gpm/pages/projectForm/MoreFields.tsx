/**
 * 「あとから足せるもの」（新規作成・編集で共有・PR③・項目17）
 *
 *   PM会社 ／ 着手日 ／（編集だけ）完了予定日 ／ いまの段 ／ メモ
 *
 * どれも保存を止めない項目なので、`RequiredFields`（いま必要な4つ）の外へ
 * 畳んである。呼び出し元（`BasicStep`/`EditProjectDialog`）が開閉の状態を持つ。
 */
import type { ProjectStage } from '@/types';
import type { GpmKind } from '../../types';
import type { GpmFieldsMode } from './fields';
import { PmCompanyField, StartedOnField, EndsOnField, StageField, NotesField } from './ProjectFields';

export interface MoreFieldsProps {
  mode: GpmFieldsMode;
  kind: GpmKind;
  pmCompany: string;
  onPmCompany: (v: string) => void;
  startedOn: string;
  onStartedOn: (v: string) => void;
  startedOnHint?: string;
  /** 完了予定日。**編集だけ**渡す（新規作成では出さない） */
  endsOn?: string;
  onEndsOn?: (v: string) => void;
  stage: ProjectStage;
  onStage?: (v: ProjectStage) => void;
  notes: string;
  onNotes: (v: string) => void;
}

/** このカードが描く欄の数を数える（開く前のバッジに出す） */
export function moreFieldCount(mode: GpmFieldsMode): number {
  // PM会社・いまの段・着手日・メモ ＋ 編集だけ完了予定日
  return mode === 'edit' ? 5 : 4;
}

export function MoreFields({
  mode, kind, pmCompany, onPmCompany, startedOn, onStartedOn, startedOnHint,
  endsOn, onEndsOn, stage, onStage, notes, onNotes,
}: MoreFieldsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <PmCompanyField kind={kind} value={pmCompany} onChange={onPmCompany} />
      <StageField mode={mode} value={stage} onChange={onStage} />
      <StartedOnField value={startedOn} onChange={onStartedOn} hint={startedOnHint} />
      {mode === 'edit' && <EndsOnField value={endsOn ?? ''} onChange={(v) => onEndsOn?.(v)} />}
      <div className="sm:col-span-2">
        <NotesField value={notes} onChange={onNotes} />
      </div>
    </div>
  );
}
