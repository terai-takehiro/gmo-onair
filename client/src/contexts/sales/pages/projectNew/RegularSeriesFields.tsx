/**
 * レギュラーの取り決め — 案件（シリーズ）に1度だけ置く値（v4・migration 262・264）
 *
 * `docs/design/v4/regular-series.md` §3「案件（シリーズ）が持つ4つの取り決め」＋
 * 積み残し1（放送日オフセット）:
 *
 *   収録の頻度 ／ 固定セット ／ 回の単価 ／ 請求サイクル ／ 放送日オフセット
 *
 * **回を作るたびに聞かれては困る値**なので、回（episodes）ではなく
 * 案件（projects）に1度だけ持たせる。回の一括生成（`GenerateEpisodesForm`）は
 * ここで入れた値を既定値として引き継ぐ（`EpisodesPanel.tsx` から渡す）。
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

      <Field label="1日あたりの本数" htmlFor="rs-per-day" hint="同じ収録日に何本撮るか（例: 2本撮り）">
        <Input
          id="rs-per-day" type="number" min="1" inputMode="numeric"
          value={v.recording_per_day_count}
          onChange={(e) => set('recording_per_day_count', e.target.value)}
          placeholder="1"
        />
      </Field>

      <Field label="固定セット" full htmlFor="rs-studio" hint="拠点・カメラ数などの自由記述（例: 用賀 SKY STUDIO・3カメラ）。予約そのものは案件詳細の「予約」で押さえます">
        <Input
          id="rs-studio"
          value={v.fixed_studio_note}
          onChange={(e) => set('fixed_studio_note', e.target.value)}
          placeholder="用賀 SKY STUDIO・3カメラ"
        />
      </Field>

      <Field label="回の単価" htmlFor="rs-price" hint="今の単価。改定しても過去に作った回の金額は動きません">
        <div className="flex items-center gap-2">
          <span className="text-sub shrink-0 text-muted-foreground">¥</span>
          <Input
            id="rs-price" type="number" min="0" inputMode="numeric"
            value={v.episode_unit_price}
            onChange={(e) => set('episode_unit_price', e.target.value)}
            placeholder="84000"
          />
        </div>
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
