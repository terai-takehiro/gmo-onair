/**
 * AI活動ページの型と対応表（値→日本語・値→状態）
 *
 * ── サーバーと「対」のもの ──────────────────────────────────
 *
 * `KIND_LABEL` の鍵はサーバーの `SALES_REVIEW_KINDS`（sales-ai-review.service.ts）
 * ＋ `OPS_NEWS_ITEM_KIND`（ai-feedback.service.ts）と対。**増やすときは両方直す**。
 * qsheet 系の kind はこの画面に来ない（`/ai-activity/*` がそもそも受けない —
 * 台本の断片が混ざる `recent_examples` を営業の画面に出さないための構造的な秘匿）。
 */

/** GET /ai-activity/recent の1行（payload 全文は API が返さない） */
export interface RecentOutput {
  id: string;
  kind: string;
  created_at: string;
  tool_name: string | null;
  target_table: string | null;
  target_id: string | null;
  model: string | null;
  prompt_version: string | null;
  /** 何かしらの記録がある（'none' も「無修正で採用」という人の裁き） */
  reviewed: boolean;
  correction_types: string[];
}

/** GET /ai-activity/digest の1種ぶん（画面が読む分だけ。サーバーはもっと返す） */
export interface KindDigest {
  kind: string;
  reviewed_outputs: number;
  accepted_as_is: number;
  as_is_rate: number | null;
  top_corrected_field_types: Array<{
    field_path: string;
    corrections: number;
    fix: number;
    enrich: number;
    reject: number;
  }>;
}

/** GET /ai-activity/reviews の1行（メタのみ） */
export interface ReviewRow {
  id: string;
  kind: string;
  period_key: string; // 'YYYY-MM'
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

/** 種類の日本語名。**サーバーの営業系 kind 一覧と対**（上の注意書き） */
export const KIND_LABEL: Record<string, string> = {
  task_intake: '投入口の行き先判断',
  activity_format: 'やり取りの整形',
  next_action_short: '次にやることを1行に',
  minutes_draft: '議事録の整形',
  kpt_draft: 'ふりかえりの下書き',
  project_draft: '案件の下書き',
  estimate_draft: '見積の下書き',
  inquiry_intake: '問い合わせの取り込み',
  finance_doc_intake: '経理書類の取り込み',
  ops_news_item: 'デイリーニュースの記事',
  // プロジェクト管理 (GPM)。MCP の create_gpm_project / create_gpm_task が起票する
  gpm_project_draft: 'プロジェクトの下書き',
  gpm_task_draft: 'プロジェクトタスクの下書き',
};

/** 対象テーブルの日本語名。知らない値は素の名前で出す（黙って隠さない） */
export const TARGET_LABEL: Record<string, string> = {
  projects: '案件',
  project_tasks: 'プロジェクトタスク',
  activity_logs: '営業活動記録',
  project_minutes: '議事録',
  task_intake: '投入口',
  misc_inquiries: '問い合わせ',
  finance_docs: '受領書類',
  ops_report_items: 'デイリーニュース',
  estimates: '見積',
};

/**
 * 1件の状態。**「未確認」と「無修正採用」を混ぜない** —
 * `ai_corrections` の記録が無いのは「人がまだ見ていない」であって
 * 「直すところが無かった」ではない（混ぜると採用率が嘘になる。
 * サーバーの digest も同じ理由で reviewed だけを分母にしている）。
 */
export type OutputState = 'unreviewed' | 'as_is' | 'corrected' | 'rejected';

export function outputState(o: Pick<RecentOutput, 'reviewed' | 'correction_types'>): OutputState {
  if (!o.reviewed) return 'unreviewed';
  // 却下が1つでもあれば「却下」— 一部だけ採用した回も「AI の出しは弾かれた」側に数える
  if (o.correction_types.includes('reject')) return 'rejected';
  if (o.correction_types.every((t) => t === 'none')) return 'as_is';
  return 'corrected';
}

export const STATE_BADGE: Record<OutputState, { label: string; tone: string }> = {
  as_is: { label: '無修正採用', tone: 'bg-success-surface text-success' },
  corrected: { label: '修正あり', tone: 'bg-warning-surface text-warning' },
  rejected: { label: '却下', tone: 'bg-destructive-surface text-destructive' },
  unreviewed: { label: '未確認', tone: 'bg-surface-subtle text-muted-foreground' },
};

/** 'YYYY-MM' → 'YYYY年MM月'。月次レビューの対象月の見せ方 */
export function periodLabel(periodKey: string): string {
  const m = periodKey.match(/^(\d{4})-(\d{2})$/);
  return m ? `${m[1]}年${m[2]}月` : periodKey;
}

/**
 * 一覧の時刻。「今日の何時」がそのまま要る場面（AI が動いた時刻）なので
 * 相対（`formatRelativeTime`）ではなく絶対で出す。年は今年なら省く —
 * この一覧は直近 50 件で、ほぼ全部が今年のため。
 */
export function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  return d.getFullYear() === new Date().getFullYear() ? `${md} ${hm}` : `${d.getFullYear()}/${md} ${hm}`;
}
