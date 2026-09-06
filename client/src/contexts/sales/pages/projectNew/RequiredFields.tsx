/**
 * 「いま必要な5つ」（**案件作成と案件を直す・PC とスマホで共通**）
 *
 *   お客様 ／ 案件名 ／ 客入れの有無 ／ 案件分類 ／ 社内の担当（＋ ステージ）
 *
 * ── 並びは3か所で1つにそろえる（`docs/design/v4/_form-order.md`）────
 *
 * この5つは **①画面の案内文（`NewProjectDialog`）②足りない項目の黄色い帯
 * （`fields.ts` の `missingOf`）③実際の欄** の3か所に出ますが、
 * 欄だけが「お客様 → 社内の担当 → 案件名 …」と別の順でした。
 * `missingOf` は「並びはフォームの並びと同じにする（上から順に埋めれば消える）」と
 * 書いてあるのに、帯の指す順に目で追うと欄が飛びます。
 * → **欄の側を①②に合わせました**（お客様＝相手の話 → 案件名・客入れ・分類＝
 * その案件の話 → 社内の担当＝自社の話。電話で聞く順にもそろいます）。
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
  /**
   * 2段分類に**もう手を付けたか**。直す画面では、まったく空の案件は
   * そのまま保存できますが、**片方だけ入れたら片方も要ります**
   * （サーバーは2つ揃ったときだけ保存するので、片方は黙って捨てられる）。
   * `*` の出し入れを `missingOf` と同じ条件にしておかないと、
   * **印は付いていないのに保存が押せない**という読めない状態になります。
   */
  const started = !!v.audience || !!v.project_category;
  /**
   * ⚠️ **GLS-B（工事・構築）には2段分類の欄そのものを出しません**（レビューでの指摘 #99）。
   *
   * `missingOf` は前から GLS-B を訊かない形でしたが、**欄は出したまま**でした。
   * つまり古い GLS-B の案件を直す画面で開くと、
   * **「客入れの有無」と「案件分類」が押せて、押せば保存されます**。
   * サーバーは2段から `project_type` を導くので、**工事のプロジェクトが
   * `hybrid_event`（ハイブリッド）になり**、標準工程の型・Excel・集計が
   * 放送の案件として扱います（`project-classification.ts` の「NULL のままにする」に反する）。
   * しかも**押した人には何も出ません** — 選べたのだから正しいと思います。
   *
   * **作る画面は必ず GLS-A** なので、効くのは古い GLS-B の行を開いたときだけです。
   * **欄ごと消さずに理由を1行書きます** — 消すだけだと
   * 「案件分類が無い画面」に見えて、壊れていると読まれます。
   */
  const isGlsB = v.gls_category === 'B';

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {/*
        **お客様がいちばん上**（`_form-order.md` の段1「どれに付けるか」）。
        `full` にしてあるのは、社内の担当を下（自社の話のまとまり）へ動かした結果、
        2列のときに右半分が穴になるためです。会社を探す欄なので広いほうが押しやすい
      */}
      <Field label="お客様" required full hint="無ければ「取引先マスター」で先につくります">
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

      <Field label="案件名" required full htmlFor="np-name" hint="あとから変えられます">
        <Input id="np-name" value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="周年記念式典 配信・収録" />
      </Field>

      {/*
        **GLS-B は2段分類を持ちません**（上の `isGlsB` の理由）。
        代わりに**なぜ無いのか**を1行だけ出します（欄が消えただけだと壊れて見える）。
      */}
      {isGlsB && (
        <div className="sm:col-span-2">
          <p className="text-note rounded-note border border-border bg-muted/40 px-3 py-2 text-muted-foreground">
            このプロジェクト（GLS-B）には「客入れの有無」と「案件分類」がありません。
            工事・構築の案件なので、放送の分類は当てはめません。
          </p>
        </div>
      )}

      {/*
        **客入れの有無はプルダウンにしない。** 2択なので、開いて選ぶより
        並べて押すほうが速く、いま何を選んでいるかが常に見えます
      */}
      {!isGlsB && (
      <Field label="客入れの有無" required={mode === 'create' || started}>
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
      )}

      {!isGlsB && (
      <Field label="案件分類" required={mode === 'create' || started}>
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
        {/*
          ⚠️ **「選ぶ」のままなのは、画面が戻したからではありません**（ご指摘）。
          その案件に分類が**まだ入っていない**だけです — migration 182 が埋め戻したのは
          旧「案件種類」の4種だけで、AI が起こしたネタ・決算取込・Excel/GLS 取込で
          できた案件は空のまま残っています。**そう書かないと「入れたのに消えた」と読まれます。**
          直す画面でだけ・**まだ何も入れていないとき**に出します。
        */}
        {mode === 'edit' && !started && (
          <p className="text-note mt-1 text-muted-foreground">
            この案件にはまだ分類が入っていません（空のままでも保存できます）
          </p>
        )}
      </Field>
      )}

      {/*
        **社内の担当は5つの最後**（`_form-order.md` の段4「誰が」）。
        お客様・案件名・客入れ・分類までが「聞いた話」で、ここから自社の話に移ります。
        間に挟むと、顧客の話と社内の話を交互に行き来することになります
      */}
      <Field label="社内の担当" required hint="この案件を持つ人。タスクの担当は1件ずつ別に決められます">
        <SearchableSelect
          options={f.users.map((u) => ({ value: u.id, label: u.name }))}
          value={v.assigned_to}
          onChange={(id) => set('assigned_to', id)}
          placeholder="担当を選ぶ"
        />
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
