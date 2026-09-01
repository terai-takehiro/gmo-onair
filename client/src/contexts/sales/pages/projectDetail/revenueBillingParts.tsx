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
import { ArrowUpRight } from 'lucide-react';
import { RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { DocPdfButton } from '@/contexts/shared/components/DocPdfButton';
import { DocExcelButton } from '@/contexts/shared/components/DocExcelButton';
import type { Revenue } from '@gmo-onair/shared/src/types';

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
 * 帳票を出すボタン2つ（請求書・検収書）。
 *
 * **見積書はここに出さない** — 版を持つ「見積」から出す（`RevenueBillingPane.tsx` 冒頭のコメント参照）。
 */
export function DocButtons({ revenueId }: { revenueId: string }) {
  return (
    <RowSlot w={160} align="right" className="gap-1">
      {(['invoice', 'inspection'] as const).map((type) => (
        <DocPdfButton key={type} path={`/revenues/${revenueId}/pdf`} kind={type} params={{ type }} />
      ))}
      <DocExcelButton revenueId={revenueId} />
    </RowSlot>
  );
}

export const REV_STATUS_LABEL: Record<string, string> = { estimate: '見込み', confirmed: '確定' };
export const REV_STATUS_TONE: Record<string, string> = {
  estimate: 'border-transparent bg-muted text-muted-foreground',
  confirmed: 'border-transparent bg-success-surface text-success',
};

export function invoiceState(r: Revenue): { label: string; tone: string } {
  return r.paid_date
    ? { label: '入金済み', tone: 'border-transparent bg-success-surface text-success' }
    : { label: '未収', tone: 'border-transparent bg-warning-surface text-warning' };
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
