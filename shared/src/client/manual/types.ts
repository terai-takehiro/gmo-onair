// shared/src/client/manual/types.ts — 利用マニュアル共通スキーマ
// 各ブロックアプリはこのスキーマに沿ってコンテンツ(*.tsx)を書くだけで
// ManualModal に渡せば図解付きマニュアルとして表示される。
import type { LucideIcon } from "lucide-react";

export type ManualTone = "primary" | "success" | "warning" | "destructive" | "info" | "muted";

export interface FlowStep {
  icon: LucideIcon;
  label: string;
  sub?: string;
  tone?: ManualTone;
}

export interface StepItem {
  title: string;
  text: string;
  icon?: LucideIcon;
}

export interface IconGridItem {
  icon: LucideIcon;
  label: string;
  text?: string;
  tone?: ManualTone;
}

export interface GlossaryItem {
  term: string;
  def: string;
}

export interface MockKpiItem {
  label: string;
  value: string;
  tone?: ManualTone;
}

export type ManualBlock =
  | { type: "p"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "flow"; steps: FlowStep[]; caption?: string }
  | { type: "callout"; tone: ManualTone; title?: string; text: string }
  | { type: "steps"; items: StepItem[] }
  | { type: "iconGrid"; items: IconGridItem[] }
  | { type: "glossary"; items: GlossaryItem[] }
  | { type: "table"; columns: string[]; rows: string[][]; caption?: string }
  | { type: "kpi"; items: MockKpiItem[] };

export interface ManualSection {
  /** アンカーID (英数字・ハイフンのみ) */
  id: string;
  /** TOC 上のグループ見出し (例: "案件管理") */
  group: string;
  icon: LucideIcon;
  title: string;
  /** TOC 検索でヒットさせたいキーワード (title に加えて) */
  keywords?: string[];
  blocks: ManualBlock[];
}

export interface ManualContent {
  appLabel: string;
  appIcon: LucideIcon;
  /** マニュアル冒頭の概要文 */
  intro: string;
  sections: ManualSection[];
}
