// ⚠️ これは **`shared/src/production/miniapps.ts` の意図的な複製**。
// サーバーは `server/src/` の外を import できないため、同じ内容をここにも置いている
// （`server/src/shared/collab/yjsDoc.ts` と同じやり方）。
// `scripts/check-collab-parity.mjs` が2ファイルの一致（コメント除く）を検査する。
// **直すときは両方直すこと。**

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
