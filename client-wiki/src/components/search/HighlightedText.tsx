/**
 * 当たった語を太くする（docs/design/v4/wiki.md §6-④ の「抜粋（当たった語を太く）」）
 *
 * ⚠️ **語の切り方は `shared/src/wiki/search.ts` の `splitTerms` が正。**
 * ここで自前に空白で切ると、全角の空白の扱いや語数の上限がサーバーの点数付けと
 * ずれ、**点数では当たっているのに太くならない語**が出ます。
 *
 * 長いほうの語から当てるのは、`配信` と `配信機材` の両方が入っているときに
 * 短いほうで切ってしまわないためです。
 */
export default function HighlightedText({
  text,
  terms,
  className,
}: {
  text: string;
  terms: string[];
  className?: string;
}) {
  const parts = splitByTerms(text, terms);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.hit ? (
          <mark key={i} className="rounded-badge-xs bg-warning-surface px-0.5 font-bold text-foreground">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </span>
  );
}

interface Part {
  text: string;
  hit: boolean;
}

/** 文字列を「当たった語」と「それ以外」に切り分ける */
export function splitByTerms(text: string, terms: string[]): Part[] {
  const needles = terms
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (needles.length === 0 || !text) return [{ text, hit: false }];

  const lower = text.toLowerCase();
  const out: Part[] = [];
  let plain = '';
  let i = 0;
  while (i < text.length) {
    const found = needles.find((n) => lower.startsWith(n, i));
    if (found) {
      if (plain) {
        out.push({ text: plain, hit: false });
        plain = '';
      }
      out.push({ text: text.slice(i, i + found.length), hit: true });
      i += found.length;
    } else {
      plain += text[i];
      i += 1;
    }
  }
  if (plain) out.push({ text: plain, hit: false });
  return out;
}
