/**
 * server 側の複製 — 正は `shared/src/production/journey.ts`。
 *
 * サーバーは `server/src/` の外を import できない（`tsconfig.json` の `rootDir`）ため、
 * ここに**意図的に複製**してある。`scripts/check-collab-parity.mjs` の `PAIRS` が
 * 実装（コメント以外の行）の一致を検査する。**直すときは両方を同時に直すこと。**
 */
import type { MiniAppKey } from './miniapps';

/** ジャーニーの3段。**必ずこの順**（day → flow → script）で扱う */
export type JourneyStage = 'day' | 'flow' | 'script';

/** その段に何かがあるかの3値。**「止まっている」判定には使わない** — `blank` は「まだ何も無い」であって「遅れている」ではない */
export type HintTone = 'blank' | 'touched' | 'recent';

/** 段ごとの手がかり。`facts` は形容詞を持たない（✗「まだ足りない」／○「3件・4日前に更新」） */
export interface StageHint {
  stage: JourneyStage;
  tone: HintTone;
  facts: Array<{ key: string; label: string; count?: number; at?: string }>;
}

/**
 * 枠（スケジュール表の1行）と台本の対。
 *
 * ⚠️ 段3の時点では `qsheet_schedule_items` が存在しないため、`JourneyDay.frames`
 * は常に空配列で返す。型は今のうちに確定させ、中身は段4（`02-schedule.md`）で埋める。
 */
export interface JourneyFrame {
  scheduleId: string;
  itemId: string;
  columnLabel: string;
  title: string;
  kind: string;
  /** その日の 00:00 JST からの分 */
  startMin: number;
  endMin: number;
  /** null = まだ台本が無い */
  documentId: string | null;
  /** id はあるが JOIN が外れた＝台本が消されている */
  linkBroken: boolean;
  /** 枠の長さ − 台本の合計尺（分）。**両方あるときだけ**。索引が無い間は常に null */
  durationGapMin: number | null;
}

/**
 * 「次に決めること」のキー。**5件すべてをここに定義する**
 * （`dismissed` の記録の鍵になるため、あとから足すと過去の「無視した」記録が拾えなくなる）。
 * 段3で実際に出す関数を持つのは `no_sheet` / `sheet_no_rows` の2件だけ。
 */
export const SUGGESTION_KEYS = [
  'no_schedule',
  'no_sheet',
  'sheet_no_rows',
  'duration_gap',
  'mic_unassigned',
] as const;
export type SuggestionKey = (typeof SUGGESTION_KEYS)[number];

export interface Suggestion {
  key: SuggestionKey;
  label: string;
  /** 作れないときは null（黙って何も起きない導線を作らない） */
  to: string | null;
}

/** その日のジャーニー。`stages` は常に3件・必ず day→flow→script の順 */
export interface JourneyDay {
  /** 'YYYY-MM-DD'。null = 日が決まっていない資料 */
  date: string | null;
  /** その日の見出し（エピソードコード・回数・会場）。無ければ null */
  label: string | null;
  stages: StageHint[];
  docs: Array<{ app: MiniAppKey; id: string; title: string; docNo: string | null; updatedAt: string }>;
  frames: JourneyFrame[];
  suggestions: Suggestion[];
}

export interface JourneyResponse {
  /**
   * 案件単位・番組（マニュアル）単位のジャーニーで持つ。資料単体のジャーニーは常に null
   * （画面は days[].docs から資料名を取る）。**番組（マニュアル）のときも同じ形で返す**
   * （`glsNumber` は常に null）— 型を2つに割ると呼ぶ側の分岐が増える
   */
  project: { id: string; name: string; glsNumber: string | null } | null;
  days: JourneyDay[];
}

/** トップページの4束。件数だけ返す（見える範囲で絞ってから数える） */
export type ScopeGroup = 'in_progress' | 'pre_project' | 'neta' | 'standalone';

export interface ScopeCard {
  group: ScopeGroup;
  count: number;
}

export type MarkKind = 'settled' | 'watch' | 'dismissed';
/** 'program' は番組（マニュアル・案件管理外）。migration 227 で CHECK に足した */
export type MarkScopeType = 'project' | 'document' | 'program';

export interface JourneyMark {
  id: string;
  scopeType: MarkScopeType;
  scopeId: string;
  targetDate: string | null;
  stage: JourneyStage;
  kind: MarkKind;
  hintKey: string | null;
  note: string | null;
  createdBy: string;
  createdAt: string;
  clearedAt: string | null;
}
