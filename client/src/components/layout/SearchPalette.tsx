/**
 * ⌘K の窓（上辺バーの検索ボタンが開く）
 *
 * ── 4つの状態を混ぜない（⑪ 探す と同じ決めごと）──────────────
 *
 * **まだ打っていない / 探している / 0件 / 失敗した** は別のことです。
 * 打つ前に「該当なし」と出すと、探す前から無いと言うことになります。
 *
 * ── 遅れて届いた結果で上書きしない ──────────────────────────
 *
 * 打ち込みを 250ms 待ってから投げますが、待つのは**投げるまで**です。
 * 「みら」の結果が「みらいてっく」より後に届くと新しい結果が消えるので、
 * 投げるたびに番号を振り、**最後に投げたぶんだけ**を画面に出します。
 *
 * ── 上下キーで一直線に動かす ────────────────────────────────
 *
 * 機能・案件・お客様・仕入先は**種類が違っても同じ形の1行**にします
 * （`Hit`）。種類ごとに区切ると、矢印キーで塊をまたぐたびに
 * 「次はどこへ行くのか」が読めなくなります。
 * いま指している行の色は `tokens-v4.css` の `[data-cursor='on']`
 * （探して選ぶ欄と**同じ見え方**にする）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Search, Building2, Truck, FolderKanban, Clock, CornerDownLeft } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { PROJECT_STAGE, statusOf } from '@gmo-onair/shared/src/constants/statuses';
import { readRecent, type RecentItem } from '@gmo-onair/shared/src/client-v4/recent';
import { useAuth } from '@/contexts/platform/AuthContext';
import { FEATURES, type Feature } from './searchFeatures';

interface SearchResults {
  projects: Array<{ id: string; code: string; gls_number: string | null; name: string; stage: string }>;
  customers: Array<{ id: string; name: string; short_name: string }>;
  vendors: Array<{ id: string; name: string; vendor_type: string }>;
}

/** 窓の中の1行。**種類が違っても同じ形**にして、上下キーで一直線に動かす */
interface Hit {
  key: string;
  group: string;
  label: string;
  sub?: string;
  icon?: LucideIcon;
  badge?: string;
  /** 別のバンドル・外部サイト。`navigate()` では飛べない */
  external?: boolean;
  to: string;
}

