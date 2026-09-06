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
import type { ProjectStage } from '@/types';
import { STAGE_BADGE_LABEL } from '@/contexts/sales/pages/projectList/stages';
import { KIND_LABEL, KIND_NOTE, type GpmKind } from '../../types';

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

const KINDS: GpmKind[] = ['self_build', 'group_order'];
/**
 * 作った直後に選べるステージ。**案件と同じ 7 段のうち手前の4つだけ**を出す。
 * 完了・見送りで作ることはないので出さない（作ってから変えられる）。
 */
const STAGES: ProjectStage[] = ['a_won', 'b_verbal', 'c_proposal', 'neta'];

export function BasicStep({ values, onChange, users, customers, startedOn, onStartedOn }: BasicStepProps) {
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
          <Label htmlFor="gpm-client">依頼元</Label>
          {/*
            **自由入力にしない** (migration 179)。プロジェクトは GLS-B の案件で、
            依頼元はお客様マスターへの参照。文字を打たせると保存されないうえ、
            同じ会社が表記ゆれで増える。自社構築は相手がいないので選ばせない
          */}
          {values.kind === 'self_build' ? (
            <p className="text-list min-h-tap flex items-center lg:min-h-[36px]">
              自社（GMOグローバルスタジオ）
            </p>
          ) : (
            <Select
              value={values.customerId || '_none_'}
              onValueChange={(v) => onChange({ customerId: v === '_none_' ? '' : v })}
            >
              <SelectTrigger id="gpm-client"><SelectValue placeholder="選んでください" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none_">未定（自社として登録）</SelectItem>
                {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <p className="text-sub-sm mt-1 text-muted-foreground">
            {values.kind === 'self_build'
              ? '自社構築なので相手はいません。'
              : 'お客様マスターから選びます。無ければ案件管理の取引先で先に登録してください。'}
          </p>
        </div>
        <div>
          {/*
            **PM会社はグループ受託のときだけ**（冒頭の注記のとおり、区分で
            そのあとの入力が変わる）。左隣の依頼元は区分で出し分けているのに
            ここだけ分岐が無く、自社構築でも意味のない欄が並んでいた。
            欄をただ消すと行の高さが詰まって見えるので、代わりに1行を置く。
          */}
          {values.kind === 'group_order' ? (
            <>
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
            </>
          ) : (
            <>
              <Label>PM会社</Label>
              <p className="text-list min-h-tap flex items-center lg:min-h-[36px]">自社PM です</p>
              <p className="text-sub-sm mt-1 text-muted-foreground">
                自社構築なので、間に入る PM 会社はありません。
              </p>
            </>
          )}
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
          <Label htmlFor="gpm-stage">いまの段</Label>
          <Select value={values.stage} onValueChange={(v) => onChange({ stage: v as ProjectStage })}>
            <SelectTrigger id="gpm-stage"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STAGES.map((s) => <SelectItem key={s} value={s}>{STAGE_BADGE_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-sub-sm mt-1 text-muted-foreground">
            案件と同じ段です。GLS 番号は受注してから採ります。
          </p>
        </div>
      </div>

      {/* 着手日はここ（基本情報）にも置く。編集ダイアログでは基本情報の一部で、
          新規のときだけ3段目にしか無いのは、同じ値の置き場所が2通りあるのと同じ。
          3段目の欄と同じ state を触るので、どちらで直しても同じ値になる */}
      <div>
        <Label htmlFor="gpm-started">着手日</Label>
        <Input
          id="gpm-started"
          type="date"
          className="w-full sm:w-52"
          value={startedOn}
          onChange={(e) => onStartedOn(e.target.value)}
        />
        <p className="text-sub-sm mt-1 text-muted-foreground">
          入れなくても作れます。入れると「着手日と工程の確認」の段で日付の並びを見られます。
        </p>
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
