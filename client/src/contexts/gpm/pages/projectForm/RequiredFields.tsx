/**
 * 「いま必要な4つ」（新規作成・編集で共有・PR③・項目17）
 *
 *   プロジェクト名 ／ 区分 ／ 依頼元 ／ 自社担当（PM）
 *
 * 実際に「作る」「編集」を止める必須項目はプロジェクト名（常に）と
 * 依頼元（グループ受託のときだけ）の2つだけ——**このカードの4つ全部が
 * 保存を止めるわけではない**。区分は既定値が入っているので空にならず、
 * 自社担当（PM）は未定のままでも保存できる。それでも4つをまとめて
 * 最初に見せるのは、この4つが「このプロジェクトが何者か」を決める
 * いちばん基本の情報だから（案件作成の `RequiredFields` と同じ考え方 —
 * あちらも「社内の担当」を必須の並びに含めている）。
 *
 * 見出しの数字（4）はこのカードが描く `Field` の数と対応させてある。
 * 欄を増減したらここも直すこと。
 */
import type { GpmKind } from '../../types';
import type { GpmFieldsMode } from './fields';
import { NameField, KindField, ClientField, AssignedToField } from './ProjectFields';

export interface RequiredFieldsProps {
  mode: GpmFieldsMode;
  name: string;
  onName: (v: string) => void;
  kind: GpmKind;
  onKind: (v: GpmKind) => void;
  customerId?: string;
  onCustomerId?: (v: string) => void;
  customers?: { id: string; name: string }[];
  customerName?: string | null;
  users: { id: string; name: string }[];
  pmUserId: string;
  onPmUserId: (v: string) => void;
  /** 見出しに出す件数（既定4）。まだ立っていない案件分類ヒントなどを足すときに合わせて渡す */
  count?: number;
}

export function RequiredFields({
  mode, name, onName, kind, onKind, customerId, onCustomerId, customers, customerName,
  users, pmUserId, onPmUserId, count = 4,
}: RequiredFieldsProps) {
  return (
    <div className="rounded-card border border-primary-border bg-card p-4 lg:p-5">
      <p className="text-cardtitle mb-3">いま必要な{count}つ</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NameField value={name} onChange={onName} />
        {/*
          **グループ受託から離れたら PM会社を消す。** 欄を隠すだけだと、
          一度入れた PM会社が残ったまま送られ、画面が「自社PM です」と
          言っているのに外部の PM 会社が保存された状態になる
          （`BasicStep.tsx` の元の指摘）。PM会社は `MoreFields` 側が持つので、
          その始末は呼び出し元の `onKind`（`BasicStep`/`EditProjectDialog`）に任せる。
        */}
        <KindField value={kind} onChange={onKind} />
        <ClientField
          mode={mode}
          kind={kind}
          customerId={customerId}
          onCustomerId={onCustomerId}
          customers={customers}
          customerName={customerName}
        />
        <AssignedToField users={users} value={pmUserId} onChange={onPmUserId} />
      </div>
    </div>
  );
}
