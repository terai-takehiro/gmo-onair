/**
 * 回のある案件か ＋ レギュラーの取り決め — カード1枚
 *
 * 案件作成（PC・スマホ）と案件を直す（PC・スマホ）の**4つの呼び出し元**が同じ
 * 見出し・説明文・カードの形を書き写さないための薄いラッパー。
 *
 * ── 「回のある案件か」をこのカードの見出し行に置いた ────────────
 *
 * 元はこの欄が「進んだら聞く」（畳んである枠）の中にあり、そこで
 * `regular` を選ぶと**枠の外に**このカードが生えていました。
 * 依存する欄（取り決め）が、依存される欄（回のある案件か）と別の枠にあり、
 * しかも作る画面では枠が畳まれているので、レギュラー案件を登録する人は
 * 「畳んだ枠を開く → 中の欄を選ぶ → 枠の外に出たカードを探す」ことになります
 * （`docs/design/v4/_form-order.md`「依存する欄は、依存される欄より下に置く」）。
 * → **決める欄とその結果を1枚のカードに入れ、選んだ場所の真下に取り決めが開く**
 * 形にしました。単発のままなら欄1つぶんのカードで終わります。
 *
 * `RegularSeriesFields` 自身も `recurrence !== 'regular'` の判定を持つが、
 * ここでも見るのは**見出し（レギュラーの取り決め）と説明文まで含めて畳む**ため。
 */
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RegularSeriesFields } from './RegularSeriesFields';
import { RECURRENCE_LABEL, type ProjectFieldsState } from './fields';
import { Field } from './Field';

export function RegularSeriesSection({ f }: { f: ProjectFieldsState }) {
  const { v, set } = f;
  const isRegular = v.recurrence === 'regular';
  return (
    <div className={`rounded-card border bg-card px-4 py-4 lg:px-5 ${isRegular ? 'border-primary-border' : 'border-border'}`}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="回のある案件か" hint="レギュラーは「回」を持ちます（第1回・7月分…）">
          <Select value={v.recurrence} onValueChange={(x) => set('recurrence', x as 'single' | 'regular')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(RECURRENCE_LABEL) as ('single' | 'regular')[]).map((k) => (
                <SelectItem key={k} value={k}>{RECURRENCE_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {isRegular && (
        <div className="mt-4 border-t border-border-faint pt-4">
          <p className="text-cardtitle mb-1">レギュラーの取り決め</p>
          <p className="text-note mb-3 text-muted-foreground">
            回を作るたびに聞かれません。「回を追加」の「頻度で作る」の既定値になります
          </p>
          <RegularSeriesFields f={f} />
        </div>
      )}
    </div>
  );
}
