/**
 * GlobalSearchBox — 移行期のグローバル検索 (案件・顧客・仕入先)
 *
 * Phase 3 で ⌘K のコマンドパレットに統合して、このコンポーネントは消す。
 * それまで検索が使えなくならないよう、上辺のスロットに差しておく。
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { PROJECT_STAGE, statusOf } from "@gmo-onair/shared/src/constants/statuses";

interface SearchResults {
  projects: Array<{ id: string; code: string; gls_number: string | null; name: string; stage: string }>;
  customers: Array<{ id: string; name: string; short_name: string }>;
  vendors: Array<{ id: string; name: string; vendor_type: string }>;
}

export default function GlobalSearchBox() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q) {
      setSearchResults(null);
      setShowDropdown(false);
      return;
    }
    setSearching(true);
    try {
      const res = await api.get("/search", { params: { q } });
      setSearchResults(res.data.data);
      setShowDropdown(true);
    } catch {
      setSearchResults(null);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(searchQuery), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, doSearch]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const handleResultClick = (path: string) => {
    navigate(path);
    setShowDropdown(false);
    setSearchQuery("");
    setSearchResults(null);
  };

  const hasResults =
    searchResults &&
    (searchResults.projects.length > 0 ||
      searchResults.customers.length > 0 ||
      searchResults.vendors.length > 0);

  return (
    <div ref={searchRef} className="relative hidden shrink-0 sm:block">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="text"
          placeholder="案件・顧客・仕入先..."
          className="h-10 w-40 pl-9 pr-8 text-sm lg:w-56"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => {
            if (searchResults) setShowDropdown(true);
          }}
          aria-label="案件・顧客・仕入先をさがす"
        />
        {searching && (
          <Loader2
            className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        )}
      </div>

      {showDropdown && searchResults && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-border bg-card shadow-lg">
          <div className="max-h-72 overflow-y-auto p-1">
            {!hasResults && (
              <p className="px-3 py-4 text-center text-[13px] text-secondary-foreground">
                当てはまるものはありませんでした
              </p>
            )}
            {searchResults.projects.length > 0 && (
              <div>
                <p className="px-3 py-1.5 text-[12px] font-bold text-muted-foreground">案件</p>
                {searchResults.projects.map((proj) => (
                  <button
                    key={proj.id}
                    onClick={() => handleResultClick(`/sales/projects/${proj.id}`)}
                    className="flex w-full items-center gap-2 rounded-control px-3 py-2 text-left text-sm transition-colors hover:bg-secondary"
                  >
                    <span className="min-w-0 flex-1 truncate">{proj.name}</span>
                    <span className="shrink-0 text-[12px] text-muted-foreground">
                      {proj.gls_number || proj.code}
                    </span>
                    <Badge variant="outline" className="shrink-0 text-[11px]">
                      {statusOf(PROJECT_STAGE, proj.stage).label}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
            {searchResults.customers.length > 0 && (
              <div>
                <p className="px-3 py-1.5 text-[12px] font-bold text-muted-foreground">お客様</p>
                {searchResults.customers.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleResultClick(`/sales/customers/${c.id}`)}
                    className="flex w-full items-center gap-2 rounded-control px-3 py-2 text-left text-sm transition-colors hover:bg-secondary"
                  >
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    {c.short_name && (
                      <span className="shrink-0 text-[12px] text-muted-foreground">({c.short_name})</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {searchResults.vendors.length > 0 && (
              <div>
                <p className="px-3 py-1.5 text-[12px] font-bold text-muted-foreground">仕入先</p>
                {searchResults.vendors.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => handleResultClick("/budget/vendors")}
                    className="flex w-full items-center gap-2 rounded-control px-3 py-2 text-left text-sm transition-colors hover:bg-secondary"
                  >
                    <span className="min-w-0 flex-1 truncate">{v.name}</span>
                    {v.vendor_type && (
                      <span className="shrink-0 text-[12px] text-muted-foreground">{v.vendor_type}</span>
                    )}
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
