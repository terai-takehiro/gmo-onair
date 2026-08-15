/**
 * 受信箱に届くものの種類（`GET /dashboard/inbox`）
 *
 * ── 「受付」は無くなりました ────────────────────────────────
 *
 * 旧 `/sales/inbox`（受付）は**案件作成に畳みました**（`/sales/projects/new`）。
 * 届いたものを読んで、足りないところを埋めて、案件にするかどうかを決める仕事は
 * 案件作成と同じだったので、1画面にしています。
 *
 * このファイルが残っているのは、**種類の見せ方を2か所が使う**ためです:
 *
 *   ・案件作成の「自動で届いたもの」レール（`projectNew/IntakeRail.tsx`）
 *   ・ホームの「お待たせ中」（`platform/pages/home/WaitingCard.tsx`）
 *
 * 見出しの作り方を書き写すと、片方だけ直したときに**同じ引き合いが画面によって
 * 違う名前で出ます**。
 *
 * ── 口は4種類を返したまま ────────────────────────────────────
 *
 * `GET /dashboard/inbox` は4種類を1本のキューにして返します。
 * **案件作成のレールに出すのは引き合いの2つ（`INTAKE_KINDS`）だけ**です。
 * 外した2つには行き先があります:
 *
 *  ・**期限超過** → 案件管理ダッシュボードの「期限が過ぎたやること」
 *  ・**見積・請求の書類** → 財務の「受け取った書類」（`/budget/documents`）
 *
 * **口そのものは変えません** — ホームの「お待たせ中」とタイルの件数が
 * 同じ口を読んでおり、口を変えると受付以外の数字も動きます。絞るのは画面側だけ。
 */
import { Sparkles, AlertTriangle, MessageSquare, Receipt } from 'lucide-react';

export type InboxKind = 'overdue_action' | 'ai_project' | 'inquiry' | 'finance_doc';

export interface KindDef {
  label: string;
  icon: typeof Sparkles;
  /** バッジの色。**生のパレットを使わない** (状態の色トークンから選ぶ) */
  tone: string;
}

export const KINDS: Record<InboxKind, KindDef> = {
  ai_project: {
    label: 'ネタ案件', icon: Sparkles,
    tone: 'border-transparent bg-ai-surface text-ai',
  },
  overdue_action: {
    label: '期限超過', icon: AlertTriangle,
    tone: 'border-transparent bg-destructive-surface text-destructive',
  },
  inquiry: {
    label: '問い合わせ', icon: MessageSquare,
    tone: 'border-transparent bg-primary-surface text-primary',
  },
  finance_doc: {
    label: '見積・請求', icon: Receipt,
    tone: 'border-transparent bg-warning-surface text-warning',
  },
};

export const KIND_ORDER: InboxKind[] = ['ai_project', 'overdue_action', 'inquiry', 'finance_doc'];

/**
 * **案件作成のレールに出す種類**（引き合いだけ）。
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
  /**
   * **案件側を数えたか。** 受信箱は `sales` か `dailyops` のどちらかで開くので、
   * `dailyops` だけの人には案件のぶんが入っていません。画面はこれを見て
   * **数えていない側に「0件です」と書かない**（見えていないだけなのに
   * 「無い」と言い切らない）。古い応答には無いので任意。
   */
  sales?: { visible: boolean };
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
