// 本番の実尺 (qsheet_cue_actuals) を進行 (OnAir) から送るだけの薄いラッパー。
//
// **await しない・例外を握り潰す・再送しない**。本番中に画面へ一切影響させないため。
// 設計: docs/design/v4/qsheet-v4-coding/impl/01-cue-actuals-impl.md §6-5
import api from './api';
import type { CueActualInput } from '@gmo-onair/shared/src/qsheet/cueActuals';

/** 実尺を1件送る。fire-and-forget — 呼び出し側は結果を待たない。 */
export function postCueActual(documentId: string, input: CueActualInput): void {
  void api
    .post(`/techops/runs/${documentId}/cues`, input, { timeout: 5000 })
    .catch(() => { /* 本番中。何も出さない (best-effort) */ });
}
