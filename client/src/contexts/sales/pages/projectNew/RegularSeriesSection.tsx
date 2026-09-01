/**
 * レギュラーの取り決め — カード1枚（見出し・説明 + `RegularSeriesFields`）
 *
 * 案件作成（PC・スマホ）と案件を直す（PC・スマホ）の**4つの呼び出し元**が同じ
 * 見出し・説明文・カードの形を書き写さないための薄いラッパー。
 * `recurrence !== 'regular'` のときは何も描かない — `RegularSeriesFields` 自身も
 * 同じ判定を持つが、ここで先に弾かないと**空のカードの枠だけ**が残る。
 */
import { RegularSeriesFields } from './RegularSeriesFields';
import type { ProjectFieldsState } from './fields';

export function RegularSeriesSection({ f }: { f: ProjectFieldsState }) {
  if (f.v.recurrence !== 'regular') return null;
  return (
    <div className="rounded-card border border-primary-border bg-card px-4 py-4 lg:px-5">
      <p className="text-cardtitle mb-1">レギュラーの取り決め</p>
      <p className="text-note mb-3 text-muted-foreground">
        回を作るたびに聞かれません。「回を足す」の「頻度で作る」の既定値になります
      </p>
      <RegularSeriesFields f={f} />
    </div>
  );
}
