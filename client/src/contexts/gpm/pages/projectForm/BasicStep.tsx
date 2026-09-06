/**
 * ④ 新規作成 ステップ1 — 基本情報（PR③・項目17で構成を作り直した）
 *
 * ── 「いま必要な4つ ＋ あとから足せるもの（折りたたみ）」の2段構成 ─────
 *
 * 案件作成（`sales/pages/projectNew/NewProjectDialog.tsx`）と同じ作法。
 * 欄そのものは `RequiredFields.tsx` / `MoreFields.tsx`（＝ `ProjectFields.tsx`
 * の1つずつの部品）を**編集ダイアログ（`EditProjectDialog.tsx`）と共有**する。
 *
 * ── 「お客様マスターから選ぶ」にしていない ──────────────────
 *
 * 依頼元は**自社のことも書く**（自社構築なら「自社（GMOグローバルスタジオ）」）ので、
 * `customers` から選ばせると自社を登録することになります。モックも自由入力です。
 * `gpm_projects.customer_id` は空のままにします — 使い道が決まってから結びます。
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ProjectStage } from '@/types';
import type { GpmKind } from '../../types';
import { RequiredFields } from './RequiredFields';
import { MoreFields, moreFieldCount } from './MoreFields';

export interface BasicValues {
  name: string;
  kind: GpmKind;
  /** 依頼元。**お客様マスターの id**（自社構築は空 = 自社の行に寄せる） */
  customerId: string;
  pmCompany: string;
  pmUserId: string;
  stage: ProjectStage;
  notes: string;
}

export interface BasicStepProps {
  values: BasicValues;
  onChange: (patch: Partial<BasicValues>) => void;
  users: { id: string; name: string }[];
  customers: { id: string; name: string }[];
  /**
   * 着手日。**3段目（`PreviewStep`）と同じ値を両方から触る。**
   * 編集ダイアログでは着手日が基本情報の一部なのに、新規作成では3段目にしか
   * 無く、同じ値が新規と編集で違う場所にあった（`docs/design/v4/_form-order.md`）。
   * 3段目は「入れた着手日で工程がこう並ぶ」を見ながら直す場所として残す。
   */
  startedOn: string;
  onStartedOn: (v: string) => void;
}

export function BasicStep({ values, onChange, users, customers, startedOn, onStartedOn }: BasicStepProps) {
  const [more, setMore] = useState(false);

  return (
    <div className="space-y-3.5">
      <RequiredFields
        mode="create"
        name={values.name}
        onName={(v) => onChange({ name: v })}
        kind={values.kind}
        onKind={(k) => onChange(k === 'group_order' ? { kind: k } : { kind: k, pmCompany: '' })}
        customerId={values.customerId}
        onCustomerId={(v) => onChange({ customerId: v })}
        customers={customers}
        users={users}
        pmUserId={values.pmUserId}
        onPmUserId={(v) => onChange({ pmUserId: v })}
      />

      <div className="rounded-card overflow-hidden border border-border bg-card">
        <button
          type="button"
          onClick={() => setMore((o) => !o)}
          aria-expanded={more}
          className="min-h-tap flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-muted"
        >
          {more
            ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
          <span className="text-list font-bold">あとから足せるもの</span>
          <span className="text-badge font-number rounded-badge-xs bg-muted px-1.5 py-0.5 text-muted-foreground">
            {moreFieldCount('create')}
          </span>
          <span className="flex-1" />
          <span className="text-note text-muted-foreground">PM会社 ・ 着手日 ・ いまの段 ・ メモ</span>
        </button>

        {more && (
          <div className="border-t border-border-faint px-4 pb-4 pt-4 lg:px-5">
            <MoreFields
              mode="create"
              kind={values.kind}
              pmCompany={values.pmCompany}
              onPmCompany={(v) => onChange({ pmCompany: v })}
              startedOn={startedOn}
              onStartedOn={onStartedOn}
              startedOnHint="入れなくても作れます。入れると「着手日と工程の確認」の段で日付の並びを見られます。"
              stage={values.stage}
              onStage={(v) => onChange({ stage: v })}
              notes={values.notes}
              onNotes={(v) => onChange({ notes: v })}
            />
          </div>
        )}
      </div>
    </div>
  );
}
