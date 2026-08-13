/**
 * 「いま必要な5つ」（**案件作成と案件を直す・PC とスマホで共通**）
 *
 *   お客様 ／ 社内の担当 ／ 案件名 ／ 客入れの有無 ／ 案件分類（＋ ステージ）
 *
 * ステージは必須ではありませんが**同じ枠に置きます** — いま何段目の話なのかは
 * 上の5つと一緒に決まるもので、「進んだら聞く」に畳むと
 * 仮押さえまで進んでいる引き合いを毎回ネタで登録することになります。
 *
 * **PC とスマホで同じ部品を使います。** 並びは1列（`grid-cols-1`）で、
 * 640px 以上でだけ2列に開きます — スマホ（390px）では自然に縦積みになるので、
 * 画面ごとに書き分ける必要がありません。
 *
 * ── 直す画面ではステージだけ出しません（`mode="edit"`）────────
 *
 * 段を動かすと**履歴（`project_stage_changes`）が1行増え**、失注なら理由が要り、
 * 受注なら GLS 発番の確認が挟まります。この保存（`PUT /projects/:id`）は
 * `stage` を1文字も見ないので、**ここに置くと押せるのに何も起きない欄**になります。
 * 直す画面のステージは見出しの札で見せ、変えるのは案件詳細のヘッダーです
 * （`PATCH /projects/:id/stage`）。
 */
import { Users, UserX } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { ProjectStageLabels, type ProjectStage } from '@/types';
import {
  AUDIENCES, AUDIENCE_LABEL, PROJECT_CATEGORIES, PROJECT_CATEGORY_LABEL,
  flowHint, type Audience, type ProjectCategory,
} from '../../classification';
import { CREATABLE_STAGES, type FieldsMode, type ProjectFieldsState } from './fields';
import { Field } from './Field';

export function RequiredFields({ f, mode = 'create' }: { f: ProjectFieldsState; mode?: FieldsMode }) {
  const { v, set } = f;
  const hint = flowHint(v.audience, v.project_category);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="お客様" required hint="無ければ「取引先マスター」で先につくります">
        <SearchableSelect
          options={f.customers.map((c) => ({
            value: c.id,
            label: c.short_name || c.name,
            subLabel: c.short_name ? c.name : undefined,
          }))}
          value={v.customer_id}
          onChange={(id) => set('customer_id', id)}
          placeholder="会社を選ぶ"
        />
      </Field>

      <Field label="社内の担当" required hint="この案件を持つ人。タスクの担当は1件ずつ別に決められます">
        <SearchableSelect
          options={f.users.map((u) => ({ value: u.id, label: u.name }))}
          value={v.assigned_to}
          onChange={(id) => set('assigned_to', id)}
          placeholder="担当を選ぶ"
        />
      </Field>

      <Field label="案件名" required full htmlFor="np-name" hint="あとから変えられます">
        <Input id="np-name" value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="周年記念式典 配信・収録" />
      </Field>

      {/*
        **客入れの有無はプルダウンにしない。** 2択なので、開いて選ぶより
        並べて押すほうが速く、いま何を選んでいるかが常に見えます
      */}
      <Field label="客入れの有無" required>
        <div className="flex gap-2">
          {AUDIENCES.map((a) => {
            const on = v.audience === a;
            const Icon = a === 'with_audience' ? Users : UserX;
            return (
              <button
                key={a}
                type="button"
                aria-pressed={on}
                onClick={() => set('audience', a as Audience)}
                className={`min-h-tap text-sub flex flex-1 items-center justify-center gap-2 rounded-control border font-bold lg:min-h-[40px] ${
                  on
                    ? 'border-primary-border-strong bg-primary-surface text-primary'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />{AUDIENCE_LABEL[a]}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="案件分類" required>
        <Select
          value={v.project_category || undefined}
          onValueChange={(x) => set('project_category', x as ProjectCategory)}
        >
          <SelectTrigger><SelectValue placeholder="選ぶ" /></SelectTrigger>
          <SelectContent>
            {PROJECT_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{PROJECT_CATEGORY_LABEL[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/*
          **2つ揃ったときだけ出す。** この組み合わせが標準工程テンプレートの
          決定キーそのものなので、片方だけで出すと嘘になります
        */}
        {hint && <p className="text-note mt-1 font-bold text-primary">{hint}</p>}
      </Field>

      {/* 直す画面では出しません（この保存は `stage` を見ないため。冒頭の理由） */}
      {mode === 'create' && (
        <Field label="ステージ" hint="受注はここでは選べません（GLS の発番は受注が固まってからです）">
          <Select value={v.stage} onValueChange={(x) => set('stage', x as ProjectStage)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CREATABLE_STAGES.map((st) => (
                <SelectItem key={st} value={st}>{ProjectStageLabels[st]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
    </div>
  );
}
