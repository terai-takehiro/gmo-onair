/**
 * 見積タブ「売上・請求」ペイン（`RevenueBillingPane.tsx`）の小部品。
 *
 * `RevenueBillingPane.tsx` から切り出した（400行の上限に当たったため。
 * `overviewParts.tsx` と同じやり方）。**`MoreNote` だけは切り出していない** —
 * `shared/tests/estimateIntegrity.test.ts` が `RevenueBillingPane.tsx` の
 * ソースを正規表現で照合しており（`function MoreNote` の存在を見る）、
 * ここに移すと試験が壊れる。
 */
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, AlertTriangle, Pencil } from 'lucide-react';
import { RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { DocPdfButton } from '@/contexts/shared/components/DocPdfButton';
import { DocExcelButton } from '@/contexts/shared/components/DocExcelButton';
import type { RevenueRow } from '@/contexts/finance/pages/ledger/types';

/**
 * 財務管理側（この案件で絞った状態）への行き先。**`ProjectQuickLinks.tsx` と同じ
 * クエリの付け方**（`?project_id=…&project_name=…`）——2か所で書き方が違うと、
 * 片方だけ `project_name` を付け忘れて財務側の見出しが「売上」のままになる。
 */
export function financeLedgerHref(path: '/budget/revenues' | '/budget/purchases', projectId: string, projectName?: string) {
  const q = new URLSearchParams({ project_id: projectId });
  if (projectName) q.set('project_name', projectName);
  return `${path}?${q.toString()}`;
}

/** 財務管理側（この案件で絞った状態）へのリンク。カード見出しの右に置く */
export function FinanceLedgerLink({ to, label }: { to: string; label: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className="v4-tap text-note inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
    >
      {label}
      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

/** カード見出しのすぐ下に置く、財務管理と同じデータであることの説明 */
export function SameDataNote({ what }: { what: string }) {
  return (
    <p className="text-note border-b border-border-faint bg-surface-subtle px-4 py-2 text-muted-foreground">
      この一覧は財務管理の{what}台帳と同じデータを、この案件で絞り込んで表示しています。
    </p>
  );
}

/**
 * 編集ボタン（仕様変更 #13）。**`DocPdfButton` と同じ見た目・当たり判定**にそろえる
 * （アイコンだけ・指では44px／PCでは36px）——同じ並びに置くボタンの手触りが
 * ここだけ違うと押し間違える。
 */
function EditRevenueButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      title="売上を編集する"
      aria-label="売上を編集する"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="rounded-control flex min-h-tap w-11 shrink-0 items-center justify-center border border-border bg-card text-secondary-foreground hover:border-primary-border hover:text-primary lg:h-9 lg:min-h-0 lg:w-9"
    >
      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

/**
 * 帳票を出すボタン2つ（請求書・検収書）＋編集ボタン（`onEdit` を渡したときだけ）。
 *
 * **見積書はここに出さない** — 版を持つ「見積」から出す（`RevenueBillingPane.tsx` 冒頭のコメント参照）。
 *
 * **編集ボタンは権限がある人にだけ渡す**（`onEdit` が無ければ出さない）——
 * サーバー `PUT /revenues/:id` の要件（`sales:editor`）に合わせるのは呼び出し側の役目。
 * 列幅は**7段のうち次の段（160→200px）**にする。44px のボタンが1つ増えるので、
 * 160px のままだと4つ目がはみ出す。
 */
export function DocButtons({ revenueId, onEdit }: { revenueId: string; onEdit?: () => void }) {
  return (
    <RowSlot w={onEdit ? 200 : 160} align="right" className="gap-1">
      {onEdit && <EditRevenueButton onClick={onEdit} />}
      {(['invoice', 'inspection'] as const).map((type) => (
        <DocPdfButton key={type} path={`/revenues/${revenueId}/pdf`} kind={type} params={{ type }} />
      ))}
      <DocExcelButton revenueId={revenueId} />
    </RowSlot>
  );
}

/**
 * 分け合う請求（配分グループ）の売上に出す注記。
 *
 * **ここからは直せません。** サーバー `PUT /revenues/:id` が
 * `REVENUE_IN_ALLOCATION_GROUP`（400）で止めます —— 按分の内訳
 * (`revenue_allocations`) を直せないまま合計だけ変えると、各案件への配分と
 * 食い違うためです。以前は鉛筆が出ていて、押して直して保存した瞬間に
 * エラーになりました（直せないのに直せるように見える）。
 * 鉛筆を出さない代わりに、**どこへ行けば直せるか**をここに書きます。
 */
export function GroupRevenueNote() {
  return (
    <span className="text-note mt-0.5 flex items-center gap-1 text-muted-foreground">
      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
      按分グループの売上です（案件管理 &gt; 按分グループ から編集できます）
    </span>
  );
}

export const REV_STATUS_LABEL: Record<string, string> = { estimate: '見込み', confirmed: '確定' };
export const REV_STATUS_TONE: Record<string, string> = {
  estimate: 'border-transparent bg-muted text-muted-foreground',
  confirmed: 'border-transparent bg-success-surface text-success',
};

/**
 * このペインが扱う売上1行の形。**財務台帳の `RevenueRow` を土台にする**
 * （仕様変更 #13 で `RevenueDialog` をそのまま流用して編集できるようにしたため。
 * 型を分けて詰め替えると、台帳側で足した列をここでも足し直す二度手間になる）。
 *
 * 台帳側の型に無い列（`subtitle`・`invoice_no`）と、見積との差異検知（#15）に
 * 使う2列（`estimate_id`・`estimate_total_amount`）を足す。後者2つは
 * `GET /revenues` が `project_id` で絞ったときだけ返す（`revenues.routes.ts`）。
 */
export interface PaneRevenue extends RevenueRow {
  subtitle: string | null;
  invoice_no: string | null;
  /** この売上の元になった見積（あれば）。無ければ null（見積を経由しない売上など） */
  estimate_id?: string | null;
  /** その見積のいまの合計金額（明細合計 − 値引き）。`estimate_id` が無ければ null */
  estimate_total_amount?: number | null;
}

export function invoiceState(r: PaneRevenue): { label: string; tone: string } {
  return r.paid_date
    ? { label: '入金済み', tone: 'border-transparent bg-success-surface text-success' }
    : { label: '未収', tone: 'border-transparent bg-warning-surface text-warning' };
}

/**
 * 見積との差異検知（仕様変更 #15）。**見積そのものは送付後編集できない**
 * (`shared/tests/estimateIntegrity.test.ts`) ので、差が出るのは売上側を
 * あとから直接書き換えた（財務台帳・案件詳細どちらの `PUT /revenues/:id` でも）ときだけ。
 * 差が無い／元になった見積が無ければ `null`（バッジを出さない）。
 */
export function estimateMismatch(r: PaneRevenue): number | null {
  if (r.estimate_total_amount == null) return null;
  return r.estimate_total_amount !== r.amount ? r.estimate_total_amount : null;
}

/**
 * 見積との差異バッジ。**編集は止めない** — 気づけるようにするだけの表示
 * （案件詳細の売上・請求ペインをご要望どおり編集可能にした代わりの安全弁）。
 */
export function EstimateMismatchNote({ estimateTotal, className }: { estimateTotal: number; className?: string }) {
  return (
    <span
      className={cn('text-note mt-0.5 flex items-center gap-1 text-warning', className)}
      title="見積の合計金額とこの売上の金額が食い違っています。見積は送付後に直せないため、あとから売上側を書き換えた可能性があります。"
    >
      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
      見積(<Money value={estimateTotal} inline className="text-note" />)と差異があります
    </span>
  );
}

/**
 * 一覧の応答。**合計はサーバーが出したものを使います**（レビューでの指摘 #87）。
 *
 * ⚠️ **行を足し算しないこと。** ①分け合う請求（グループ）の `amount` は
 * **グループ全体の額**なので、そのまま足すと**1案件の粗利が他案件のぶんだけ
 * 膨らみます**。②行は 100 件で切っているので、**101 件目からは合計に入りません**。
 * どちらも画面を見ても気づけません（それらしい数字が出るだけ）。
 */
export interface ListResponse<T> {
  data: T[];
  /** 件数は `pagination.total`（`paginatedResponse` の形） */
  pagination?: { total?: number };
  /** 分け合うぶんを配分額で足した合計（案件で絞ったときだけ返る） */
  total_allocated_amount?: number;
  /** 同上・確定した売上だけ */
  confirmed_allocated_amount?: number;
}
