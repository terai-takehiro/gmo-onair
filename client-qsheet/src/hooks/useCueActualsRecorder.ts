import { useEffect, useRef } from "react";
import { genId } from "@/lib/stableIds";
import { postCueActual } from "@/lib/cueActualsApi";
import type { FlatCue } from "@/lib/buildCues";

// ============================================================
// 実尺 (qsheet_cue_actuals) の記録 — OnAirPage.tsx から抽出。
// 既存の計時ロジックには一切触らない。本番中は best-effort の
// fire-and-forget。画面の見た目・操作性は変えない。
// 設計: docs/design/v4/qsheet-v4-coding/impl/01-cue-actuals-impl.md §6-3
// ============================================================

/** OnAirPage の cue:update 送出（socket emit）が読む run 識別子。 */
export interface CueActualsRecorderHandle {
  runIdRef: React.MutableRefObject<string | null>;
  runStartedAtRef: React.MutableRefObject<string | null>;
}

export function useCueActualsRecorder(
  id: string | undefined,
  cues: FlatCue[],
  cur: number,
  running: boolean,
  paused: boolean
): CueActualsRecorderHandle {
  const runIdRef = useRef<string | null>(null);
  const runStartedAtRef = useRef<string | null>(null);
  const cueEnterAtRef = useRef<number | null>(null); // 現在キューに入った時刻 (ms)
  const pausedMsRef = useRef(0); // 現在キュー内で止まっていた合計 (ms)
  const pauseBeganRef = useRef<number | null>(null);
  const prevCurRef = useRef(-1);
  const passCountRef = useRef<Map<string, number>>(new Map());
  const wasRunningRef = useRef(false);

  // 出て行くキューを1件記録する。section.id を持たないキューは黙って飛ばす (§2-3)。
  const flushCueActual = (cueIdx: number) => {
    const runId = runIdRef.current;
    const enterAt = cueEnterAtRef.current;
    if (!id || !runId || enterAt == null || cueIdx < 0 || cueIdx >= cues.length) return;
    const c = cues[cueIdx];
    if (!c.sectionId) return;
    const pausedNow =
      pausedMsRef.current + (pauseBeganRef.current != null ? Date.now() - pauseBeganRef.current : 0);
    const actual = Math.max(0, Math.round((Date.now() - enterAt - pausedNow) / 1000));
    const key = `${c.sectionId}|${c.rowId ?? ""}`;
    postCueActual(id, {
      run_id: runId,
      run_started_at: runStartedAtRef.current!,
      section_id: c.sectionId,
      row_id: c.rowId ?? null,
      pass_no: passCountRef.current.get(key) ?? 1,
      cue_index: cueIdx,
      planned_sec: c.duration ?? null,
      actual_sec: actual,
    });
  };

  // ① 一時停止の計上 (tog() は触らない)。cueEl は running && !paused でしか進まないため、
  //    実尺には壁時計 (Date.now()) から止まっていた分を引く方式を使う。
  useEffect(() => {
    if (paused) {
      pauseBeganRef.current = Date.now();
    } else if (pauseBeganRef.current != null) {
      pausedMsRef.current += Date.now() - pauseBeganRef.current;
      pauseBeganRef.current = null;
    }
  }, [paused]);

  // ② run の開始・終了。
  //    - running: false -> true で run を立てる (go() でも cue:play 経由でも通る)。
  //    - running: true -> false は「最終キューで next() が running を false にしたが
  //      cur は動かさない」場合の救済 (③ の cur effect だけでは最後の1キューが記録されない)。
  //      ESC (stop()) で cur が -1 になったときは ③ 側でも同じキューが流れうるが、
  //      ON CONFLICT DO NOTHING が無害化する (二重に流れても構造的に安全)。
  useEffect(() => {
    if (running && !wasRunningRef.current) {
      runIdRef.current = genId("run");
      runStartedAtRef.current = new Date().toISOString();
      passCountRef.current.clear();
      pausedMsRef.current = 0;
      pauseBeganRef.current = null;
      cueEnterAtRef.current = Date.now();
    } else if (!running && wasRunningRef.current) {
      flushCueActual(cur);
    }
    wasRunningRef.current = running;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  // ③ キューの切り替わり (本体)。ランダウンが既にやっている形 (RundownPage.tsx) と同じ。
  //    ⚠️ cues は毎レンダー作り直される配列 (useMemo 無し) なので依存配列には入れない
  //    (入れると effect が毎レンダー走る)。操作の出どころ (キーボード / CM 自動送り /
  //    ランダウンからの cue:*) に関係なく、cur の変化だけを見れば全部拾える。
  useEffect(() => {
    const prev = prevCurRef.current;
    prevCurRef.current = cur;
    if (prev === cur) return;

    if (prev >= 0) flushCueActual(prev); // 出て行ったキューを記録する

    if (cur >= 0 && cur < cues.length) {
      const c = cues[cur];
      if (c.sectionId) {
        const key = `${c.sectionId}|${c.rowId ?? ""}`;
        passCountRef.current.set(key, (passCountRef.current.get(key) ?? 0) + 1);
      }
    }

    cueEnterAtRef.current = cur >= 0 ? Date.now() : null;
    pausedMsRef.current = 0;
    pauseBeganRef.current = null;
    if (cur < 0) {
      runIdRef.current = null;
      runStartedAtRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur]);

  return { runIdRef, runStartedAtRef };
}
