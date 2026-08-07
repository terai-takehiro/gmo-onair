/**
 * 受付に届くものの種類 (v4 ②)
 *
 * `GET /dashboard/inbox` は4種類を1本のキューにして返します。
 * **受付の画面はそのうち引き合いの2つ (`ai_project` / `inquiry`) だけを出します**
 * — モックの受付は引き合い (メール・電話) だけだからです。
 *
 * ── 外した2つの行き先 ──────────────────────────────────────
 *
 *  ・**期限超過** → 案件管理ダッシュボードの「期限が過ぎたやること」。
 *    **先にそちらを作ってから**外しました（消すだけだと、お客様を待たせている
 *    ものを見る場所が無くなる）
 *  ・**見積・請求の書類** → 財務の「受け取った書類」(`/budget/documents`)。
 *    元からそこが本来の置き場で、受付には重複して出ていました
 *
 * `GET /dashboard/inbox` そのものは4種類を返したままです — ホームの
 * 「お待たせ中」とタイルの件数が同じ口を読んでおり、
 * **口を変えると受付以外の数字も動きます**。絞るのは画面側だけ。
 *
 * 3ステップ (入れる → 確かめる → 案件にする) を通せるのは
 * **ネタ案件だけ**なので、そこだけ作業台 (中央+右) を出します。
 */
import { Sparkles, AlertTriangle, MessageSquare, Receipt } from 'lucide-react';

export type InboxKind = 'overdue_action' | 'ai_project' | 'inquiry' | 'finance_doc';

export interface KindDef {
  label: string;
  icon: typeof Sparkles;
  /** バッジの色。**生のパレットを使わない** (状態の色トークンから選ぶ) */
  tone: string;
  /** 3ステップの「確かめる」を通せるか = 中央の作業台を出すか */
  workbench: boolean;
}

export const KINDS: Record<InboxKind, KindDef> = {
  ai_project: {
    label: 'ネタ案件', icon: Sparkles,
    tone: 'border-transparent bg-ai-surface text-ai', workbench: true,
  },
  overdue_action: {
    label: '期限超過', icon: AlertTriangle,
    tone: 'border-transparent bg-destructive-surface text-destructive', workbench: false,
  },
  inquiry: {
    label: '問い合わせ', icon: MessageSquare,
    tone: 'border-transparent bg-primary-surface text-primary', workbench: false,
  },
  finance_doc: {
    label: '見積・請求', icon: Receipt,
    tone: 'border-transparent bg-warning-surface text-warning', workbench: false,
  },
};

export const KIND_ORDER: InboxKind[] = ['ai_project', 'overdue_action', 'inquiry', 'finance_doc'];

/**
 * **受付の画面に出す種類**（モックどおり引き合いだけ）。
 * `KIND_ORDER` は `GET /dashboard/inbox` が返す全部で、ホームの「お待たせ中」が使う。
 */
export const INTAKE_KINDS: InboxKind[] = ['ai_project', 'inquiry'];

export interface InboxItem {
  key: string;
  kind: InboxKind;
  received_at: string | null;
  meta: Record<string, unknown>;
}

export interface InboxData {
  items: InboxItem[];
  checklist: { key: string; kind: 'agreement'; meta: Record<string, unknown> }[];
  counts: Record<string, number>;
  dailyops: { visible: boolean; editable: boolean };
}

/** 一覧に出す1行の見出しと副題。**種類ごとに何を先に読むかが違う** */
export function titleOf(item: InboxItem): string {
  const m = item.meta;
  switch (item.kind) {
    case 'ai_project': return String(m.name ?? '(名前なし)');
    case 'overdue_action': return String(m.project_name ?? m.gls_number ?? '(案件名なし)');
    case 'inquiry': return String(m.subject ?? '(件名なし)');
    case 'finance_doc': return String(m.subject ?? m.doc_type ?? '(件名なし)');
  }
}

export function subtitleOf(item: InboxItem): string {
  const m = item.meta;
  switch (item.kind) {
    case 'ai_project':
      // **AI に指示した人の名前は出さない。** AI が自由記述で書く値で、
      // 実際に別人の名前が記録されていた (`check-ui-tokens` の `ai-person-name`)
      return String(m.customer_name ?? 'お客様 未設定');
    case 'overdue_action':
      return `${m.days_overdue}日超過 ・ ${m.next_action ?? ''}`;
    case 'inquiry':
      return [m.sender, m.summary].filter(Boolean).join(' ・ ');
    case 'finance_doc':
      return [m.sender, m.amount != null ? `¥${Number(m.amount).toLocaleString()}` : null]
        .filter(Boolean).join(' ・ ');
  }
}
