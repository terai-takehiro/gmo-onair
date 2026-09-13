// 運営マニュアル — 出す前の検査（5種）の表示（段D・production-manual.md §6⑤ の4種＋
// 体制図の「名前の無い階層・人」・production-manual-orgchart.md §7）。
// 計算そのものは `manualPreExportChecks.ts`（DOMを測らない純粋関数）に切り出してあり、
// ここは結果を並べるだけ。**止めない**——この一覧が何件あっても「このまま書き出す」は
// 常に押せる（呼び出し側 `ManualPreviewPage.tsx` はボタンを disabled にしない）。
//
// 見た目は収録/配信設定の書き出し前点検（`pages/settings-export/PreflightSummary.tsx`）と
// 同じ骨格（赤=要修正／橙=要確認の帯＋1件ずつの明細）を踏襲する。
import type { ReactNode } from "react";
import type { ManualBlock, ManualPage } from "@gmo-onair/shared/src/opsmanual/types";
import { manualLinkedBlockDef } from "@gmo-onair/shared/src/production/manualBlocks";
import type { ManualPreExportChecks, ManualPreExportIssue } from "./manualPreExportChecks";

const FREE_BLOCK_LABEL: Record<string, string> = {
  text: "文字ブロック",
  shape: "図形ブロック",
  image: "画像ブロック",
  table: "表ブロック",
  qr: "QRブロック",
  orgchart: "体制図ブロック",
};

function findBlock(pages: ManualPage[], issue: ManualPreExportIssue): ManualBlock | undefined {
  return pages.find((p) => p.id === issue.pageId)?.blocks.find((b) => b.id === issue.blockId);
}

function blockLabel(pages: ManualPage[], issue: ManualPreExportIssue): string {
  const block = findBlock(pages, issue);
  if (!block) return "ブロック";
  if (block.kind === "linked") return manualLinkedBlockDef(block.link.block)?.label ?? "差し込みブロック";
  return FREE_BLOCK_LABEL[block.free.type] ?? "ブロック";
}

function Row({ tone, title, meaning, count, children }: {
  tone: "bad" | "warn" | "ok";
  title: string;
  meaning: string;
  count: number;
  children?: ReactNode;
}) {
  const skin =
    tone === "bad"
      ? "border-destructive-border bg-destructive-surface"
      : tone === "warn"
        ? "border-warning-border bg-warning-surface"
        : "border-border bg-muted/30";
  const fg = tone === "bad" ? "text-destructive" : tone === "warn" ? "text-warning" : "text-muted-foreground";
  const dot = tone === "bad" ? "bg-destructive" : tone === "warn" ? "bg-warning" : "bg-muted-foreground";

  return (
    <div className={`overflow-hidden rounded-card border ${skin}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
        <span className={`h-2 w-2 shrink-0 rounded-chip ${dot}`} aria-hidden="true" />
        <span className={`text-sub-sm font-medium ${fg}`}>{title}</span>
        <span className={`font-number text-sub-sm font-bold ${fg}`}>{count}件</span>
        <span className="ml-auto text-sub-sm text-muted-foreground">{meaning}</span>
      </div>
      {children}
    </div>
  );
}

function IssueList({ pages, issues }: { pages: ManualPage[]; issues: ManualPreExportIssue[] }) {
  return (
    <ul className="max-h-32 space-y-1 overflow-y-auto border-t border-border bg-card px-3 py-2">
      {issues.map((issue, i) => (
        <li key={`${issue.pageId}-${issue.blockId}-${i}`} className="text-sub-sm text-foreground">
          <span className="font-medium">{issue.pageTitle}</span>
          <span className="text-muted-foreground">: </span>
          {blockLabel(pages, issue)}
        </li>
      ))}
    </ul>
  );
}

interface Props {
  pages: ManualPage[];
  checks: ManualPreExportChecks;
}

export default function ManualPreExportChecksPanel({ pages, checks }: Props) {
  const total =
    checks.overflowing.length + checks.missingSource.length + checks.staleSource.length +
    checks.emptyBlocks.length + checks.unnamedOrgEntries.length;

  if (total === 0) {
    return (
      <div className="rounded-card border border-border bg-muted/20 p-3 text-sub-sm text-muted-foreground">
        出す前の検査: 問題ありません。
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sub-sm font-medium text-foreground">出す前の検査</h2>

      <Row tone="bad" title="紙からはみ出すブロック" meaning="キャンバスの外にはみ出ています" count={checks.overflowing.length}>
        {checks.overflowing.length > 0 && <IssueList pages={pages} issues={checks.overflowing} />}
      </Row>

      <Row tone="bad" title="元の資料が消えたブロック" meaning="差し込み元が見つかりません" count={checks.missingSource.length}>
        {checks.missingSource.length > 0 && <IssueList pages={pages} issues={checks.missingSource} />}
      </Row>

      <Row tone="warn" title="差し込み元が変わったまま" meaning="確定した時点から変わっています" count={checks.staleSource.length}>
        {checks.staleSource.length > 0 && <IssueList pages={pages} issues={checks.staleSource} />}
      </Row>

      <Row tone="warn" title="中身が空のブロック" meaning="空のまま配ることになります" count={checks.emptyBlocks.length}>
        {checks.emptyBlocks.length > 0 && <IssueList pages={pages} issues={checks.emptyBlocks} />}
      </Row>

      {/* 体制図だけの検査（§7）。人が決まっていない空のチームは**意図して置ける**ので対象外 */}
      <Row tone="warn" title="名前の無い階層・人が残っている体制図" meaning="名前のないまま紙に出ます" count={checks.unnamedOrgEntries.length}>
        {checks.unnamedOrgEntries.length > 0 && <IssueList pages={pages} issues={checks.unnamedOrgEntries} />}
      </Row>
    </div>
  );
}
