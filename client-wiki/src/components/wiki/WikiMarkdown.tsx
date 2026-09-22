/**
 * ページ本文（Markdown）を描く。
 *
 * **HTML は描かない。** `rehype-raw` を入れていないので、本文に `<script>` や
 * `<img onerror=…>` が混ざっていても素通しにならない（react-markdown の既定）。
 * AI が書いた本文も人が書いた本文もここを通るので、**この既定を外さないこと**
 * （docs/design/v4/wiki.md §7-5「AI に HTML を書かせない」）。
 *
 * 足しているのは設計書 §4-2 の拡張2つだけ:
 *   - 注意書き `> [!NOTE]` `[!TIP]` `[!WARNING]` `[!CAUTION]`
 *   - ONAiR カード（案件・機材・部屋・ページへのリンクを、段落1本のときカードにする）
 * 目次は本文の見出しから作る（人が打たない）。見出しの id は `extractHeadings` の
 * リンク先と**同じもの**を当てる — 別々に作ると目次を押しても飛べない。
 */
import { useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from 'react-router-dom';
import { extractHeadings } from '@gmo-onair/shared/src/wiki/markdown';
import { cn } from '@/lib/utils';
import WikiAlert from './WikiAlert';
import WikiOnairCard from './WikiOnairCard';
import {
  alertBodySource,
  alertKindOf,
  onairRefOf,
  soleLinkOf,
  startLineOf,
  type MdNodeLike,
} from './markdownSource';

/** 本文の中のリンク。Wiki のページは画面を作り直さずに移る */
function MdLink({ href, children }: { href?: string; children?: React.ReactNode }) {
  const to = href ?? '';
  if (to.startsWith('/wiki/p/')) {
    return <Link to={`/p/${to.slice('/wiki/p/'.length)}`}>{children}</Link>;
  }
  // 別アプリ（/sales/… /equipment/… /calendar/…）は丸ごと移る。
  // http(s) は別のタブで開く（読んでいたページを閉じさせない）
  if (/^https?:\/\//.test(to)) {
    return <a href={to} target="_blank" rel="noreferrer noopener">{children}</a>;
  }
  return <a href={to}>{children}</a>;
}

interface Opts {
  md: string;
  slugByLine: Map<number, string>;
  /** 注意書きの中で描くとき。入れ子の注意書きと見出しの id は付けない */
  nested?: boolean;
}

function makeComponents({ md, slugByLine, nested }: Opts): Components {
  // `extractHeadings` の行は 0 始まり、hast の行は 1 始まり
  const idAt = (node: MdNodeLike | undefined) => {
    if (nested) return undefined;
    const line = startLineOf(node);
    return line === null ? undefined : slugByLine.get(line - 1);
  };

  return {
    h1: ({ node, children, ...rest }) => <h1 id={idAt(node)} {...rest}>{children}</h1>,
    h2: ({ node, children, ...rest }) => <h2 id={idAt(node)} {...rest}>{children}</h2>,
    h3: ({ node, children, ...rest }) => <h3 id={idAt(node)} {...rest}>{children}</h3>,

    a: ({ href, children }) => <MdLink href={href}>{children}</MdLink>,

    // 段落がリンク1本だけなら ONAiR カード。文の中のリンクはそのまま
    p: ({ node, children, ...rest }) => {
      const only = soleLinkOf(node);
      const ref = only ? onairRefOf(only.href, only.label) : null;
      if (only && ref) return <WikiOnairCard refItem={ref} href={only.href} />;
      return <p {...rest}>{children}</p>;
    },

    // 注意書き。中身は元の文字列を切り出して描き直す（`[!NOTE]` の印を消すため）
    blockquote: ({ node, children, ...rest }) => {
      const kind = nested ? null : alertKindOf(node, md);
      if (!kind) return <blockquote {...rest}>{children}</blockquote>;
      return (
        <WikiAlert kind={kind}>
          <WikiMarkdown body={alertBodySource(node, md)} nested />
        </WikiAlert>
      );
    },

    // 列が多い表はスマホで必ず溢れる。包みの側で横に送る（本文ごと横スクロールさせない）
    //
    // ⚠️ `node` は**必ず受け取って捨てる**。`...rest` に残したまま DOM へ渡すと
    //    `<table node="[object Object]">` という属性が本当に出る（実際に踏んだ）。
    table: ({ node: _node, children, ...rest }) => (
      <div className="wiki-table-scroll">
        <table {...rest}>{children}</table>
      </div>
    ),
  };
}

export interface WikiMarkdownProps {
  /** `wiki_pages.body_md` そのもの */
  body: string;
  nested?: boolean;
  className?: string;
}

export default function WikiMarkdown({ body, nested, className }: WikiMarkdownProps) {
  const slugByLine = useMemo(
    () => new Map(extractHeadings(body).map((h) => [h.line, h.slug])),
    [body],
  );
  const components = useMemo(
    () => makeComponents({ md: body, slugByLine, nested }),
    [body, slugByLine, nested],
  );

  // 入れ子（注意書きの中）では `.wiki-doc` を二重に当てない。当てると余白が倍になる
  const content = (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {body}
    </ReactMarkdown>
  );
  if (nested) return content;
  return <div className={cn('wiki-doc', className)}>{content}</div>;
}
