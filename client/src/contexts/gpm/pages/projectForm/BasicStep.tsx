/**
 * ④ 新規作成 ステップ1 — 基本情報
 *
 * ── 区分をラジオではなく「2枚のカード」にした理由 ────────────
 *
 * 自社構築とグループ受託は**そのあとの入力が変わります**（PM会社は
 * グループ受託のときだけ意味がある）。丸を2つ並べただけだと違いが読めないので、
 * 何が違うのかを1行ずつ添えます（モックと同じ形）。
 *
 * ── 「お客様マスターから選ぶ」にしていない ──────────────────
 *
 * 依頼元は**自社のことも書く**（自社構築なら「自社（GMOグローバルスタジオ）」）ので、
 * `customers` から選ばせると自社を登録することになります。モックも自由入力です。
 * `gpm_projects.customer_id` は空のままにします — 使い道が決まってから結びます。
 */
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { KIND_LABEL, KIND_NOTE, STATUS_LABEL, type GpmKind, type GpmStatus } from '../../types';

export interface BasicValues {
  name: string;
  kind: GpmKind;
  clientName: string;
  pmCompany: string;
  pmUserId: string;
  status: GpmStatus;
  notes: string;
}

export interface BasicStepProps {
  values: BasicValues;
  onChange: (patch: Partial<BasicValues>) => void;
  users: { id: string; name: string }[];
}

const KINDS: GpmKind[] = ['self_build', 'group_order'];
/** 作った直後に「完了」にすることはない。**選べる状態を絞る**と迷わない */
const STATUSES: GpmStatus[] = ['active', 'planning'];

export function BasicStep({ values, onChange, users }: BasicStepProps) {
  return (
    <div className="rounded-card space-y-4 border border-border bg-card p-4 lg:p-5">
      <div>
        <Label htmlFor="gpm-name">
          プロジェクト名 <span className="text-destructive">必須</span>
        </Label>
        <Input
          id="gpm-name"
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="用賀スタジオ 第2副調整室 構築"
        />
      </div>

      <div>
        <p className="text-th mb-1.5 text-muted-foreground">
          区分 <span className="text-destructive">必須</span>
        </p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {KINDS.map((k) => {
            const on = values.kind === k;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ kind: k })}
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
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="gpm-client">
            依頼元 <span className="text-destructive">必須</span>
          </Label>
          <Input
            id="gpm-client"
            value={values.clientName}
            onChange={(e) => onChange({ clientName: e.target.value })}
            placeholder={values.kind === 'self_build' ? '自社（GMOグローバルスタジオ）' : 'グループ本体 コーポレート'}
          />
        </div>
        <div>
          <Label htmlFor="gpm-pmco">PM会社</Label>
          <Input
            id="gpm-pmco"
            value={values.pmCompany}
            onChange={(e) => onChange({ pmCompany: e.target.value })}
            placeholder="自社PM のときは空のまま"
          />
          <p className="text-sub-sm mt-1 text-muted-foreground">
            間に PM 会社が入るときだけ書きます。空なら自社 PM です。
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="gpm-pm">自社担当（PM）</Label>
          <Select
            value={values.pmUserId || '_none_'}
            onValueChange={(v) => onChange({ pmUserId: v === '_none_' ? '' : v })}
          >
            <SelectTrigger id="gpm-pm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none_">未定</SelectItem>
              {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-sub-sm mt-1 text-muted-foreground">
            プロジェクト管理の権限がある人だけを出しています。
          </p>
        </div>
        <div>
          <Label htmlFor="gpm-status">いまの状態</Label>
          <Select value={values.status} onValueChange={(v) => onChange({ status: v as GpmStatus })}>
            <SelectTrigger id="gpm-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="gpm-notes">メモ</Label>
        <Textarea
          id="gpm-notes"
          rows={3}
          value={values.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="発注の経緯・前提など"
        />
      </div>
    </div>
  );
}
