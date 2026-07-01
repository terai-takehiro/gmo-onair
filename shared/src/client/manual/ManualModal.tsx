// shared/src/client/manual/ManualModal.tsx — 全ブロックアプリ共通の利用マニュアル モーダル
// 各アプリは ManualContent (types.ts) を作るだけで、このモーダルに渡せば
// TOC + キーワード検索 + 図解付きセクション表示が得られる。
import { useEffect, useMemo, useState, Fragment } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Input } from "../ui/input";
import { cn } from "../utils";
import type { ManualContent, ManualSection, ManualBlock } from "./types";
import { FlowDiagram, Callout, NumberedSteps, IconGrid, Glossary, MockTable, MockKpiRow, Bullets } from "./illustrations";

function renderBlock(block: ManualBlock, key: number) {
  switch (block.type) {
    case "p":
      return (
        <p key={key} className="text-sm leading-relaxed text-foreground whitespace-pre-line">
          {block.text}
        </p>
      );
    case "bullets":
      return <Bullets key={key} items={block.items} />;
    case "flow":
      return <FlowDiagram key={key} steps={block.steps} caption={block.caption} />;
    case "callout":
      return <Callout key={key} tone={block.tone} title={block.title} text={block.text} />;
    case "steps":
      return <NumberedSteps key={key} items={block.items} />;
    case "iconGrid":
      return <IconGrid key={key} items={block.items} />;
    case "glossary":
      return <Glossary key={key} items={block.items} />;
    case "table":
      return <MockTable key={key} columns={block.columns} rows={block.rows} caption={block.caption} />;
    case "kpi":
      return <MockKpiRow key={key} items={block.items} />;
    default:
      return null;
  }
}

function groupSections(sections: ManualSection[]) {
  const order: string[] = [];
  const map = new Map<string, ManualSection[]>();
  for (const s of sections) {
    if (!map.has(s.group)) {
      map.set(s.group, []);
      order.push(s.group);
    }
    map.get(s.group)!.push(s);
  }
  return order.map((name) => ({ name, sections: map.get(name)! }));
}

export interface ManualModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: ManualContent;
}

export default function ManualModal({ open, onOpenChange, content }: ManualModalProps) {
  const sections = content.sections;
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? "");
  const [query, setQuery] = useState("");

  // モーダルを開くたびに先頭セクション・検索をリセット
  useEffect(() => {
    if (open) {
      setActiveId(sections[0]?.id ?? "");
      setQuery("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const activeIndex = sections.findIndex((s) => s.id === activeId);
  const activeSection = activeIndex >= 0 ? sections[activeIndex] : sections[0];

  // 本文が切り替わったらスクロール位置を先頭に戻す
  useEffect(() => {
    const el = document.getElementById("_manual-content-scroll");
    if (el) el.scrollTop = 0;
  }, [activeId]);

  const q = query.trim().toLowerCase();
  const matches = (s: ManualSection) =>
    !q || s.title.toLowerCase().includes(q) || (s.keywords ?? []).some((k) => k.toLowerCase().includes(q));

  const groups = useMemo(() => groupSections(sections), [sections]);
  const filteredGroups = useMemo(
    () => groups.map((g) => ({ ...g, sections: g.sections.filter(matches) })).filter((g) => g.sections.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, q]
  );
  const filteredFlat = useMemo(() => sections.filter(matches), [sections, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const AppIcon = content.appIcon;

  const goPrev = () => {
    if (activeIndex > 0) setActiveId(sections[activeIndex - 1].id);
  };
  const goNext = () => {
    if (activeIndex < sections.length - 1) setActiveId(sections[activeIndex + 1].id);
  };

  if (!activeSection) return null;
  const ActiveIcon = activeSection.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[calc(100vw-1.5rem)] sm:w-[calc(100vw-3rem)] h-[88vh] max-h-[880px] p-0 flex flex-col gap-0 overflow-hidden">
        {/* ヘッダー */}
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-4 pb-3 pt-4 sm:px-6 sm:pt-5">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <AppIcon className="h-[18px] w-[18px]" />
            </span>
            <span className="truncate">{content.appLabel} 利用マニュアル</span>
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed sm:text-sm">{content.intro}</DialogDescription>
        </DialogHeader>

        {/* 検索 */}
        <div className="shrink-0 border-b border-border px-4 py-2.5 sm:px-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="キーワードで探す（例: GLS、予約、請求書）"
              className="h-9 pl-9 text-sm"
            />
          </div>
        </div>

        {/* モバイル用 TOC（横スクロールチップ） */}
        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-border px-4 py-2 sm:hidden">
          {filteredFlat.length === 0 && <span className="px-1 py-1 text-xs text-muted-foreground">該当する項目がありません</span>}
          {filteredFlat.map((s) => {
            const Icon = s.icon;
            const isActive = s.id === activeId;
            return (
              <button
                key={s.id}
                onClick={() => setActiveId(s.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  isActive
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-accent"
                )}
                style={{ touchAction: "manipulation" }}
              >
                <Icon className="h-3.5 w-3.5" />
                {s.title}
              </button>
            );
          })}
        </div>

        <div className="flex min-h-0 flex-1">
          {/* デスクトップ用 TOC（サイドバー） */}
          <nav className="hidden w-56 shrink-0 overflow-y-auto border-r border-border py-3 sm:block" aria-label="マニュアル目次">
            {filteredGroups.length === 0 && (
              <p className="px-4 py-2 text-xs text-muted-foreground">該当する項目がありません</p>
            )}
            {filteredGroups.map((g) => (
              <div key={g.name} className="px-3 pb-3">
                <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{g.name}</p>
                <div className="space-y-0.5">
                  {g.sections.map((s) => {
                    const Icon = s.icon;
                    const isActive = s.id === activeId;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setActiveId(s.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                          isActive ? "bg-primary/10 font-semibold text-primary" : "text-foreground hover:bg-accent"
                        )}
                      >
                        <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                        <span className="truncate">{s.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* 本文 */}
          <div id="_manual-content-scroll" className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ActiveIcon className="h-[18px] w-[18px]" />
              </span>
              <h3 className="text-base font-bold text-foreground sm:text-lg">{activeSection.title}</h3>
            </div>
            <div className="max-w-2xl">
              {activeSection.blocks.map((b, i) => (
                <Fragment key={i}>{renderBlock(b, i)}</Fragment>
              ))}
            </div>
          </div>
        </div>

        {/* フッター: 前へ/次へ */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-4 py-2.5 sm:px-6">
          <button
            onClick={goPrev}
            disabled={activeIndex <= 0}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
            style={{ touchAction: "manipulation" }}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            前へ
          </button>
          <span className="text-[11px] text-muted-foreground">
            {activeIndex + 1} / {sections.length}
          </span>
          <button
            onClick={goNext}
            disabled={activeIndex >= sections.length - 1}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
            style={{ touchAction: "manipulation" }}
          >
            次へ
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
