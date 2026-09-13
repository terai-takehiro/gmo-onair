/**
 * 運営マニュアル — 差し込みブロックのレジストリ（唯一の正）
 * 設計: docs/design/v4/production-manual.md §4-3（カタログ）・§5-2（ブロックの形）
 *
 * `miniapps.ts` と同じ作法: ここに1件足す＝カタログに1件出る。読み手（サーバーの
 * resolver・`server/src/contexts/qsheet/services/manual-resolve.service.ts`）と
 * 描き手（クライアントの `client-techops/src/pages/opsmanual/linked/*`）は
 * このファイルの `ManualLinkedBlockKey` を鍵に対応させる。
 *
 * v1 で作るのは太字5群・12種（§4-3）。カレンダー（スタジオ予約）・計時（目標尺）・
 * テロップCG（テロップ一覧）は段Cのあとに1つずつ足す。
 *
 * ── サーバー側との複製 ──────────────────────────────────────────
 * サーバーは `server/src/` の外を import できないため、
 * `server/src/shared/production/manualBlocks.ts` に**意図的に複製**してある。
 * `scripts/check-collab-parity.mjs` の `PAIRS` が一致を検査する。
 *
 * ── 秘密（`hasSecrets`） ─────────────────────────────────────────
 * `streaming.list`（配信のストリームキー）・`streaming.webMeeting`（WEB会議のパスコード）
 * だけ true。§7-2 のとおり、`resolve` はこの2種のときだけ `link.reveal` の有無を見て
 * 平文/伏せ字を出し分ける。他のブロックは常に平文（そもそも秘密を持たない）。
 */

export type ManualLinkedBlockKey =
  | "project.heading"
  | "project.team"
  | "schedule.day"
  | "schedule.loadInOut"
  | "sheet.rundown"
  | "sheet.excerpt"
  | "sheet.micAssignment"
  | "recording.list"
  | "streaming.list"
  | "streaming.webMeeting"
  | "rental.list"
  | "equipment.lending";

/** カタログ画面での束ね方（§4-3「ミニアプリごとに束ね」）。`MiniAppKey` とは意図的に別物
 *  （`project`/`equipment` は `miniapps.ts` の対象外 = 案件管理・機材管理は techops のミニアプリではない） */
export type ManualLinkedSourceGroup =
  | "project"
  | "schedule"
  | "sheet"
  | "recording"
  | "streaming"
  | "rental"
  | "equipment";

export const MANUAL_LINKED_SOURCE_LABEL: Record<ManualLinkedSourceGroup, string> = {
  project: "案件管理",
  schedule: "スケジュール表",
  sheet: "進行台本",
  recording: "収録設定",
  streaming: "配信設定",
  rental: "レンタル機材検索",
  equipment: "機材管理",
};

export interface ManualLinkedBlockDef {
  key: ManualLinkedBlockKey;
  sourceGroup: ManualLinkedSourceGroup;
  /** カタログのカードに出す名前（§4-3「ブロック」列） */
  label: string;
  /** カタログのカードに出す説明（§4-3「中身」列） */
  description: string;
  /** true のときキャンバスに出る値は既定で伏せ字。差し込むときのチェックを外すと解除できる（§7-2） */
  hasSecrets: boolean;
  /** 置いたときの既定サイズ（mm） */
  defaultSize: { w: number; h: number };
  /** true のとき既定で等幅（`tnum`）。表・時刻・番号を持つブロック（§6-5-1） */
  defaultTabular?: boolean;
}

export const MANUAL_LINKED_BLOCKS: ManualLinkedBlockDef[] = [
  {
    key: "project.heading",
    sourceGroup: "project",
    label: "見出し",
    description: "案件名・管理番号・回・日付・会場",
    hasSecrets: false,
    defaultSize: { w: 180, h: 24 },
  },
  {
    key: "project.team",
    sourceGroup: "project",
    label: "体制・連絡先",
    description: "メンバーの役割・氏名・電話（出す項目を選ぶ）",
    hasSecrets: false,
    defaultSize: { w: 120, h: 60 },
    defaultTabular: true,
  },
  {
    key: "schedule.day",
    sourceGroup: "schedule",
    label: "当日の流れ",
    description: "時系列リスト／列×時間の表／抜粋。列と時間帯を選ぶ",
    hasSecrets: false,
    defaultSize: { w: 200, h: 100 },
    defaultTabular: true,
  },
  {
    key: "schedule.loadInOut",
    sourceGroup: "schedule",
    label: "搬入出",
    description: "搬入・搬出の枠だけ抜き出す",
    hasSecrets: false,
    defaultSize: { w: 120, h: 40 },
    defaultTabular: true,
  },
  {
    key: "sheet.rundown",
    sourceGroup: "sheet",
    label: "進行表",
    description: "項目・尺・担当。出す列を選ぶ",
    hasSecrets: false,
    defaultSize: { w: 220, h: 120 },
    defaultTabular: true,
  },
  {
    key: "sheet.excerpt",
    sourceGroup: "sheet",
    label: "台本の抜粋",
    description: "セクションを選んでそのまま載せる",
    hasSecrets: false,
    defaultSize: { w: 180, h: 100 },
  },
  {
    key: "sheet.micAssignment",
    sourceGroup: "sheet",
    label: "マイク割り",
    description: "出演者 × マイク Ch",
    hasSecrets: false,
    defaultSize: { w: 100, h: 60 },
    defaultTabular: true,
  },
  {
    key: "recording.list",
    sourceGroup: "recording",
    label: "収録の一覧",
    description: "デッキ・形式・保存先",
    hasSecrets: false,
    defaultSize: { w: 180, h: 60 },
    defaultTabular: true,
  },
  {
    key: "streaming.list",
    sourceGroup: "streaming",
    label: "配信先の一覧",
    description: "ENC・セッション名・方式・行き先（鍵は伏せ字）",
    hasSecrets: true,
    defaultSize: { w: 200, h: 70 },
    defaultTabular: true,
  },
  {
    key: "streaming.webMeeting",
    sourceGroup: "streaming",
    label: "WEB会議",
    description: "ツール・URL・入り方（パスコードは伏せ字）",
    hasSecrets: true,
    defaultSize: { w: 140, h: 40 },
  },
  {
    key: "rental.list",
    sourceGroup: "rental",
    label: "借りる機材",
    description: "品目・数量・会社・受渡し",
    hasSecrets: false,
    defaultSize: { w: 180, h: 70 },
    defaultTabular: true,
  },
  {
    key: "equipment.lending",
    sourceGroup: "equipment",
    label: "持ち出す機材",
    description: "社内の貸出リスト",
    hasSecrets: false,
    defaultSize: { w: 160, h: 60 },
    defaultTabular: true,
  },
];

export function manualLinkedBlockDef(key: string): ManualLinkedBlockDef | undefined {
  return MANUAL_LINKED_BLOCKS.find((b) => b.key === key);
}

/** カタログ画面用: ミニアプリごとに束ねる（§4-3「ミニアプリごとに束ね」）。空の群は含めない */
export function manualLinkedBlocksByGroup(): { group: ManualLinkedSourceGroup; label: string; blocks: ManualLinkedBlockDef[] }[] {
  const groups: ManualLinkedSourceGroup[] = ["project", "schedule", "sheet", "recording", "streaming", "rental", "equipment"];
  return groups
    .map((group) => ({
      group,
      label: MANUAL_LINKED_SOURCE_LABEL[group],
      blocks: MANUAL_LINKED_BLOCKS.filter((b) => b.sourceGroup === group),
    }))
    .filter((g) => g.blocks.length > 0);
}
