/**
 * server 側の複製 — 正は `shared/src/production/miniapps.ts`。
 *
 * サーバーは `server/src/` の外を import できない（`tsconfig.json` の `rootDir`）ため、
 * ここに**意図的に複製**してある。`scripts/check-collab-parity.mjs` の `PAIRS` が
 * 実装（コメント以外の行）の一致を検査する。**直すときは両方を同時に直すこと。**
 */
import type { JourneyStage } from './journey';

/** ミニアプリのキー。URL・API・集計キーに出る安定キー。**あとから変えない** */
export type MiniAppKey = 'sheet' | 'schedule';

export interface MiniAppDef {
  key: MiniAppKey;
  /** 画面と帳票に出す名前。**ここ以外に書かない**。`Qシート` / `qsheet` は内部識別子のみに残す */
  label: string;
  /** 資料番号の接頭辞。**重複禁止・変えない**（配った番号が意味を失う） */
  docPrefix: string;
  /** `sequences.seq_name`。**重複禁止・変えない**（連番が飛ぶ） */
  docNoSeq: string;
  /** 資料を入れる表（`doc_no` 列を持つこと） */
  table: string;
  /** 一覧の URL */
  listPath: string;
  /** 資料1件の URL のひな形（`:id` を置換する） */
  docPath: string;
  /** 主に効くジャーニーの段 */
  stages: JourneyStage[];
  /** `false` の間はレジストリ由来の導線に出さない（押すと 404 になる項目を作らない） */
  enabled: boolean;
}

/**
 * 初期値。**2件で打ち止め。増やすときは1件ずつ**。
 *
 * ⚠️ `schedule` は段3の時点では `false`。`qsheet_schedules` も `/qsheet/schedules` も
 * まだ存在しないため、`true` にすると左メニューと「＋新しく作る」に
 * 押すと 404 になる項目が出る。段4（`02-schedule.md` の実装）で `true` に変える。
 */
export const MINI_APPS: MiniAppDef[] = [
  {
    key: 'sheet',
    label: '進行台本',
    docPrefix: 'SB',
    docNoSeq: 'prod_doc_sb',
    table: 'qsheet_documents',
    listPath: '/qsheet/sheets',
    docPath: '/qsheet/editor/:id',
    stages: ['flow', 'script'],
    enabled: true,
  },
  {
    key: 'schedule',
    label: 'スケジュール表',
    docPrefix: 'SD',
    docNoSeq: 'prod_doc_sd',
    table: 'qsheet_schedules',
    listPath: '/qsheet/schedules',
    docPath: '/qsheet/schedules/:id',
    stages: ['day'],
    enabled: false,
  },
];

/** キーで引く */
export const MINI_APP_BY_KEY: Record<MiniAppKey, MiniAppDef> = Object.fromEntries(
  MINI_APPS.map((a) => [a.key, a]),
) as Record<MiniAppKey, MiniAppDef>;

/** `docPath` のひな形から `:id` を置換した実 URL を作る */
export function docPathOf(key: MiniAppKey, id: string): string {
  return MINI_APP_BY_KEY[key].docPath.replace(':id', id);
}

/** `docPath` のひな形から `:id` より前の固定部分だけを取り出す（前方一致に使う） */
function docPathPrefix(docPath: string): string {
  const idx = docPath.indexOf(':id');
  return idx >= 0 ? docPath.slice(0, idx) : docPath;
}

/**
 * URL からミニアプリを判定する。`apps.ts` の `appOfPath` と同じ作法で
 * **長い path から先に見る**（短い prefix が先に一致して誤判定するのを防ぐ）。
 */
export function miniAppOfPath(pathname: string): MiniAppDef | undefined {
  const candidates = MINI_APPS.flatMap((app) => [
    { app, prefix: app.listPath },
    { app, prefix: docPathPrefix(app.docPath) },
  ]);
  return candidates
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(prefix))
    ?.app;
}

/** `enabled: true` のミニアプリだけ（左メニュー・「＋新しく作る」など導線に出す一覧） */
export function enabledMiniApps(): MiniAppDef[] {
  return MINI_APPS.filter((a) => a.enabled);
}
