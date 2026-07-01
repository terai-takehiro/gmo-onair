// shared/src/client/versionHistory/richDescription.tsx — バージョン履歴の本文を見やすく構造化して描画する。
// CLAUDE.md の changelog 本文は「①②③…」の丸数字箇条書き、または「**原因**: …**修正**: …」の
// 太字ラベル形式で書かれていることが多いので、それを検出して箇条書き / 簡易定義リストに組み立て直す。
// 該当しない平文はそのまま段落として表示する。
import { useState, Fragment } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "../utils";

const CIRCLED_RE = /[①-⑳]/g; // ①〜⑳
const LABEL_RE = /\*\*([^*]{1,24})\*\*[:：]/g;
const SUMMARY_MAX = 110;

// ─── **bold** / `code` のみを解釈する最小限のインライン markdown レンダラ ────
export function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter((p) => p !== "");
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="rounded bg-muted px-1 py-0.5 text-[0.85em] font-mono">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function stripMarkdown(text: string) {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
}

interface CircledSegments {
  kind: "circled";
  intro: string;
  items: string[];
}
interface LabeledSegments {
  kind: "labeled";
  intro: string;
  items: { label: string; body: string }[];
}
interface PlainSegments {
  kind: "plain";
}
type Segments = CircledSegments | LabeledSegments | PlainSegments;

function parseSegments(text: string): Segments {
  const circledMatches = [...text.matchAll(CIRCLED_RE)];
  if (circledMatches.length >= 1) {
    const firstIdx = circledMatches[0].index!;
    const intro = text.slice(0, firstIdx).trim();
    const items: string[] = [];
    for (let i = 0; i < circledMatches.length; i++) {
      const start = circledMatches[i].index!;
      const end = i + 1 < circledMatches.length ? circledMatches[i + 1].index! : text.length;
      items.push(
        text
          .slice(start, end)
          .replace(CIRCLED_RE, "")
          .trim()
      );
    }
    return { kind: "circled", intro, items };
  }

  const labelMatches = [...text.matchAll(LABEL_RE)];
  if (labelMatches.length >= 2) {
    const firstIdx = labelMatches[0].index!;
    const intro = text.slice(0, firstIdx).trim();
    const items: { label: string; body: string }[] = [];
    for (let i = 0; i < labelMatches.length; i++) {
      const m = labelMatches[i];
      const bodyStart = m.index! + m[0].length;
      const bodyEnd = i + 1 < labelMatches.length ? labelMatches[i + 1].index! : text.length;
      items.push({ label: m[1], body: text.slice(bodyStart, bodyEnd).trim() });
    }
    return { kind: "labeled", intro, items };
  }

  return { kind: "plain" };
}

function buildSummary(text: string, segments: Segments): string {
  const base =
    segments.kind === "plain"
      ? text
      : segments.intro || (segments.kind === "circled" ? segments.items[0] : segments.items[0]?.body) || text;
  const plain = stripMarkdown(base).trim();
  return plain.length > SUMMARY_MAX ? `${plain.slice(0, SUMMARY_MAX)}…` : plain;
}

export function RichDescription({ text, defaultExpanded = false }: { text: string; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const segments = parseSegments(text);
  const plainLength = stripMarkdown(text).length;
  const canCollapse = plainLength > SUMMARY_MAX + 20 || segments.kind !== "plain";

  if (!canCollapse) {
    return <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{renderInline(text)}</p>;
  }

  if (!expanded) {
    return (
      <div className="mt-1.5">
        <p className="text-sm leading-relaxed text-muted-foreground">{buildSummary(text, segments)}</p>
        <button
          onClick={() => setExpanded(true)}
          className="mt-1 flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
          style={{ touchAction: "manipulation" }}
        >
          続きを読む
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="mt-1.5">
      {segments.kind === "circled" && (
        <>
          {segments.intro && (
            <p className="text-sm leading-relaxed text-muted-foreground">{renderInline(segments.intro)}</p>
          )}
          <ol className={cn("space-y-1.5", segments.intro && "mt-2")}>
            {segments.items.map((item, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                  {i + 1}
                </span>
                <span className="text-sm leading-relaxed text-muted-foreground">{renderInline(item)}</span>
              </li>
            ))}
          </ol>
        </>
      )}
      {segments.kind === "labeled" && (
        <>
          {segments.intro && (
            <p className="text-sm leading-relaxed text-muted-foreground">{renderInline(segments.intro)}</p>
          )}
          <dl className={cn("space-y-1.5", segments.intro && "mt-2")}>
            {segments.items.map((item, i) => (
              <div key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <dt className="shrink-0 rounded-full bg-info/10 px-2 py-0.5 text-[11px] font-bold text-info">
                  {item.label}
                </dt>
                <dd className="min-w-0 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {renderInline(item.body)}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {segments.kind === "plain" && (
        <p className="text-sm leading-relaxed text-muted-foreground">{renderInline(text)}</p>
      )}
      <button
        onClick={() => setExpanded(false)}
        className="mt-1.5 flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
        style={{ touchAction: "manipulation" }}
      >
        閉じる
        <ChevronUp className="h-3 w-3" />
      </button>
    </div>
  );
}
