// Wiki — クライアント用の型（docs/design/v4/wiki.md §5・§4-4）
//
// ⚠️ サーバーは複製しない。サーバーは Express の req.body を自前で検証するので、
// 型を共有しても検査が増えない（`shared/src/schedule/types.ts` と同じ判断）。
// 共有するのは「画面とサーバーが同じ形だと思っているもの」だけ。

/** ページの状態。下書きは検索にも AI の出典にも出ない */
export type WikiPageStatus = 'draft' | 'published' | 'archived';

/** ページの種類。database = 行（子ページ）を持つ親（§4-4） */
export type WikiPageKind = 'page' | 'database';

/** スペースの閲覧範囲。members のときだけ wiki_space_members を見る（§8） */
export type WikiSpaceVisibility = 'all' | 'members';

/** 権限の段（区画 `wiki`）。閲覧は全員の既定 */
export type WikiRole = 'reader' | 'editor' | 'manager';

export interface WikiSpace {
  id: string;
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  visibility: WikiSpaceVisibility;
  owner_user_id: string | null;
  owner_name?: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  /** 一覧で出す件数（公開ページだけ数える） */
  page_count?: number;
  /** 一覧で出す最終更新（配下のページの最大） */
  last_updated_at?: string | null;
  /** visibility='members' のときの人数 */
  member_count?: number;
}

/** ツリーの1行。本文は持たない（木を描くだけなので軽くする） */
export interface WikiTreeNode {
  id: string;
  space_id: string;
  parent_id: string | null;
  sort_order: number;
  title: string;
  icon: string | null;
  status: WikiPageStatus;
  kind: WikiPageKind;
  /** 子がいるか。ツリーの折りたたみの印 */
  has_children: boolean;
}

export interface WikiPage {
  id: string;
  space_id: string;
  space_key?: string;
  space_name?: string;
  parent_id: string | null;
  sort_order: number;
  title: string;
  /** ★ 本文の正。Markdown の文字列そのもの */
  body_md: string;
  icon: string | null;
  status: WikiPageStatus;
  is_template: boolean;
  kind: WikiPageKind;
  /** データベースの行のときの項目の値（項目 id → 値） */
  props: Record<string, WikiPropValue>;
  tags: string[];
  owner_user_id: string | null;
  owner_name?: string | null;
  /**
   * 見直し予定日。任意・既定なし（§10 #10）。"YYYY-MM-DD"
   * ⚠️ 画面では「期限切れ」と言わない（過ぎても中身は無効にならない）。バッジは「要見直し」
   */
  review_by: string | null;
  /** 保存のたびに +1。画面では「第N版」 */
  rev: number;
  /** AI が下書きしたページのとき、その出力の id（画面は「AI作成」の札） */
  ai_output_id: string | null;
  locked_by: string | null;
  locked_by_name?: string | null;
  locked_at: string | null;
  lock_requested_by: string | null;
  lock_requested_by_name?: string | null;
  created_by: string | null;
  creator_name?: string | null;
  created_at: string;
  updated_by: string | null;
  updater_name?: string | null;
  /** 楽観ロックの突き合わせに使う（保存時に添える） */
  updated_at: string;
  published_at: string | null;
  /** パンくず（スペース直下から自分の親まで） */
  breadcrumb?: Array<{ id: string; title: string }>;
  /** このページを指しているページ（§6-②） */
  backlinks?: Array<{ id: string; title: string; space_name: string; color: string | null }>;
  /** 自分がお気に入りに入れているか */
  favorited?: boolean;
  /** 30日の閲覧数と、そのうち AI の出典から来た数（§7-3 条件3） */
  view_count_30d?: number;
  view_from_answer_30d?: number;
}

export interface WikiPageVersion {
  id: string;
  page_id: string;
  rev: number;
  title: string;
  body_md: string;
  tags: string[];
  saved_by: string | null;
  saver_name?: string | null;
  saved_at: string;
  note: string | null;
  /** AI が書いた版か（画面の「AI作成」の札） */
  by_ai?: boolean;
}

export interface WikiComment {
  id: string;
  page_id: string;
  parent_id: string | null;
  body_md: string;
  created_by: string;
  creator_name?: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolver_name?: string | null;
}

/* ── データベース（§4-4） ─────────────────────────────────── */

/**
 * 項目の型は9つ。増やすときは
 * ①ここ ②`isValidPropValue`（markdown.ts）③画面のセルの描き手 を揃える
 */
export type WikiItemType =
  | 'text'
  | 'select'
  | 'multi_select'
  | 'date'
  | 'person'
  | 'checkbox'
  | 'number'
  | 'url'
  | 'onair_link';

/** ONAiR リンクの相手。行の中でカードになる */
export type WikiOnairKind = 'project' | 'equipment' | 'room' | 'page';

export interface WikiOnairLink {
  kind: WikiOnairKind;
  /** 相手の id。画面はこれで名前と状態を引く */
  id: string;
  /** 貼った時点の表示名（相手が消えても行が空にならない） */
  label?: string;
}

export type WikiPropValue =
  | string
  | number
  | boolean
  | string[]
  | WikiOnairLink
  | null;

