/**
 * 制作技術支援トップ「続きから」— 閲覧履歴（端末ごとの `localStorage`）。
 *
 * サーバーには保存しない（モックの決めごと通り・`docs/design/v4/production-v4-native-mockups.md`
 * 「①′ トップページ」参照）。JourneyPage（ハブ画面）を開くたびに `recordRecentTop` を呼び、
 * ProductionTopPage が `listRecentTop` で読んで新しい順に並べる。
 *
 * ⚠️ 端末（ブラウザ）ごとで、利用者ごとには分けていない。共有端末では前の人の履歴が
 * 見える（このアプリの他の localStorage 利用 — 印刷ページモード等 — と同じ簡略化）。
 */
const STORAGE_KEY = "qs_top_recents";
const MAX_ENTRIES = 8;

export type RecentTopKind = "project" | "program";

export interface RecentTopEntry {
  kind: RecentTopKind;
  id: string;
  name: string;
  /** ISO 日時 */
  at: string;
}

function isEntry(v: unknown): v is RecentTopEntry {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    (e.kind === "project" || e.kind === "program") &&
    typeof e.id === "string" &&
    typeof e.name === "string" &&
    typeof e.at === "string"
  );
}

function readAll(): RecentTopEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

function writeAll(entries: RecentTopEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // プライベートモード等で書けなくても致命的ではない。黙って諦める
  }
}

/** ハブ画面（JourneyPage・scope が project/program のとき）を開くたびに呼ぶ */
export function recordRecentTop(kind: RecentTopKind, id: string, name: string): void {
  if (!id || !name) return;
  const rest = readAll().filter((e) => !(e.kind === kind && e.id === id));
  writeAll([{ kind, id, name, at: new Date().toISOString() }, ...rest]);
}

/** トップページの「続きから」に出す分（新しい順）。件数は呼び出し側で絞る */
export function listRecentTop(): RecentTopEntry[] {
  return readAll();
}
