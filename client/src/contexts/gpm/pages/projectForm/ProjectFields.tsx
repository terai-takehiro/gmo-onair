/**
 * ④ プロジェクトの欄1つずつ（新規作成・編集で共有・PR③・項目17）
 *
 * 見出し・必須の印（赤い `*`）は**案件作成と同じ `Field` 部品**を使う
 * （`@/contexts/sales/pages/projectNew/Field`。項目16 — 「必須」表記を
 * 赤い `*` に統一する。GPM の中で `<span class="text-destructive">必須</span>`
 * と `*` が混在していたのをここで1本にする）。
 *
 * 中身（区分の2枚カード・依頼元がお客様マスター参照であること・PM会社は
 * グループ受託のときだけ・いまの段は案件と同じ7段のうち4つ）は
 * 前の `BasicStep.tsx` から**そのまま移した**。言葉づかいは変えていない。
 */
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@gmo-onair/shared/src/client/utils';
import type { ProjectStage } from '@/types';
import { STAGE_BADGE_LABEL } from '@/contexts/sales/pages/projectList/stages';
import { Field } from '@/contexts/sales/pages/projectNew/Field';
import { KIND_LABEL, KIND_NOTE, type GpmKind } from '../../types';
import { CREATABLE_STAGES, type GpmFieldsMode } from './fields';

const KINDS: GpmKind[] = ['self_build', 'group_order'];

export function NameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="プロジェクト名" required full htmlFor="gpm-name">
      <Input
        id="gpm-name"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="用賀スタジオ 第2副調整室 構築"
      />
    </Field>
  );
}

/**
 * 区分。ラジオではなく「2枚のカード」（自社構築とグループ受託は
 * そのあとの入力が変わるので、違いを1行ずつ添える）。
 */
export function KindField({ value, onChange }: { value: GpmKind; onChange: (v: GpmKind) => void }) {
  return (
    <Field label="区分" required full>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {KINDS.map((k) => {
          const on = value === k;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(k)}
              className={cn(
                'min-h-tap rounded-control-lg flex items-start gap-2.5 border p-3 text-left',
                on ? 'border-primary-border-strong bg-primary-surface-weak' : 'border-border hover:bg-muted',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-chip border',
                  on ? 'border-primary' : 'border-border-disabled',
                )}
              >
                <span className={cn('block h-2 w-2 rounded-chip', on && 'bg-primary')} />
              </span>
              <span className="min-w-0">
                <span className={cn('text-list block', on && 'text-primary')}>{KIND_LABEL[k]}</span>
                <span className="text-sub-sm block text-muted-foreground">{KIND_NOTE[k]}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Field>
  );
}

/**
 * 依頼元。**自由入力にしない**（migration 179）。プロジェクトは GLS-B の案件で、
 * 依頼元はお客様マスターへの参照。**編集画面では変えられない** — 付け替えは
 * 案件の「直す」画面（お客様の選択欄）で行う（`EditProjectDialog.tsx` の元の注記）。
 */
export function ClientField({
  mode, kind, customerId, onCustomerId, customers, customerName,
}: {
  mode: GpmFieldsMode;
  kind: GpmKind;
  customerId?: string;
  onCustomerId?: (v: string) => void;
  customers?: { id: string; name: string }[];
  customerName?: string | null;
}) {
  const required = mode === 'create' && kind === 'group_order';
  return (
    <Field
      label="依頼元"
      required={required}
      hint={
        mode === 'edit'
          ? '付け替えは案件の「編集」画面から行います'
          : kind === 'self_build'
            ? '自社構築なので相手はいません。'
            : 'お客様マスターから選びます。無ければ案件管理の取引先で先に登録してください。'
      }
    >
      {mode === 'edit' ? (
        <p className="text-list min-h-tap flex items-center lg:min-h-[36px]">
          {customerName ?? '未設定'}
        </p>
      ) : kind === 'self_build' ? (
        <p className="text-list min-h-tap flex items-center lg:min-h-[36px]">
          自社（GMOグローバルスタジオ）
        </p>
      ) : (
        <Select
          value={customerId || '_none_'}
          onValueChange={(v) => onCustomerId?.(v === '_none_' ? '' : v)}
        >
          <SelectTrigger><SelectValue placeholder="選んでください" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_none_">未定（自社として登録）</SelectItem>
            {(customers ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </Field>
  );
}

/** PM会社。**グループ受託のときだけ**入力欄、自社構築は固定文（依頼元と同じ分岐） */
export function PmCompanyField({ kind, value, onChange }: {
  kind: GpmKind;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label="PM会社" htmlFor={kind === 'group_order' ? 'gpm-pmco' : undefined}>
      {kind === 'group_order' ? (
        <Input
          id="gpm-pmco"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="自社PM のときは空のまま"
        />
      ) : (
        <p className="text-list min-h-tap flex items-center lg:min-h-[36px]">自社PM です</p>
      )}
    </Field>
  );
}

export function AssignedToField({ users, value, onChange }: {
  users: { id: string; name: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label="自社担当（PM）" htmlFor="gpm-pm" hint="プロジェクト管理の権限がある人だけを出しています。">
      <Select value={value || '_none_'} onValueChange={(v) => onChange(v === '_none_' ? '' : v)}>
        <SelectTrigger id="gpm-pm"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="_none_">未定</SelectItem>
          {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  );
}

/**
 * いまの段。**新規作成は選べる**（案件と同じ7段のうち手前の4つ）。
 * **編集は読むだけ** — 変えるのは案件詳細⑥と同じくヘッダーのステージ帯から
 * （項目17「編集側に無い『いまの段』を追加する」を read-only で満たす。
 * ここから直に変えられるようにすると、`GpmProjectDetailPage` のステージ帯と
 * 保存の経路が2つになる）。
 */
export function StageField({ mode, value, onChange }: {
  mode: GpmFieldsMode;
  value: ProjectStage;
  onChange?: (v: ProjectStage) => void;
}) {
  return (
    <Field
      label="いまの段"
      hint={mode === 'create'
        ? '案件と同じ段です。GLS 番号は受注してから採ります。'
        : '変えるのはこの画面の外（見出しのステージ帯）からです。'}
    >
      {mode === 'create' ? (
        <Select value={value} onValueChange={(v) => onChange?.(v as ProjectStage)}>
          <SelectTrigger id="gpm-stage"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CREATABLE_STAGES.map((s) => <SelectItem key={s} value={s}>{STAGE_BADGE_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
      ) : (
        <p className="text-list min-h-tap flex items-center lg:min-h-[36px]">{STAGE_BADGE_LABEL[value]}</p>
      )}
    </Field>
  );
}

export function StartedOnField({ value, onChange, hint }: {
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <Field label="着手日" htmlFor="gpm-started" hint={hint}>
      <Input
        id="gpm-started"
        type="date"
        className="w-full sm:w-52"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

/** 完了予定日。**編集だけ**が持つ（新規作成の時点ではまだ決まらないことが多い） */
export function EndsOnField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="完了予定日" htmlFor="gpm-ends">
      <Input id="gpm-ends" type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function NotesField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="メモ" htmlFor="gpm-notes">
      <Textarea
        id="gpm-notes"
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="発注の経緯・前提など"
      />
    </Field>
  );
}
