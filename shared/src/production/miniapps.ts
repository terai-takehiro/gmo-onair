// 制作資料（Qシート）の「ミニアプリ」レジストリ — **唯一の正**。
//
// ここに載っていないミニアプリは一覧・ジャーニーに出ない
// （`docs/design/v4/qsheet-v4-coding/01-app-structure.md` §3-2 の決めごと）。
//
// ⚠️ **React も lucide も import しない**（`docNoSeq` の重複検査などサーバーからも読む純データ）。
// アイコン・色は `client-qsheet/src/miniapps/ui.tsx` 側に分ける。
//
// ── この段（08・収録設定/配信設定）で足した `kind` 判別子 ─────────────────
//
// 01 §3-2 が定義した `MiniAppDef`（`docPrefix`/`docNoSeq`/`table`/`docPath` が全部必須）は
// 「資料が複数ある道具」（進行台本・スケジュール表）しか表せない。収録設定・配信設定は
// **案件に1セットだけ持つ道具**で、資料番号も一覧も個別 URL も持たない
// （`docs/design/v4/qsheet-v4-coding/impl/08-recording-streaming-impl.md` §10-2）。
// そこでこのファイルでは `kind: 'document' | 'panel'` を足し、`MiniAppDef` を
// 判別可能な union にした（同 §10-2 の提案どおり）。`kind: 'panel'` のときは
// `docPrefix` 以下を**持たせない**（型で強制する）。
//
// ⚠️ **`sheet` / `schedule`（`kind: 'document'`）はこの PR ではまだ登録していない。**
// 01 段（`shared/src/production/miniapps.ts` 本体・`qsheet_documents.doc_no`・
// `qsheet_schedules` テーブル）がこのリポジトリにまだ無く、存在しない表・存在しない列
// （`docNoSeq: 'prod_doc_sb'` 等）を指すエントリを書くと実体の無い参照になるため。
// 01 が着手されたら、この `MiniAppKey` に `'sheet' | 'schedule'` を足し、
// `MINI_APPS` に `kind: 'document'` の2件を追加すること（`Record<MiniAppKey, MiniAppDef>` が
// 網羅を型で強制するので、足し忘れるとビルドが落ちる）。09（計時・視聴者＝`live`）も同様。

/** URL・API・数の集計キーに出る安定キー。**あとから変えない** */
export type MiniAppKey = 'recording' | 'streaming';

export type MiniAppKind = 'document' | 'panel';

/** 制作のジャーニー（当日の枠 → 番組の流れ → 台本）のどこに出す道具か。
 *  収録設定・配信設定は縦のジャーニーに乗らない「横に並ぶ技術の仕込み」なので
 *  `stages` を持たない（08 §7）。 */
export type JourneyStage = 'day' | 'flow' | 'script';

interface MiniAppBase {
  key: MiniAppKey;
  /** 画面に出す名前。**ここ以外に書かない** */
  label: string;
  /** 一覧画面の名前（省略時は label） */
  listLabel?: string;
  enabled: boolean;
}

/** 資料が複数ある道具（進行台本・スケジュール表）。01 段でまだ未登録（上のコメント参照） */
export interface MiniAppDocumentDef extends MiniAppBase {
  kind: 'document';
  /** 資料番号の接頭辞。**重複禁止** */
  docPrefix: string;
  /** 採番の seq_name。**重複禁止** */
  docNoSeq: string;
  /** 資料を入れる表。doc_no 列を持つこと */
  table: string;
  /** 一覧の URL */
  listPath: string;
  /** 資料1件の URL のひな形。`:id` を置換して使う */
  docPath: string;
  stages: JourneyStage[];
}

/** 案件に1セットだけ持つ道具（収録設定・配信設定・計時LIVE）。資料番号も一覧も持たない */
export interface MiniAppPanelDef extends MiniAppBase {
  kind: 'panel';
  /** 画面の URL のひな形。`:ownerKey` を置換して使う（`qsheet_recording_settings` 等の owner キー） */
  path: string;
}

export type MiniAppDef = MiniAppDocumentDef | MiniAppPanelDef;

export const MINI_APPS: MiniAppDef[] = [
  {
    kind: 'panel',
    key: 'recording',
    label: '収録設定',
    path: '/qsheet/recording/:ownerKey',
    enabled: true,
  },
  {
    kind: 'panel',
    key: 'streaming',
    label: '配信設定',
    path: '/qsheet/streaming/:ownerKey',
    enabled: true,
  },
];

export const MINI_APP_BY_KEY: Record<MiniAppKey, MiniAppDef> = MINI_APPS.reduce(
  (acc, app) => ({ ...acc, [app.key]: app }),
  {} as Record<MiniAppKey, MiniAppDef>
);

export function enabledMiniApps(): MiniAppDef[] {
  return MINI_APPS.filter((a) => a.enabled);
}

/** `panel` のひな形 URL に owner キーを埋める（`document` の `docPath` は `:id` 置換のため使わない） */
export function panelPathOf(key: MiniAppKey, ownerKey: string): string {
  const app = MINI_APP_BY_KEY[key];
  if (app.kind !== 'panel') {
    throw new Error(`panelPathOf: '${key}' は panel ではありません（kind=${app.kind}）`);
  }
  return app.path.replace(':ownerKey', encodeURIComponent(ownerKey));
}
