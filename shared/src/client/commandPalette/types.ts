// ⌘K の型 (§4.5 / デザイン 6a)
//
// 3グループ:
//   やる   (do)    操作。まず何をしたいかで探せるように、場所より先に出す
//   ひらく (open)  場所。パスを併記する
//   見つかった案件・お客様 (hit)  既存の GET /search の結果

export type CommandKind = 'do' | 'open';

export interface CommandDef {
  id: string;
  kind: CommandKind;
  /** 画面に出す名前 */
  label: string;
  /** やる の1行説明 (ひらく はパスを出すので不要) */
  hint?: string;
  /** 行き先 (絶対パス)。別アプリのパスもそのまま書く */
  path: string;
  /** 当たり語。ローマ字・かな・旧名称などを空白区切りで */
  keywords?: string;
  /** このモジュール権限を持つ人にだけ出す */
  module?: string;
  /** いずれかの権限を持つ人に出す (module より優先) */
  modules?: string[];
  /** system_admin にだけ出す */
  adminOnly?: boolean;
}

/** GET /search の結果を1行に写したもの */
export interface PaletteHit {
  id: string;
  /** 案件名・顧客名 */
  name: string;
  /** 顧客名・略称など2行目 */
  sub?: string;
  /** GLS番号・コード */
  code?: string;
  /** ステージ・種別 */
  badge?: string;
  path: string;
}

/**
 * 検索の結果。**権限で外れた種類も返す** (36章)。
 *
 * 「案件 0件」と出すと「無い」と読めてしまうが、実際は「見せてもらえない」なので
 * 意味が違う。**件数は出さず、種類の名前だけ**を伝えて画面に書く。
 */
export interface PaletteSearchResult {
  hits: PaletteHit[];
  /** 権限が無くて探していない種類 (名前だけ) */
  hiddenKinds?: string[];
  /** 見つかった総数 (画面が「すべて見る」を出すのに使う) */
  total?: number;
}

export interface PaletteAccess {
  role?: string;
  permissions?: Record<string, string>;
}
