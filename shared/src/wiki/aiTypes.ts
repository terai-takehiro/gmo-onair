// Wiki — AI（段E・設計 `docs/design/v4/wiki.md` §7）が扱う型
//
// `types.ts` から切り出した。理由は1ファイル 400 行の決まり（`scripts/check-file-size.mjs`）で、
// 段E で AI の型が増えたときに `types.ts` が 408 行になったため。
// `markdown.ts` から `frontMatter.ts` を切り出したときと同じ分け方（役割で分ける）。
//
// ⚠️ **ここの名前は `types.ts` から再輸出している。** 画面は
// `@gmo-onair/shared/src/wiki/types` からこれまでどおり import できる
// （import 先が2つに割れると、どちらから取るべきかを毎回迷うことになる）。

/* ── AI（§7） ─────────────────────────────────────────────── */

export interface WikiCitation {
  /*
   * ⚠️ **`page_id`（snake_case）が正です。** `wiki_ai_messages.citations` の JSONB も、
   * 設計 §7-1 の構造化出力も、サーバーの `WikiVerifiedCitation` も `page_id` で、
   * ここだけ `pageId` と書いてありました。画面は両方を受けられるよう正規化して
   * いましたが、**同じものの名前が2つある状態**を残すと次に触る人が必ず踏みます。
   */
  page_id: string;
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
  /*
   * 以下はサーバーが返しているのに、ここに書いていなかったもの。
   * 型に無い値は画面から使えないので、**実体に合わせて足す**
   *（消すほうを選ぶと、決定を送るときに要る `ai_output_id` の隣で
   *   どの段で整えたのかが分からなくなる）。
   */
  /** どの整え方で出したか（`tidyModes.ts` の5つ） */
  mode?: string;
  /** 整える前の文（「いま／整えたあと」を並べるのに使う） */
  before_md?: string;
  model?: string;
  prompt_version?: string;
}
