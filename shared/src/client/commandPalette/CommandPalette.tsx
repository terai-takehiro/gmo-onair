// ⌘K コマンドパレット (§4.5 / デザイン 6a)
//
//   やる (操作) → ひらく (場所・パスつき) → 見つかった案件・お客様
//   ↑↓ で選ぶ / enter で実行 / tab で種類を切り替え / esc で閉じる
//
// 検索は既存の GET /search をそのまま使う (呼び出し側が search を渡す)。
// コマンドは静的テーブル (commands.ts) を権限で絞ったもの。

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, CornerDownLeft, ArrowRight, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../utils';
import { matchCommand, resolveCommands } from './commands';
import { COMMAND_GROUPS } from './types';
import type { CommandDef, CommandGroup, PaletteAccess, PaletteHit, PaletteSearchResult } from './types';

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  access: PaletteAccess;
  /** 行き先を開く。アプリ内遷移かフルリロードかは呼び出し側が決める */
  onRun: (path: string) => void;
  /**
   * 案件・お客様・機材の検索。未指定なら3グループ目を出さない。
   * 配列を返す旧い形もそのまま受ける (呼び出し側を全部まとめて直さなくてよいように)。
   */
  search?: (q: string) => Promise<PaletteHit[] | PaletteSearchResult>;
}

type Row =
  | { type: 'command'; cmd: CommandDef }
  | { type: 'hit'; hit: PaletteHit }
  // 「すべて見る」= 検索結果の画面へ (36章)
  | { type: 'seeAll'; path: string };

/** tab で回す種類。all → やる → ひらく → さがす */
const KINDS = ['all', 'do', 'open', 'hit'] as const;
type Kind = (typeof KINDS)[number];
const KIND_LABEL: Record<Kind, string> = {
  all: 'すべて',
  do: 'やる',
  open: 'ひらく',
  hit: '案件・お客様',
};

