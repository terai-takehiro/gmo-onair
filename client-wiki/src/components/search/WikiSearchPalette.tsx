/**
 * ⌘K の窓（ホームの検索欄と `⌘K` が開く・どの画面からでも開く）
 *
 * ── 4つの状態を混ぜない ──────────────────────────────────────
 *
 * **まだ打っていない / 探している / 0件 / 失敗した** は別のことです。
 * 打つ前は「最近見たもの」を出します（打つ理由の半分は、さっき読んだページに
 * 戻ることです）。
 *
 * ── 上下キーで一直線に動かす ────────────────────────────────
 *
 * 最近見たもの・ページ・「すべての結果を見る」は**種類が違っても同じ形の1行**に
 * します。種類ごとに区切ると、矢印キーで塊をまたぐたびに次がどこへ行くのか
 * 読めなくなります（案件管理の `SearchPalette` と同じ作り）。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, CornerDownLeft, FileText, Loader2, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@gmo-onair/shared/src/client/ui/dialog';
import { Input } from '@gmo-onair/shared/src/client/ui/input';
import { splitTerms } from '@gmo-onair/shared/src/wiki/search';
import { useAuth } from '@/hooks/useAuth';
import HighlightedText from './HighlightedText';
import { useDebounced } from './useDebounced';
import { useWikiSearch } from './searchApi';
import { readWikiRecent } from './wikiRecent';
import { setWikiSearchOpen, useWikiSearchOpen } from './searchOpen';

/** 窓に出す件数。全部は検索の画面（`/search`）で見る */
const TOP = 8;

interface Row {
  key: string;
  group: string;
  label: string;
  sub?: string;
  heading?: string | null;
  to: string;
  icon: typeof Clock;
}

export default function WikiSearchPalette() {
  const open = useWikiSearchOpen();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const uid = currentUser?.id ?? '';
  const [text, setText] = useState('');
  const [cursor, setCursor] = useState(0);
  const [recent, setRecent] = useState(() => readWikiRecent(uid));
  const listRef = useRef<HTMLDivElement>(null);

  // 消したときは待たずに「最近見たもの」へ戻す（窓を開け直したときも同じ）
  const typed = text.trim();
  const slowQ = useDebounced(typed, 250);
  const q = typed ? slowQ : '';
  const searchQ = useWikiSearch({ q, limit: TOP });
  const terms = useMemo(() => splitTerms(q), [q]);

  // 開くたびに読み直す（閉じている間に開いたページを次に出す）
  useEffect(() => {
    if (!open) return;
    setRecent(readWikiRecent(uid));
    setText('');
    setCursor(0);
  }, [open, uid]);

  const rows: Row[] = useMemo(() => {
    if (!q) {
      return recent.map((r) => ({
        key: `r:${r.id}`,
        group: '最近見たもの（この端末）',
        label: r.title,
        sub: r.spaceName,
        to: `/p/${r.id}`,
        icon: Clock,
      }));
    }
    // ⚠️ **いま打っている語の結果だけを並べる。** 打ち替えている間、react-query は
    // 前の語の結果を持ったままにします（一覧が消えてちらつかないため）。それを
    // そのまま並べると、**Enter で打った語と関係のないページが開きます**
    const found = searchQ.isPlaceholderData ? [] : (searchQ.data?.hits ?? []);
    const out: Row[] = found.map((h) => ({
      key: `p:${h.id}`,
      group: 'ページ',
      label: h.title,
      sub: h.path || h.space_name,
      heading: h.heading,
      to: `/p/${h.id}`,
      icon: FileText,
    }));
    // 0件のときは「すべての結果を見る」も出さない（着いた先も0件なので）
    if (out.length > 0) {
      out.push({
        key: 'all',
        group: 'すべて',
        label: `「${q}」の結果をすべて見る`,
        to: `/search?q=${encodeURIComponent(q)}`,
        icon: Search,
      });
    }
    return out;
  }, [q, recent, searchQ.data, searchQ.isPlaceholderData]);

  // 並びが変わったら先頭に戻す（前の位置に残ると別のものを開く）
  useEffect(() => setCursor(0), [rows.length, q]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-cursor="on"]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const go = (row: Row) => {
    setWikiSearchOpen(false);
    navigate(row.to);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((i) => (rows.length === 0 ? 0 : (i + 1) % rows.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((i) => (rows.length === 0 ? 0 : (i - 1 + rows.length) % rows.length));
    } else if (e.key === 'Enter') {
      const row = rows[cursor];
      if (row) {
        e.preventDefault();
        go(row);
      }
    }
  };

  let lastGroup = '';

  return (
    <Dialog open={open} onOpenChange={setWikiSearchOpen}>
      <DialogContent className="gap-0 p-0 sm:max-w-xl" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Wiki を検索</DialogTitle>
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <Input
            autoFocus
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Wiki を検索"
            placeholder="Wiki を検索（例: 配信 音が出ない）"
            className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
          />
          {q !== '' && searchQ.isFetching && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
          )}
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
          {searchQ.isError && (
            <p className="m-1.5 rounded-control bg-warning-surface px-3 py-2 text-sub text-secondary-foreground">
              いま検索できませんでした。打ち直すともう一度試します。
            </p>
          )}
          {rows.length === 0 ? (
            <p className="px-3 py-6 text-center text-sub text-muted-foreground">
              {!q
                ? 'タイトル・見出し・本文から探します。2語以上を空けて入れると、すべての語を含むページだけが出ます'
                : searchQ.isFetching
                  ? '検索中…'
                  : '見つかりませんでした。別の言い方や、短い語でもお試しください'}
            </p>
          ) : (
            rows.map((row, i) => {
              const head = row.group !== lastGroup ? row.group : null;
              lastGroup = row.group;
              const Icon = row.icon;
              return (
                <div key={row.key}>
                  {head && <p className="v4-eyebrow px-3 pb-1 pt-2.5">{head}</p>}
                  <button
                    type="button"
                    data-cursor={i === cursor ? 'on' : undefined}
                    onMouseMove={() => setCursor(i)}
                    onClick={() => go(row)}
                    className="min-h-tap flex w-full items-center gap-2.5 rounded-control-lg px-3 py-2 text-left text-list lg:min-h-0"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">
                      <HighlightedText text={row.label} terms={terms} />
                    </span>
                    {row.heading && (
                      <span className="hidden shrink-0 truncate text-note text-muted-foreground sm:inline">
                        {row.heading}
                      </span>
                    )}
                    {row.sub && (
                      <span className="shrink-0 truncate text-sub-sm text-muted-foreground">{row.sub}</span>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-note text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CornerDownLeft className="h-3 w-3" aria-hidden />開く
          </span>
          <span>↑↓ 選ぶ</span>
          <span>Esc 閉じる</span>
          <span className="ml-auto truncate">読めないスペースのページは出ません</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
