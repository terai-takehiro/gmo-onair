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
  /** スペースの色（パンくず・印に使う）。サーバーは `GET /wiki/pages/:id` で返す */
  space_color?: string | null;
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

/**
 * 履歴の一覧の1行。**本文を持たない。**
 *
 * ⚠️ `GET /wiki/pages/:id/versions` は一覧を軽くするため `body_md` を返しません。
 * 本文が要るとき（版の中身を出す・差分を取る・この版に戻す）は
 * `GET /wiki/pages/:id/versions/:rev` を引いて `WikiPageVersion` で受けてください。
 * ここを `WikiPageVersion` で受けると、型は通るのに `body_md` が `undefined` になります。
 */
export interface WikiPageVersionBrief {
  id: string;
  page_id: string;
  rev: number;
  title: string;
  tags: string[];
  saved_by: string | null;
  saver_name?: string | null;
  saved_at: string;
  note: string | null;
  /** AI が書いた版か（画面の「AI作成」の札）。段E で入る */
  by_ai?: boolean;
}

/** 版1本（本文つき）。`GET /wiki/pages/:id/versions/:rev` の返り */
export interface WikiPageVersion extends WikiPageVersionBrief {
  /** ★ その版の本文。一覧（`WikiPageVersionBrief`）には入らない */
  body_md: string;
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

/** スペースごとの当たりの数（絞り込みの列に添える） */
export interface WikiSearchSpaceCount {
  space_id: string;
  count: number;
}

/**
 * 検索の返り。
 *
 * ⚠️ **件数（`counts`）は上限で切る前の数**です。`hits` だけを数えると、
 * 当たりが上限を超えたときに**下位のスペースが 0件に見えて**絞り込みの列から
 * 消えます（Codex の指摘・P2）。
 */
export interface WikiSearchResult {
  hits: WikiSearchHit[];
  counts: WikiSearchSpaceCount[];
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

/*
 * 中身は `aiTypes.ts` にある（1ファイル 400 行の決まりで切り出した）。
 * **ここから再輸出しているので、画面の import 先はこれまでどおり `types` のまま**。
 */
export type {
  WikiCitation,
  WikiAiFeedback,
  WikiAiThread,
  WikiAiMessage,
  WikiGapStatus,
  WikiGap,
  WikiTidyMode,
  WikiTidyResult,
} from './aiTypes';

/* ── 見直しとコメント（§6-⑦⑧・段F） ────────────────────── */

/*
 * 中身は `reviewTypes.ts` にある（1ファイル 400 行の決まりで切り出した）。
 * **ここから再輸出しているので、画面の import 先はこれまでどおり `types` のまま**。
 */
export type {
  WikiComment,
  WikiCommentOutcomeRow,
  WikiCommentOutcome,
  WikiReviewBucket,
  WikiReviewRow,
  WikiReviewLogEntry,
  WikiReviewList,
} from './reviewTypes';

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
