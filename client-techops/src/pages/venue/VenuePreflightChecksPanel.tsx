// 会場図面 — ③仕上がりの「出す前の検査」3つの表示。設計 §6③・§12-3「止めない。
// 0件でも安全とは書かない」。`ManualPreExportChecksPanel.tsx` と同じ骨格
// （赤=はみ出し・重なり／橙=保有数超過・推定寸法の帯＋1件ずつの明細）を踏襲する。
import type { ReactNode } from "react";
import type { VenuePreflightChecks } from "./venuePreflightChecks";

function Row({ tone, title, meaning, count, children }: {
  tone: "bad" | "warn";
  title: string;
  meaning: string;
  count: number;
  children?: ReactNode;
}) {
  const skin = tone === "bad" ? "border-destructive-border bg-destructive-surface" : "border-warning-border bg-warning-surface";
  const fg = tone === "bad" ? "text-destructive" : "text-warning";
  const dot = tone === "bad" ? "bg-destructive" : "bg-warning";
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

function List({ labels }: { labels: string[] }) {
  return (
    <ul className="max-h-32 space-y-1 overflow-y-auto border-t border-border bg-card px-3 py-2">
      {labels.map((label, i) => (
        <li key={`${label}-${i}`} className="text-sub-sm text-foreground">{label}</li>
      ))}
    </ul>
  );
}

export default function VenuePreflightChecksPanel({ checks }: { checks: VenuePreflightChecks }) {
  const total = checks.overflowing.length + checks.overQty.length + checks.estimated.length;

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sub-sm font-medium text-foreground">出す前の検査</h2>
      {total === 0 && (
        <p className="text-sub-sm text-muted-foreground">3つとも0件でした。壁の中や吹き抜けに置けてしまう弱点は残るため、最後は紙の1mバーで確かめてください。</p>
      )}

      <Row tone="bad" title="エリアからはみ出す・固定物に重なる品目" meaning="壁の中や吹き抜けに置けていないか" count={checks.overflowing.length}>
        {checks.overflowing.length > 0 && <List labels={checks.overflowing.map((i) => i.label)} />}
      </Row>

      <Row tone="warn" title="保有数を超えた品目" meaning="確保できない場合があります" count={checks.overQty.length}>
        {checks.overQty.length > 0 && (
          <List labels={checks.overQty.map((i) => `${i.label} ${i.placed}/${i.qty}`)} />
        )}
      </Row>

      <Row tone="warn" title="寸法が推定の品目" meaning="確定前の寸法で決めていないか" count={checks.estimated.length}>
        {checks.estimated.length > 0 && <List labels={checks.estimated.map((i) => i.label)} />}
      </Row>
    </div>
  );
}