export default function CommandPalette({ open, onOpenChange, access, onRun, search }: CommandPaletteProps) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [cursor, setCursor] = useState(0);
  const [hits, setHits] = useState<PaletteHit[]>([]);
  // 権限が無くて探していない種類。**件数は出さず名前だけ**出す (36章)
  const [hiddenKinds, setHiddenKinds] = useState<string[]>([]);
  const [foundTotal, setFoundTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo(() => resolveCommands(access), [access]);
  const total = commands.length;

  // 開くたびに初期化
  useEffect(() => {
    if (!open) return;
    setQ('');
    setKind('all');
    setCursor(0);
    setHits([]);
    setHiddenKinds([]);
    setFoundTotal(0);
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(t);
  }, [open]);

  // 案件・お客様の検索 (250ms デバウンス)
  useEffect(() => {
    if (!open || !search) return;
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      setHiddenKinds([]);
      setFoundTotal(0);
      setSearching(false);
      return;
    }
    let alive = true;
    setSearching(true);
    const t = setTimeout(() => {
      search(term)
        .then((r) => {
          if (!alive) return;
          // 配列を返す旧い形も受ける
          if (Array.isArray(r)) { setHits(r); setHiddenKinds([]); setFoundTotal(r.length); return; }
          setHits(r.hits ?? []);
          setHiddenKinds(r.hiddenKinds ?? []);
          setFoundTotal(r.total ?? (r.hits?.length ?? 0));
        })
        .catch(() => { if (alive) { setHits([]); setHiddenKinds([]); setFoundTotal(0); } })
        .finally(() => { if (alive) setSearching(false); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q, open, search]);

  const doList = useMemo(
    () => (kind === 'all' || kind === 'do' ? commands.filter((c) => c.kind === 'do' && matchCommand(c, q)) : []),
    [commands, q, kind]
  );
  const openList = useMemo(
    () => (kind === 'all' || kind === 'open' ? commands.filter((c) => c.kind === 'open' && matchCommand(c, q)) : []),
    [commands, q, kind]
  );
  const hitList = useMemo(() => (kind === 'all' || kind === 'hit' ? hits : []), [hits, kind]);
  // 出しているより多く見つかっているときだけ「すべて見る」を出す (36章)。
  // いつも出すと、3件しかないのに「すべて見る」があって押してしまう。
  const seeAllPath = q.trim().length >= 2 ? `/search?q=${encodeURIComponent(q.trim())}` : null;
  const showSeeAll = Boolean(seeAllPath) && (kind === 'all' || kind === 'hit') && hits.length > 0;

  /*
   * 何も打っていないときは**行き先の地図**にする (v2.9.298)。
   *
   * 83件を「やる」「ひらく」の2つに積むと、探すより読む方が大変になる。
   * レールと同じ順 (今日→案件→タスク→お客様→予定→お金→…) でまとまりに畳み、
   * 行の左にアイコンを置いて、目で当たりを付けられるようにする。
   * **打ち始めたら地図はやめて、当たった順に並べる** (絞り込みの邪魔になる)。
   */
  const browsing = q.trim() === '' && kind === 'all';
  const mapGroups = useMemo(() => {
    if (!browsing) return [];
    const by = new Map<CommandGroup, CommandDef[]>();
    for (const c of commands) {
      if (!by.has(c.group)) by.set(c.group, []);
      by.get(c.group)!.push(c);
    }
    // 「やる」を各まとまりの先頭に置く (場所より操作が先、はグループの中でも同じ)
    for (const list of by.values()) {
      list.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'do' ? -1 : 1));
    }
    return COMMAND_GROUPS.filter((g) => by.has(g)).map((g) => ({ group: g, items: by.get(g)! }));
  }, [browsing, commands]);

  // ↑↓ が通る一列に潰す (グループの見た目とは別)
  const rows: Row[] = useMemo(
    () =>
      browsing
        ? mapGroups.flatMap((g) => g.items.map((cmd) => ({ type: 'command' as const, cmd })))
        : [
      ...doList.map((cmd) => ({ type: 'command' as const, cmd })),
      ...openList.map((cmd) => ({ type: 'command' as const, cmd })),
      ...hitList.map((hit) => ({ type: 'hit' as const, hit })),
      ...(showSeeAll && seeAllPath ? [{ type: 'seeAll' as const, path: seeAllPath }] : []),
    ],
    [browsing, mapGroups, doList, openList, hitList, showSeeAll, seeAllPath]
  );

  useEffect(() => { setCursor(0); }, [q, kind, hits.length]);

  const run = (row: Row) => {
    onOpenChange(false);
    if (row.type === 'command') { onRun(row.cmd.path); return; }
    if (row.type === 'seeAll') { onRun(row.path); return; }
    onRun(row.hit.path);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onOpenChange(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(rows.length - 1, c + 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      setKind((k) => KINDS[(KINDS.indexOf(k) + (e.shiftKey ? KINDS.length - 1 : 1)) % KINDS.length]);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[cursor];
      if (row) run(row);
    }
  };

  // 選択行を視界に入れる
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!open) return null;

  let idx = -1;
  const nextIndex = () => { idx += 1; return idx; };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[8vh] sm:pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="コマンドパレット"
    >
      <div className="absolute inset-0 bg-black/40" onClick={() => onOpenChange(false)} aria-hidden="true" />

      <div
        className="relative flex max-h-[76vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
        onKeyDown={onKeyDown}
      >
        {/* 入力 */}
        <div className="flex items-center gap-2 border-b border-divider px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="やりたいこと・行き先・案件名でさがす"
            aria-label="やりたいこと・行き先・案件名でさがす"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
          {searching && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="shrink-0 rounded border border-border px-2 py-0.5 text-[11px] font-bold text-secondary-foreground hover:bg-secondary"
          >
            esc
          </button>
        </div>

        {/* 種類 (tab で切替) */}
        {kind !== 'all' && (
          <div className="flex items-center gap-1.5 border-b border-divider px-4 py-1.5">
            <span className="text-[12px] text-muted-foreground">種類:</span>
            <span className="rounded-full bg-accent px-2 py-0.5 text-[12px] font-bold text-primary">
              {KIND_LABEL[kind]}
            </span>
            <span className="text-[12px] text-muted-foreground">tab でつぎへ</span>
          </div>
        )}

        {/* 候補 */}
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-2">
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-secondary-foreground">
              {q ? `「${q}」に当てはまるものはありません。別の言い方で探してください。` : '入力すると候補が出ます。'}
            </p>
          ) : browsing ? (
            /* 行き先の地図。まとまりごとに畳んで、広い画面では2列に流す */
            <div className="columns-1 gap-x-4 px-2 sm:columns-2">
              {mapGroups.map((g) => (
                <section key={g.group} className="mb-3 break-inside-avoid">
                  <p className="px-2 pb-1 text-[11px] font-bold tracking-wider text-muted-foreground">
                    {g.group}
                  </p>
                  <ul>
                    {g.items.map((cmd) => {
                      const i = nextIndex();
                      return (
                        <CommandRow
                          key={cmd.id}
                          active={i === cursor}
                          icon={cmd.icon}
                          label={cmd.label}
                          sub={cmd.kind === 'do' ? cmd.hint : undefined}
                          compact
                          onHover={() => setCursor(i)}
                          onClick={() => run({ type: 'command', cmd })}
                          right={i === cursor ? <EnterBadge /> : null}
                        />
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <>
              {doList.length > 0 && (
                <Group label="やる">
                  {doList.map((cmd) => {
                    const i = nextIndex();
                    return (
                      <CommandRow
                        key={cmd.id}
                        active={i === cursor}
                        icon={cmd.icon}
                        label={cmd.label}
                        sub={cmd.hint}
                        onHover={() => setCursor(i)}
                        onClick={() => run({ type: 'command', cmd })}
                        right={i === cursor ? <EnterBadge /> : null}
                      />
                    );
                  })}
                </Group>
              )}

              {openList.length > 0 && (
                <Group label="ひらく">
                  {openList.map((cmd) => {
                    const i = nextIndex();
                    return (
                      <CommandRow
                        key={cmd.id}
                        active={i === cursor}
                        icon={cmd.icon}
                        label={cmd.label}
                        path={cmd.path}
                        onHover={() => setCursor(i)}
                        onClick={() => run({ type: 'command', cmd })}
                        right={i === cursor ? <EnterBadge /> : null}
                      />
                    );
                  })}
                </Group>
              )}

              {hitList.length > 0 && (
                <Group label="見つかったもの">
                  {hitList.map((hit) => {
                    const i = nextIndex();
                    return (
                      <CommandRow
                        key={hit.id}
                        active={i === cursor}
                        label={hit.name}
                        sub={hit.sub}
                        onHover={() => setCursor(i)}
                        onClick={() => run({ type: 'hit', hit })}
                        right={
                          <span className="flex shrink-0 items-center gap-2">
                            {hit.code && (
                              <span className="text-[12px] tabular-nums text-muted-foreground">{hit.code}</span>
                            )}
                            {hit.badge && (
                              <span className="rounded border border-border px-1.5 py-0.5 text-[11px] font-bold text-secondary-foreground">
                                {hit.badge}
                              </span>
                            )}
                          </span>
                        }
                      />
                    );
                  })}
                  {showSeeAll && seeAllPath && (() => {
                    const i = nextIndex();
                    return (
                      <CommandRow
                        key="see-all"
                        active={i === cursor}
                        label={`「${q.trim()}」の検索結果をすべて見る`}
                        sub={foundTotal > hits.length ? `全部で ${foundTotal}件 見つかっています` : undefined}
                        onHover={() => setCursor(i)}
                        onClick={() => run({ type: 'seeAll', path: seeAllPath })}
                        right={i === cursor ? <EnterBadge /> : null}
                      />
                    );
                  })()}
                </Group>
              )}

              {/* **見えないものは件数にも出さない** (36章)。
                  0件と出すと「無い」と読まれるが、実際は「見せてもらえない」 */}
              {hiddenKinds.length > 0 && q.trim().length >= 2 && (
                <p className="px-4 py-2 text-[12px] text-muted-foreground">
                  {hiddenKinds.join('・')} は見る権限がないので探していません。
                </p>
              )}
            </>
          )}
        </div>

        {/* 足元 */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-divider bg-secondary/40 px-4 py-2 text-[12px] text-muted-foreground">
          <span>↑↓ で選ぶ</span>
          <span>enter で実行</span>
          <span>tab で種類を切り替え</span>
          <span className="ml-auto">
            {browsing ? `打つと絞り込めます（${total}件をここから開けます）` : `機能はすべてここから開けます（${total}件）`}
          </span>
        </div>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <p className="px-4 py-1 text-[12px] font-bold text-muted-foreground">{label}</p>
      <ul>{children}</ul>
    </div>
  );
}

function EnterBadge() {
  return (
    <span className="flex shrink-0 items-center gap-1 rounded border border-primary/30 bg-accent px-1.5 py-0.5 text-[11px] font-bold text-primary">
      <CornerDownLeft className="h-3 w-3" aria-hidden="true" />
      enter
    </span>
  );
}

function CommandRow({
  active, icon: Icon, label, sub, path, right, compact, onHover, onClick,
}: {
  active: boolean;
  icon?: LucideIcon;
  label: string;
  sub?: string;
  path?: string;
  right?: React.ReactNode;
  /** 地図のときは1行で詰める (83件を一望できるようにするため) */
  compact?: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        data-active={active}
        onMouseMove={onHover}
        onClick={onClick}
        className={cn(
          'flex w-full items-center gap-2 rounded-control text-left transition-colors',
          compact ? 'h-ctl-1 px-2' : 'px-4 py-2',
          active ? 'bg-accent' : 'hover:bg-secondary'
        )}
      >
        {Icon ? (
          <Icon
            className={cn('h-4 w-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')}
            aria-hidden="true"
          />
        ) : (
          <span className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-foreground', compact ? 'text-[13px] font-medium' : 'text-[14px] font-bold')}>{label}</span>
          {sub && !compact && <span className="mt-0.5 block truncate text-[12px] text-secondary-foreground">{sub}</span>}
        </span>
        {path && (
          <span className="hidden shrink-0 items-center gap-1 text-[12px] text-muted-foreground sm:flex">
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
            {path}
          </span>
        )}
        {right}
      </button>
    </li>
  );
}
