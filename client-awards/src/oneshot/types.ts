export type ModuleKey =
  | 'title'
  | 'respect'
  | 'skills'
  | 'comment'
  | 'members'
  | 'recComment'
  | 'none';

export type Lang = 'ja' | 'en';

export interface NomineeMember {
  name: string;
  company: string;
  role: string;
}

export interface NomineeRecommender {
  name: string;
  nameEn: string;
  company: string;
  companyEn: string;
  position: string;
  positionEn: string;
  respect: string;
  respectEn: string;
  respectComment: string;
  respectCommentEn: string;
}

export interface Nominee {
  id: string;
  type: 'individual' | 'team';
  category: string;
  categoryEn: string;
  subcategory: string;
  subcategoryEn: string;
  entryNo: string;
  image: string;
  name: string;
  nameEn: string;
  nameKana?: string;
  company: string;
  companyEn: string;
  department: string;
  departmentEn: string;
  position?: string;
  positionEn?: string;
  location?: string;
  locationEn?: string;
  joinDate?: string;
  ism: string;
  ismEn: string;
  skills: string[];
  skillsEn: string[];
  title: string;
  titleEn: string;
  comment: string;
  commentEn: string;
  // team only
  projectName?: string;
  projectNameEn?: string;
  projectKana?: string;
  teamSize?: number;
  members?: NomineeMember[] | null;
  membersEn?: NomineeMember[] | null;
  recommender: NomineeRecommender;
}

export interface TickerItem {
  name: string;
  company: string;
}

/** 賞内の 1 部門 (ティッカーの 1 ローテーション単位) */
export interface TickerDivision {
  division: string;
  items: TickerItem[];
}

/** 賞単位のティッカーカテゴリ。1賞内の全部門を順番にループ表示する。 */
export interface TickerCategory {
  /** 賞名 (e.g., '新人賞' / 'Rookie Award') */
  award: string;
  /** 賞内の部門配列。1ループ完走後に次の部門にローテーションする。 */
  divisions: TickerDivision[];
}

export interface OneShotCueState {
  entryId: number | null;
  moduleKey: ModuleKey;
  tickerOn: boolean;
  tickerCatIdx: number;
  transparent: boolean;
  lang: Lang;
  isLive: boolean;
  /** v2.8.70+: 画像 (Portrait) を表示するか。OFF の場合は左 168px の画像エリアを畳んだ単列レイアウトになる */
  showPortrait: boolean;
  /** v2.8.74+: 日英両方表示モード。true のとき DynamicModule が JA + EN を縦スタックで描画する。
   *  ranking CG の `previewLang='both'` と同等の UX。`lang` は primary 言語 (JA を推奨) を保持する。 */
  bilingual: boolean;
}

// ── 段階1 (v2.8.71+): 動的モジュールスキーマ ────────────────
// 現行 6 + 'none' モジュールを「データ駆動の ModuleDef[] 」として表現するための型。
// 段階1 ではこの型と種データ (presetModules.ts) を用意するだけで、
// レンダラ実装は段階2、永続化 (awards_events.module_config JSONB) は段階3、
// ドラッグ&ドロップ編集 UI は段階4 で順次実装する。

/** モジュール内の 1 ブロックの描画種別。各 kind に固有のテンプレート / CSS が割当てられる。 */
export type SlotKind =
  | 'header-label'        // 上部小ラベル "▸ 推薦者の尊敬ポイント" (.lt-module-label)
  | 'header-byline'       // ヘッダー右側 "| by 名前 役職"        (.lt-module-byline)
  | 'body-title'          // タイトル本文 (左金色アクセント付き)  (.lt-module-title)
  | 'body-text'           // 本文 (汎用パラグラフ)                (.lt-module-body)
  | 'body-ism-text'       // イズム本文 (.lt-tags-ism)
  | 'body-large-quote'    // 大引用 「...」 (金色)                 (.lt-respect)
  | 'body-rec-quote'      // 推薦コメント引用 « ... » (白系)       (.lt-rec-body)
  | 'body-tags'           // チップリスト (.lt-tags + .lt-tag)
  | 'body-members-grid';  // チームメンバー 3列グリッド            (.lt-members)

/** スロットへのデータ供給元。lang は描画時に自動切替 (ja → en の対応フィールドを使用)。 */
export type SlotBinding =
  | { source: 'literal'; ja: string; en: string }
  | { source: 'nominee'; field: string }       // Nominee 直下のフィールド (例: 'title' / 'comment' / 'ism' / 'skills' / 'members')
  | { source: 'recommender'; field: string }   // nominee.recommender ネスト (例: 'name' / 'respect' / 'respectComment')
  | { source: 'oneshot_raw'; key: string };    // awards_entries.oneshot_data の raw key (Excel "そのまま保存" 列など)

/** スロット個別のスタイル拡張。段階4 で完全活用。段階1 では型のみ定義 (未読み取り)。 */
export interface SlotStyle {
  fontSize?: number;
  weight?: number;
  color?: string;
  /** 表示行数の上限 (overflow → ellipsis) */
  maxLines?: number;
}

export interface SlotDef {
  /** モジュール内ユニーク。DnD 並び替え時の React key にも使用 */
  id: string;
  kind: SlotKind;
  binding: SlotBinding;
  style?: SlotStyle;
}

/** 表示条件。team-only は projectName を持つチームエントリのみ。 */
export type ModuleVisibility = 'always' | 'team-only' | 'individual-only';

export interface ModuleDef {
  /** プリセットは 'preset:title' 等、ユーザー追加は 'custom-{uuid}' */
  id: string;
  /** 操作 UI のボタン表記 (lang 切替で表示) */
  label: { ja: string; en: string };
  /** lucide-react のアイコン名 (任意, 例: 'FileText' / 'Quote') */
  icon?: string;
  /** キーボードショートカット ('0'〜'9'). 重複は段階4 で UI 側がエラー表示。 */
  shortcutKey?: string;
  /** ピッカー行の並び順 (小さいほど左)。same value では id の辞書順で安定化。 */
  order: number;
  /** 表示条件 (default: 'always') */
  visibility?: ModuleVisibility;
  /** モジュール本体を構成するスロット (描画は配列順に縦積み。段階4 で 2D 配置に拡張可能) */
  slots: SlotDef[];
  /** 外枠幅プリセット ('default' = 1200px / 'wide' = 1500px). 段階4 で UI 編集可能。 */
  width?: 'default' | 'wide';
}

/** イベント単位の送出モジュール構成。`awards_events.module_config JSONB` (段階3) として保存予定。 */
export interface EventModuleConfig {
  version: 1;
  modules: ModuleDef[];
}
