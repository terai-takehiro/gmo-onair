/**
 * グローバル検索 — 上辺バーの差し込み口 (S3)
 *
 * 旧 `Header.tsx` の中に 110 行として埋まっていたものを、独立した部品にしました。
 * 共通シェルは `searchSlot` に何が来るかを知りません (案件管理だけが持つ機能なので、
 * シェルに畳み込むと他の2アプリが使わないコードを背負う)。
 *
 * ── 移設のときに直した「押しても目的の画面に行かない」3件 ──────
 *
 * 遷移先が**いまのルートと一致していませんでした**。`App.tsx` の転送で救われて
 * いるものの、案件は**一覧に飛ばされて id が捨てられていた**ため、
 * 検索で案件を選んでも詳細が開きませんでした:
 *
 *   `/projects/${id}`     → `App.tsx` の `/projects/*` が `/sales/projects` へ転送 (**id が消える**)
 *   `/masters/customers`  → `/sales/customers` へ転送 (1回余計に飛ぶ)
 *   `/masters/vendors`    → `/budget/vendors` へ転送 (同上)
 *
 * → 実ルートを直接指すように直しました。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import api from '@/lib/api';
import { PROJECT_STAGE, statusOf } from '@gmo-onair/shared/src/constants/statuses';

interface SearchResults {
  projects: Array<{ id: string; code: string; gls_number: string | null; name: string; stage: string }>;
  customers: Array<{ id: string; name: string; short_name: string }>;
  vendors: Array<{ id: string; name: string; vendor_type: string }>;
}

export default function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q) {
      setResults(null);
      setOpen(false);
      return;
    }
    setSearching(true);
    try {
      const res = await api.get('/search', { params: { q } });
      setResults(res.data.data);
      setOpen(true);
    } catch {
      setResults(null);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const go = (path: string) => {
    navigate(path);
    setOpen(false);
    setQuery('');
    setResults(null);
  };

  const hasResults =
    results && (results.projects.length > 0 || results.customers.length > 0 || results.vendors.length > 0);

  return (
    <div ref={boxRef} className="relative hidden shrink-0 sm:block">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="案件・顧客・仕入先..."
          className="h-9 w-40 pl-9 pr-8 text-sm lg:w-56"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results) setOpen(true);
          }}
        />
        {searching && (
          <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {open && results && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-card border border-border bg-card shadow-lg">
          <div className="max-h-72 overflow-y-auto p-1">
            {!hasResults && <p className="text-sub px-3 py-4 text-center text-muted-foreground">該当なし</p>}

            {results.projects.length > 0 && (
              <div>
                <p className="text-th px-3 py-1.5 text-muted-foreground">案件</p>
                {results.projects.map((proj) => (
                  <button
                    key={proj.id}
                    onClick={() => go(`/sales/projects/${proj.id}`)}
                    className="text-list flex w-full items-center gap-2 rounded-control-lg px-3 py-2 text-left hover:bg-accent"
                  >
                    <span className="text-sub-sm shrink-0 text-muted-foreground">{proj.gls_number || proj.code}</span>
                    <span className="flex-1 truncate">{proj.name}</span>
                    <Badge variant="outline" className="text-badge shrink-0">
                      {statusOf(PROJECT_STAGE, proj.stage).label}
                    </Badge>
                  </button>
                ))}
              </div>
            )}

            {results.customers.length > 0 && (
              <div>
                <p className="text-th px-3 py-1.5 text-muted-foreground">顧客</p>
                {results.customers.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => go(`/sales/customers/${c.id}`)}
                    className="text-list flex w-full items-center gap-2 rounded-control-lg px-3 py-2 text-left hover:bg-accent"
                  >
                    <span className="flex-1 truncate">{c.name}</span>
                    {c.short_name && <span className="text-sub-sm shrink-0 text-muted-foreground">({c.short_name})</span>}
                  </button>
                ))}
              </div>
            )}

            {results.vendors.length > 0 && (
              <div>
                <p className="text-th px-3 py-1.5 text-muted-foreground">仕入先</p>
                {results.vendors.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => go('/budget/vendors')}
                    className="text-list flex w-full items-center gap-2 rounded-control-lg px-3 py-2 text-left hover:bg-accent"
                  >
                    <span className="flex-1 truncate">{v.name}</span>
                    {v.vendor_type && <span className="text-sub-sm shrink-0 text-muted-foreground">{v.vendor_type}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