export interface WikiItem {
  id: string;
  name: string;
  type: WikiItemType;
  /** select / multi_select のときの選択肢 */
  options?: Array<{ value: string; color?: string }>;
  required?: boolean;
  /** onair_link のときに選べる相手を絞る */
  onairKinds?: WikiOnairKind[];
}

export type WikiViewType = 'table' | 'board' | 'calendar';

export interface WikiViewSort {
  itemId: string;
  dir: 'asc' | 'desc';
}

export interface WikiViewFilter {
  itemId: string;
  op: 'is' | 'is_not' | 'contains' | 'is_empty' | 'is_not_empty' | 'before' | 'after';
  value?: WikiPropValue;
}

export interface WikiView {
  id: string;
  name: string;
  type: WikiViewType;
  /** 表に出す項目 id の並び。空なら全部 */
  columns?: string[];
  sorts?: WikiViewSort[];
  filters?: WikiViewFilter[];
  /** board のときのグループ化に使う select 型の項目 */
  groupBy?: string;
  /** calendar のときに使う date 型の項目 */
  dateItem?: string;
}

export interface WikiDatabase {
  page_id: string;
  items: WikiItem[];
  views: WikiView[];
  updated_at: string;
  updated_by: string | null;
}

/** データベースの1行（ページの一部だけを返す軽い形） */
export interface WikiRow {
  id: string;
  title: string;
  icon: string | null;
  status: WikiPageStatus;
  props: Record<string, WikiPropValue>;
  sort_order: number;
  updated_at: string;
  updated_by: string | null;
  updater_name?: string | null;
}

/* ── 検索（§5-4） ─────────────────────────────────────────── */

export interface WikiSearchHit {
  id: string;
  title: string;
  space_id: string;
  space_name: string;
  space_color: string | null;
  /** スペース > 親 > … の道 */
  path: string;
  /** 一致した見出し（無ければ null） */
  heading: string | null;
  /** 本文からの抜粋。当たった語の前後 */
  excerpt: string;
  updated_at: string;
  owner_name: string | null;
  score: number;
}

export interface WikiSearchQuery {
  q: string;
  spaceId?: string;
  tags?: string[];
  ownerId?: string;
  /** 何日以内に更新されたもの。未指定は全部 */
  updatedWithinDays?: number;
  limit?: number;
}

/* ── AI（§7） ─────────────────────────────────────────────── */

export interface WikiCitation {
  pageId: string;
  title?: string;
  heading: string | null;
  quote: string;
}

export type WikiAiFeedback = 'good' | 'rephrase' | 'reject';

export interface WikiAiThread {
  id: string;
  title: string;
  page_id: string | null;
  space_id: string | null;
  created_at: string;
  updated_at: string;
  message_count?: number;
  /** ページを作った発言があるか（採用の印） */
  spawned_page?: boolean;
}

export interface WikiAiMessage {
  id: string;
  thread_id: string;
  seq: number;
  role: 'user' | 'assistant';
  content_md: string;
  citations: WikiCitation[] | null;
  /** cited = 出典つきで答えた / none = 書かれていないと返した（§10 #8） */
  confidence: 'cited' | 'none' | null;
  model: string | null;
  feedback: WikiAiFeedback | null;
  feedback_note: string | null;
  spawned_page_id: string | null;
  created_at: string;
  /** AI が読んだページ（右パネルに出す） */
  read_pages?: Array<{ id: string; title: string; space_name: string; cited: boolean }>;
}

export type WikiGapStatus = 'open' | 'written' | 'dismissed';

export interface WikiGap {
  id: string;
  question: string;
  count: number;
  last_asked_at: string;
  space_id: string | null;
  space_name?: string | null;
  status: WikiGapStatus;
  page_id: string | null;
  /** 直近で聞いた人（画面の副題） */
  askers?: string[];
}

/** 「AI で整える」のやり方。主な使い方は structure（手入力のメモ→手順書の形） */
export type WikiTidyMode = 'structure' | 'heading' | 'bullets' | 'terms' | 'shorten';

export interface WikiTidyResult {
  /** 整えたあとの Markdown */
  result_md: string;
  /** 揃えた語（画面に出す。例: "カード → セキュリティカード"） */
  changed_terms: string[];
  ai_output_id: string;
}

/* ── 見直し（§6-⑦） ──────────────────────────────────────── */

export interface WikiReviewRow {
  id: string;
  title: string;
  path: string;
  space_id: string;
  space_name: string;
  owner_user_id: string | null;
  owner_name: string | null;
  review_by: string | null;
  updated_at: string;
  /** overdue = 予定日を過ぎた（画面の表示は「要見直し」） / soon = 14日以内 / no_owner = 担当なし */
  bucket: 'overdue' | 'soon' | 'no_owner';
}

/* ── 書き出し・取り込み（§5-2 の約束3） ────────────────────── */

/** `.md` の先頭に置く YAML の見出し。画面には出さない（技術語なので・ルール5） */
export interface WikiFrontMatter {
  id?: string;
  title: string;
  space?: string;
  parent?: string;
  tags?: string[];
  owner?: string;
  review_by?: string;
  status?: WikiPageStatus;
  updated?: string;
  /** データベースの行のときの項目の値 */
  props?: Record<string, WikiPropValue>;
}