export function SearchPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const { currentUser, hasPermission } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const seq = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  // 開くたびに読み直す（閉じている間に開いた案件を次に出す）
  useEffect(() => {
    if (open) {
      setRecent(readRecent());
      setQuery('');
      setResults(null);
      setCursor(0);
    }
  }, [open]);

  const run = useCallback(async (q: string) => {
    const mine = ++seq.current;
    setSearching(true);
    try {
      const data = (await api.get('/search', { params: { q } })).data.data as SearchResults;
      if (mine !== seq.current) return;
      setResults(data);
    } catch {
      // **黙って落とす。** 機能の候補は手元で出せるので、窓は使えたまま
      if (mine === seq.current) setResults(null);
    } finally {
      if (mine === seq.current) setSearching(false);
    }
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      seq.current += 1;
      setResults(null);
      setSearching(false);
      return;
    }
    const t = setTimeout(() => run(q), 250);
    return () => clearTimeout(t);
  }, [query, run]);

  /** 権限が無いものは出さない（押してから 403 で気づかせない） */
  const allowed = useCallback(
    (f: Feature) => {
      if (f.adminOnly) return currentUser?.role === 'system_admin';
      if (f.modules) return f.modules.some((m) => hasPermission(m));
      if (f.module) return hasPermission(f.module, f.minLevel);
      return true;
    },
    [currentUser, hasPermission],
  );

  const hits: Hit[] = useMemo(() => {
    const q = query.trim();
    const out: Hit[] = [];

    if (!q) {
      // **打つ前は「よく行く先」と「最近見たもの」。**
      // 空欄に「該当なし」と出すと、探す前から無いと言うことになる
      for (const f of FEATURES.filter(allowed).slice(0, 6)) {
        out.push({ key: `f:${f.to}`, group: 'よく行く先', label: f.label, sub: f.sub, icon: f.icon, to: f.to, external: f.external });
      }
      for (const r of recent) {
        out.push({
          key: `r:${r.to}`,
          group: '最近見たもの（この端末）',
          label: r.label,
          sub: [r.kind === 'customer' ? 'お客様' : '案件', r.sub].filter(Boolean).join(' ・ '),
          icon: Clock,
          to: r.to,
        });
      }
      return out;
    }

    const needle = q.toLowerCase();
    for (const f of FEATURES) {
      if (!allowed(f)) continue;
      if (!`${f.label} ${f.sub}`.toLowerCase().includes(needle)) continue;
      out.push({ key: `f:${f.to}`, group: '機能', label: f.label, sub: f.sub, icon: f.icon, to: f.to, external: f.external });
      if (out.length >= 6) break;
    }
    for (const p of results?.projects ?? []) {
      out.push({
        key: `p:${p.id}`,
        group: '案件',
        label: p.name,
        sub: p.gls_number || p.code,
        icon: FolderKanban,
        badge: statusOf(PROJECT_STAGE, p.stage).label,
        to: `/sales/projects/${p.id}`,
      });
    }
    for (const c of results?.customers ?? []) {
      out.push({ key: `c:${c.id}`, group: 'お客様', label: c.name, sub: c.short_name, icon: Building2, to: `/sales/customers/${c.id}` });
    }
    for (const v of results?.vendors ?? []) {
      out.push({ key: `v:${v.id}`, group: '仕入先', label: v.name, sub: v.vendor_type, icon: Truck, to: '/budget/vendors' });
    }
    return out;
  }, [query, results, recent, allowed]);

  // 候補が変わったら先頭に戻す（前の並びの位置に残ると別のものを開く）
  useEffect(() => setCursor(0), [hits.length, query]);

  const go = useCallback(
    (hit: Hit) => {
      onOpenChange(false);
      // **別のバンドルは `navigate()` では飛べない**（React Router は同じアプリしか知らない）。
      // 外部サイト（別 VPS）は別のタブで開く — ONAiR を閉じさせない
      if (/^https?:\/\//.test(hit.to)) window.open(hit.to, '_blank', 'noopener,noreferrer');
      else if (hit.external) window.location.href = hit.to;
      else navigate(hit.to);
    },
    [navigate, onOpenChange],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((i) => (hits.length === 0 ? 0 : (i + 1) % hits.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((i) => (hits.length === 0 ? 0 : (i - 1 + hits.length) % hits.length));
    } else if (e.key === 'Enter') {
      const hit = hits[cursor];
      if (hit) {
        e.preventDefault();
        go(hit);
      }
    }
  };

  // 矢印で選んだ行が窓の外にあるときはスクロールして見せる
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-cursor="on"]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  let lastGroup = '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-xl" aria-describedby={undefined}>
        {/* 見出しは置かない。**探す窓は打ち始められることが全部**なので、
            1行ぶんの高さも候補に使う（読み上げ用の名前は入力欄が持つ） */}
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="案件・顧客・機能を検索"
            placeholder="案件・顧客・機能を検索"
            className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
          />
          {searching && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />}
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
          {hits.length === 0 ? (
            <p className="text-sub px-3 py-6 text-center text-muted-foreground">
              {query.trim()
                ? '見つかりませんでした。案件名の一部・GLS番号・お客様名・仕入先名でも探せます'
                : '案件名・GLS番号・お客様名・仕入先名・画面の名前で探せます'}
            </p>
          ) : (
            hits.map((hit, i) => {
              const head = hit.group !== lastGroup ? hit.group : null;
              lastGroup = hit.group;
              const Icon = hit.icon;
              return (
                <div key={hit.key}>
                  {head && <p className="v4-eyebrow px-3 pb-1 pt-2.5">{head}</p>}
                  <button
                    type="button"
                    data-cursor={i === cursor ? 'on' : undefined}
                    onMouseMove={() => setCursor(i)}
                    onClick={() => go(hit)}
                    className="text-list min-h-tap flex w-full items-center gap-2.5 rounded-control-lg px-3 py-2 text-left lg:min-h-0"
                  >
                    {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                    <span className="min-w-0 flex-1 truncate">{hit.label}</span>
                    {hit.sub && <span className="text-sub-sm shrink-0 truncate text-muted-foreground">{hit.sub}</span>}
                    {hit.badge && (
                      <Badge variant="outline" className="text-badge shrink-0">
                        {hit.badge}
                      </Badge>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="text-note flex items-center gap-3 border-t border-border px-4 py-2 text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CornerDownLeft className="h-3 w-3" aria-hidden="true" />開く
          </span>
          <span>↑↓ 選ぶ</span>
          <span>Esc 閉じる</span>
          <span className="ml-auto truncate">見る権限が無いものは出ません</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
