// shared/src/client/manual/illustrations.tsx — 利用マニュアル用の図解パーツ集
// スクリーンショットの代わりに、アイコン + 色 + レイアウトだけで「流れ」「注意点」「画面イメージ」を
// 表現するイラスト系コンポーネント。UI改修があっても壊れにくく、メンテナンスコストが低い。
import { ChevronRight, Info, Lightbulb, AlertTriangle, AlertOctagon, CircleDot } from "lucide-react";
import { cn } from "../utils";
import type {
  ManualTone,
  FlowStep,
  StepItem,
  IconGridItem,
  GlossaryItem,
  MockKpiItem,
} from "./types";

// ─── トーン → クラス/アイコンのマッピング ────────────────────────────────────
const TONE_BG: Record<ManualTone, string> = {
  primary: "bg-primary/10",
  success: "bg-success/10",
  warning: "bg-warning/10",
  destructive: "bg-destructive/10",
  info: "bg-info/10",
  muted: "bg-muted",
};
const TONE_TEXT: Record<ManualTone, string> = {
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning-strong",
  destructive: "text-destructive",
  info: "text-info",
  muted: "text-muted-foreground",
};
const TONE_BORDER: Record<ManualTone, string> = {
  primary: "border-primary/30",
  success: "border-success/30",
  warning: "border-warning/30",
  destructive: "border-destructive/30",
  info: "border-info/30",
  muted: "border-border",
};
const TONE_ICON: Record<ManualTone, typeof Info> = {
  primary: Info,
  success: Lightbulb,
  warning: AlertTriangle,
  destructive: AlertOctagon,
  info: Info,
  muted: CircleDot,
};
const TONE_LABEL: Record<ManualTone, string> = {
  primary: "ポイント",
  success: "ヒント",
  warning: "注意",
  destructive: "重要",
  info: "補足",
  muted: "メモ",
};

// ─── FlowDiagram: 業務の流れをアイコン+矢印で表現 ────────────────────────────
export function FlowDiagram({ steps, caption }: { steps: FlowStep[]; caption?: string }) {
  return (
    <div className="my-3">
      <div className="flex flex-wrap items-stretch gap-y-3">
        {steps.map((step, i) => {
          const tone = step.tone ?? "muted";
          const Icon = step.icon;
          return (
            <div key={i} className="flex items-center">
              <div
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border px-3.5 py-3 min-w-[92px] text-center",
                  TONE_BG[tone],
                  TONE_BORDER[tone]
                )}
              >
                <div className={cn("flex h-9 w-9 items-center justify-center rounded-full bg-background/70", TONE_TEXT[tone])}>
                  <Icon className="h-[18px] w-[18px]" />
                </div>
                <span className="text-xs font-semibold leading-tight text-foreground">{step.label}</span>
                {step.sub && <span className="text-[10px] leading-tight text-muted-foreground">{step.sub}</span>}
              </div>
              {i < steps.length - 1 && (
                <ChevronRight className="mx-1 h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
              )}
            </div>
          );
        })}
      </div>
      {caption && <p className="mt-2 text-xs text-muted-foreground">{caption}</p>}
    </div>
  );
}

// ─── Callout: 注意/ヒント/補足ボックス ───────────────────────────────────────
export function Callout({ tone, title, text }: { tone: ManualTone; title?: string; text: string }) {
  const Icon = TONE_ICON[tone];
  return (
    <div className={cn("my-3 flex gap-2.5 rounded-xl border p-3.5", TONE_BG[tone], TONE_BORDER[tone])}>
      <Icon className={cn("h-[18px] w-[18px] shrink-0 mt-0.5", TONE_TEXT[tone])} />
      <div className="min-w-0">
        <p className={cn("text-xs font-bold tracking-wide", TONE_TEXT[tone])}>{title ?? TONE_LABEL[tone]}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-foreground whitespace-pre-line">{text}</p>
      </div>
    </div>
  );
}

// ─── NumberedSteps: 手順を番号付きで縦に並べる ───────────────────────────────
export function NumberedSteps({ items }: { items: StepItem[] }) {
  return (
    <ol className="my-3 space-y-3">
      {items.map((item, i) => {
        const Icon = item.icon;
        return (
          <li key={i} className="flex gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
              {Icon ? <Icon className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <div className="min-w-0 pt-0.5">
              <p className="text-sm font-semibold text-foreground leading-snug">{item.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{item.text}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ─── IconGrid: アイコンタイルのグリッド (機能一覧など) ────────────────────────
export function IconGrid({ items }: { items: IconGridItem[] }) {
  return (
    <div className="my-3 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
      {items.map((item, i) => {
        const tone = item.tone ?? "primary";
        const Icon = item.icon;
        return (
          <div key={i} className="flex flex-col items-center gap-1.5 rounded-xl border border-border p-3 text-center">
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-full", TONE_BG[tone], TONE_TEXT[tone])}>
              <Icon className="h-[18px] w-[18px]" />
            </div>
            <span className="text-xs font-semibold leading-tight text-foreground">{item.label}</span>
            {item.text && <span className="text-[11px] leading-tight text-muted-foreground">{item.text}</span>}
          </div>
        );
      })}
    </div>
  );
}

// ─── Glossary: 用語集 ────────────────────────────────────────────────────────
export function Glossary({ items }: { items: GlossaryItem[] }) {
  return (
    <dl className="my-3 grid gap-2 sm:grid-cols-2">
      {items.map((item, i) => (
        <div key={i} className="rounded-lg border border-border p-3">
          <dt className="flex items-center gap-1.5 text-sm font-bold text-foreground">
            <CircleDot className="h-3 w-3 text-primary shrink-0" />
            {item.term}
          </dt>
          <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.def}</dd>
        </div>
      ))}
    </dl>
  );
}

// ─── MockTable: 画面イメージを伝えるための簡易表 ─────────────────────────────
export function MockTable({ columns, rows, caption }: { columns: string[]; rows: string[][]; caption?: string }) {
  return (
    <div className="my-3">
      <div className="overflow-hidden overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[420px] text-xs">
          <thead>
            <tr className="bg-muted">
              {columns.map((c, i) => (
                <th key={i} className="px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className={cn("border-t border-border", ri % 2 === 1 && "bg-muted/40")}>
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-2 text-foreground whitespace-nowrap">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {caption && <p className="mt-1.5 text-xs text-muted-foreground">{caption}</p>}
    </div>
  );
}

// ─── MockKpiRow: KPIカードのイメージ ──────────────────────────────────────────
export function MockKpiRow({ items }: { items: MockKpiItem[] }) {
  return (
    <div className="my-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      {items.map((item, i) => {
        const tone = item.tone ?? "muted";
        return (
          <div key={i} className={cn("rounded-xl border p-3", TONE_BORDER[tone], TONE_BG[tone])}>
            <p className="text-[11px] font-medium text-muted-foreground">{item.label}</p>
            <p className={cn("mt-0.5 text-lg font-bold leading-tight", TONE_TEXT[tone])}>{item.value}</p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Bullets ────────────────────────────────────────────────────────────────
export function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="my-2 space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2 text-sm leading-relaxed text-foreground">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          <span className="whitespace-pre-line">{it}</span>
        </li>
      ))}
    </ul>
  );
}
