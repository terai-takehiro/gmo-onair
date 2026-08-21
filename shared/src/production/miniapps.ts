/**
 * 制作資料 v4 — ミニアプリのレジストリ（唯一の正）
 *
 * 「制作資料」というブロックアプリの中には、性質の違う道具が複数入る
 * （進行台本＝Qシート・スケジュール表＝香盤表）。この表がその一覧で、
 * 名前・資料番号の接頭辞・置き場所の表・URL をここに書けば、
 * 一覧・件数・作成メニュー・MCP の対象が全部そこから決まる。
 *
 * ── なぜここに置くか（`shared/src/client/` ではない） ─────────────
 * `shared/src/production/` は、どのアプリの Tailwind `content` にも入っていない。
 * つまりクラス名を1つも書かない純データ・純関数である限り、
 * ここに置いても凍結アプリの CSS には1バイトも影響しない。
 *
 * ── なぜ `client-qsheet/` に置かないか ──────────────────────────
 * `docPrefix` / `docNoSeq` は**サーバーが採番に使う**（`docNo.service.ts`）。
 * client にしか無いと、サーバーが同じ文字列を書き写すことになり、
 * 必ず片方だけ変わる。MCP（サーバー側）からも参照するため。
 *
 * ── サーバー側との複製 ──────────────────────────────────────────
 * サーバーは `server/src/` の外を import できないため、
 * `server/src/shared/production/miniapps.ts` に**意図的に複製**してある。
 * `scripts/check-collab-parity.mjs` の `PAIRS` が一致を検査する
 * （コメントの差は許容し、実装が1行でも違えば止める）。
 *
 * ── `AppTiles.tsx` の `MINI_APPS` とは別物 ──────────────────────
 * `client/src/contexts/platform/pages/home/AppTiles.tsx:79` に同名の
 * 定数が既にあるが、あちらは「日常業務のタイル内リンク」で無関係。
 * `grep MINI_APPS` が2件返すことを承知の上で、レジストリ側の名前は動かさない
 * （01 §3-2 と 05-mcp.md が参照するため）。
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
 * `schedule` は段4（`02-schedule.md` の実装）で `true` にした。`qsheet_schedules` と
 * `/qsheet/schedules` が存在するようになったため、左メニュー・「＋新しく作る」に出してよい。
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
    enabled: true,
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
