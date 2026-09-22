/**
 * 編集画面から AI を呼ぶところ（段E・`docs/design/v4/wiki.md` §7-1）
 *
 * ⚠️ **ここに置いてあるのは「AI が本文を書く／整える」2つだけ**です。
 * 「AI に聞く」（会話・出典・足りないページ）は別の画面（`pages/ask/`）が持ちます。
 * 同じ URL を2つのファイルに持たないため、こちらには会話の道を足さないでください
 * （`client-wiki/CLAUDE.md`「API の URL は `lib/` に集める」の分割の考え方と同じ）。
 *
 * サーバーの正は `server/src/contexts/wiki/`:
 *   POST /wiki/rewrite                      手入力のメモを手順書の形に整える（**保存しない**）
 *   POST /wiki/rewrite/:outputId/decision   置き換えた／やめた（§7-3 条件2）
 *   POST /wiki/pages/:id/draft              そのページに AI が下書きを書く（**下書きのページだけ**）
 *   POST /wiki/ai/draft                     新しい下書きページを AI が作る
 *
 * 応答はこの製品の作法どおり `{ success: true, data: … }` で包まれています。
 *
 * ── 整えるときに「保存しない」のはなぜか ──────────────────────
 *
 * 整えた結果は**人が見て決めるまで本文になりません**（§6-③「いま／整えたあと を
 * 並べて見せる」）。サーバーは結果と `ai_output_id` を返すだけで、本文は書き換えません。
 * 置き換えるかどうかは画面が決め、**決めた結果を必ず `decision` で返します** —
 * 返さないと「AI が出したものを人がどう直したか」が1件も貯まらず、
 * 「AIを使い捨てにしない」の条件2（人の修正差分）が切れます。
 */
import type { WikiPage, WikiTidyMode, WikiTidyResult } from '@gmo-onair/shared/src/wiki/types';
import api from '@/lib/api';

export const WIKI_AI_URL = {
  rewrite: '/wiki/rewrite',
  rewriteDecision: (outputId: string) => `/wiki/rewrite/${outputId}/decision`,
  pageDraft: (pageId: string) => `/wiki/pages/${pageId}/draft`,
  draft: '/wiki/ai/draft',
} as const;

/** `{ success, data }` の包みを外す */
function unwrap<T>(res: { data: { success?: boolean; data: T } }): T {
  return res.data.data;
}

/* ── AI で整える（§7-1 ③） ────────────────────────────────── */

export interface WikiTidyInput {
  /** 整える元の文。選んだところがあればそこだけ・無ければ本文全部 */
  text: string;
  /** やり方（既定は structure ＝ 手順書の形にする） */
  mode: WikiTidyMode;
  /** どのページで押したか（記録の手がかり。本文は書き換わりません） */
  page_id?: string | null;
}

/**
 * 整えた結果をもらう。**本文は書き換わりません**（返ってきた文を置くかどうかは人が決める）。
 * 長すぎる文はサーバーが**切らずに断ります**（黙って切ると後半が消えたことに気づけない）。
 */
export async function tidyText(input: WikiTidyInput): Promise<WikiTidyResult> {
  return unwrap<WikiTidyResult>(await api.post(WIKI_AI_URL.rewrite, input));
}

/**
 * 人が決めたこと（§7-3 条件2）。置き換えた ＝ `replaced` ／ やめた ＝ `cancelled`。
 * **値はサーバーの `WIKI_REWRITE_DECISIONS` と同じ2つだけ**です。
 */
export type WikiTidyDecision = 'replaced' | 'cancelled';

export interface WikiTidyDecisionInput {
  decision: WikiTidyDecision;
  /**
   * 置き換える前に**人が手を入れたとき**だけ、入れた文を添えます。
   *
   * 添えないとサーバーは「そのまま置き換えた」（無修正採用）として数え、
   * 添えると AI の結果と行単位で突き合わせて `rephrase` / `fix` を決めます。
   * **どちらかを画面が決めるのではなく、突き合わせるのはサーバー**です。
   */
  final_md?: string;
}

/**
 * 決めたことを返す。**押した直後に必ず呼びます**（置き換えた・やめた・別のやり方で出し直した）。
 * 失敗しても本文の置き換えそのものは済んでいるので、画面の操作は止めません。
 */
export async function sendTidyDecision(
  outputId: string,
  input: WikiTidyDecisionInput,
): Promise<void> {
  await api.post(WIKI_AI_URL.rewriteDecision(outputId), input);
}

/* ── AI で下書きを作成（§7-1 ②・§7-2） ───────────────────── */

/**
 * 下書きの材料。**送る名前は `routes/ai.routes.ts` の `readDraftInput` が読む形**
 * （`space_id` のような `_` 区切り）で、service の `DraftInput` の名前ではありません。
 * **どれか1つは中身が要ります** — 材料が空のときサーバーは断ります。
 */
export interface WikiDraftInput {
  /** 題（省略すると AI が材料から決める） */
  title?: string;
  /** 人が貼ったメモ（会議のメモ・口頭で聞いたこと） */
  notes?: string;
  /** 材料にする既に公開されているページ */
  source_page_ids?: string[];
  /** 材料にする会話（「AI に聞く」のスレッド。**本人のものだけ**） */
  thread_id?: string | null;
  /** 新しく作るとき: どのスペースの・どの親の下に置くか */
  space_id?: string | null;
  parent_id?: string | null;
  /** 「ページにする」を押した回答／足りないページから起こしたとき */
  message_id?: string | null;
  gap_id?: string | null;
}

export interface WikiDraftResult {
  /** 書き込まれたページ（**必ず下書き**。公開は人が押す） */
  page: WikiPage;
  /** 材料から決められなかったこと（本文に推測で書かせない代わりの受け皿） */
  open_questions: string[];
  ai_output_id: string | null;
}

/**
 * いま開いているページに下書きを書く。
 *
 * ⚠️ **下書きのページだけ**です。公開中のページは AI で書き換えません
 * （いま現場が見ている手順が予告なく変わるため）。サーバーも断ります。
 * ⚠️ **いまの本文は置き換わります。** 元の文は履歴に残ります（版が1つ増える）。
 */
export async function draftIntoPage(pageId: string, input: WikiDraftInput): Promise<WikiDraftResult> {
  return unwrap<WikiDraftResult>(await api.post(WIKI_AI_URL.pageDraft(pageId), input));
}

/**
 * 新しい下書きページを AI に書いてもらう（「AI に聞く」・見直しの「ページを作成」から使う口）。
 * 編集画面は使いませんが、**同じ機能なので道は1か所にまとめてあります**。
 */
export async function createAiDraftPage(input: WikiDraftInput): Promise<WikiDraftResult> {
  return unwrap<WikiDraftResult>(await api.post(WIKI_AI_URL.draft, input));
}
