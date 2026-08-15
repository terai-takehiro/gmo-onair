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

/**
 * **その人が開ける画面**。呼ぶ側が権限から作って渡します
 * （ここで `useAuth` を読むと、受付・トップ・将来の呼び出しで判定が増える）。
 */
export interface InboxOpenable {
  /** 案件作成（`/sales/projects/new`）— `sales` の **editor** が要る */
  intake: boolean;
  /** 入ってきた情報（`/daily/inquiries`）— `dailyops`。**別バンドル** */
  inquiries: boolean;
  /** 受け取った書類（`/budget/documents`）— `budget` か `dailyops` */
  documents: boolean;
}

/**
 * 受信箱の1件を**開ける場所**。開けないときは `null`（**押して 403 にしない**）。
 *
 * ⚠️ **行き先を「案件作成」に固定しないこと。** 受信箱には日常業務のもの
 * （問い合わせ・受け取った書類）も入っており、`dailyops` だけの人には
 * 案件作成が開けません。固定すると、**API の 403 を画面の「権限がありません」に
 * 移し替えただけ**になります（レビューでの指摘）。
 *
 * `sales` の人は今までどおり全部**案件作成**へ送ります — 引き合いはそこで
 * 案件にするのが仕事の流れで、レールに問い合わせも並んでいます（`INTAKE_KINDS`）。
 */
export function inboxHrefOf(kind: InboxKind, can: InboxOpenable): string | null {
  if (can.intake) return '/sales/projects/new';
  if (kind === 'inquiry') return can.inquiries ? '/daily/inquiries' : null;
  if (kind === 'finance_doc') return can.documents ? '/budget/documents' : null;
  // ネタ案件・期限超過は案件の画面しか行き先が無い
  return null;
}

/** 「残りを見る」の行き先と札。開ける場所が1つも無ければ `null`（出さない） */
export function inboxAllHrefOf(can: InboxOpenable): { href: string; label: string } | null {
  if (can.intake) return { href: '/sales/projects/new', label: '案件作成' };
  if (can.inquiries) return { href: '/daily/inquiries', label: '入ってきた情報' };
  if (can.documents) return { href: '/budget/documents', label: '受け取った書類' };
  return null;
}

/**
 * 行き先へ移動する。**別バンドルへは素の遷移**（`/daily/` は日常業務アプリ）。
 * ルーターでは動けません（上辺バーの通知と同じ理由）。
 */
export function isCrossApp(href: string): boolean {
  return href.startsWith('/daily/');
}

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
