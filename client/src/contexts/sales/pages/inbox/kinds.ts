/**
 * 受付に届くものの種類 (v4 ②)
 *
 * `GET /dashboard/inbox` が4種類を1本のキューにして返します。
 * **v4 でも4種類のまま**にしています — モックは引き合い (メール・電話) だけを
 * 描いていますが、この受信箱は「お客様を待たせているもの」を集めるという
 * 別の目的で作られていて、実際に使われています。片方を消すと
 * **期限超過のアクションを見る場所が無くなります**。
 *
 * 代わりに、v4 の3ステップ (入れる → 確かめる → 案件にする) を通せるのは
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
