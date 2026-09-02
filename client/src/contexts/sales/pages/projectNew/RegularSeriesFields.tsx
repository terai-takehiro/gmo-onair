/**
 * レギュラーの取り決め — 案件（シリーズ）に1度だけ置く値（v4・migration 262・264）
 *
 * `docs/design/v4/regular-series.md` §3「案件（シリーズ）が持つ4つの取り決め」＋
 * 積み残し1（放送日オフセット）のうち、いまも案件全体で1つだけ持つもの:
 *
 *   収録の頻度 ／ 固定セット ／ 請求サイクル ／ 放送日オフセット
 *
 * **回を作るたびに聞かれては困る値**なので、回（episodes）ではなく
 * 案件（projects）に1度だけ持たせる。回の一括生成（`GenerateEpisodesForm`）は
 * ここで入れた値（収録の頻度・放送日オフセット）を既定値として引き継ぐ
 * （`EpisodesPanel.tsx` から渡す）。
 *
 * ── 「1日あたりの本数」「回の単価」はここから廃止した（仕様変更 #16・migration 269）──
 *
 * 収録日によって本数・単価がズレることがあるため、案件全体の固定入力欄をやめ、
 * 各回（episodes）が実際の値を持つように変えた。回ごとの入力・編集は
 * `EpisodesPanel.tsx` の回一覧から行う。一括生成のときは
 * `GenerateEpisodesForm.tsx` が都度この2つを入力欄として持つ（初期値だけ
 * projects 側の古い値を引き継ぐ・`EpisodesPanel.tsx` の `SeriesDefaults` 参照）。
 * **`NewProjectValues` からも `recording_per_day_count`/`episode_unit_price` を
 * 削った** — 案件作成・案件を直すのどちらのフォームにも、もうこの2つを
 * 送る手段が無い（サーバーは未指定なら今の値を保つので、MCP からの更新は影響を受けない）。
 *
 * ── `recurrence === 'regular'` のときだけ出す ──────────────────
 *
 * 単発案件では意味を持たない値。**欄ごと出さない** — 出しておいて空のまま
 * 保存できると、「まだ決めていない」のか「単発だから要らない」のか
 * 見分けられなくなる（`RequiredFields`/`MoreFields` の「無観客のとき来場人数を
 * 出さない」と同じ考え方）。
 *
 * ── `RequiredFields`/`MoreFields` と同じパターン ────────────────
 *
 * **PC・スマホ・案件作成・案件を直す、全部で同じものを呼ぶ。** `ProjectFieldsState`
 * （`v`/`set`）を受け取るだけで、状態は持たない。写すと項目が増えたときに
 * 片方の画面だけ欄が増えない事故が起きる（`fields.ts` 冒頭の注記と同じ理由）。
 */
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  RECORDING_CADENCE_LABEL, BILLING_CYCLE_LABEL,
  type RecordingCadence, type BillingCycle, type ProjectFieldsState,
} from './fields';
import { Field } from './Field';

/** Radix の `Select.Item` は空文字を value にできないため、「決めていない」はこの値で表す */
const CADENCE_UNSET = '__unset';

export function RegularSeriesFields({ f }: { f: ProjectFieldsState }) {
  const { v, set } = f;
  if (v.recurrence !== 'regular') return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="収録の頻度" hint="回の一括生成（「頻度で作る」）の既定値になります">
        <Select
          value={v.recording_cadence || CADENCE_UNSET}
          onValueChange={(x) => set('recording_cadence', x === CADENCE_UNSET ? '' : x as RecordingCadence)}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={CADENCE_UNSET}>決めていない</SelectItem>
            {(Object.keys(RECORDING_CADENCE_LABEL) as RecordingCadence[]).map((k) => (
              <SelectItem key={k} value={k}>{RECORDING_CADENCE_LABEL[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="固定セット" full htmlFor="rs-studio" hint="拠点・カメラ数などの自由記述（例: 用賀 SKY STUDIO・3カメラ）。予約そのものは案件詳細の「予約」で押さえます">
        <Input
          id="rs-studio"
          value={v.fixed_studio_note}
          onChange={(e) => set('fixed_studio_note', e.target.value)}
          placeholder="用賀 SKY STUDIO・3カメラ"
        />
      </Field>

      <Field label="請求サイクル" hint="請求書のまとめ方（金額そのものは回ごとに持ちます）">
        <Select value={v.billing_cycle} onValueChange={(x) => set('billing_cycle', x as BillingCycle)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(BILLING_CYCLE_LABEL) as BillingCycle[]).map((k) => (
              <SelectItem key={k} value={k}>{BILLING_CYCLE_LABEL[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="放送日オフセット" htmlFor="rs-offset" hint="収録日から何日後に放送/公開するか（例: 7日）。回の一括生成の既定値になります">
        <div className="flex items-center gap-2">
          <Input
            id="rs-offset" type="number" min="0" inputMode="numeric"
            value={v.broadcast_offset_days}
            onChange={(e) => set('broadcast_offset_days', e.target.value)}
            placeholder="7"
          />
          <span className="text-sub shrink-0 text-muted-foreground">日後</span>
        </div>
      </Field>
    </div>
  );
}
