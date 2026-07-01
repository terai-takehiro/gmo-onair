import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/platform/AuthContext";
import { useUiStore } from "@/stores/uiStore";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Loader2 } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import api from "@/lib/api";
import SharedHeader from "@gmo-onair/shared/src/client/SharedHeader";
import ManualModal from "@gmo-onair/shared/src/client/manual/ManualModal";
import { PROJECT_STAGE, statusOf } from "@gmo-onair/shared/src/constants/statuses";
import { SALES_MANUAL } from "@/manual/content";

interface SearchResults {
  projects: Array<{ id: string; code: string; gls_number: string | null; name: string; stage: string }>;
  customers: Array<{ id: string; name: string; short_name: string }>;
  vendors: Array<{ id: string; name: string; vendor_type: string }>;
}

const APP_LABELS: Record<string, string> = {
  "/sales": "案件管理",
  "/budget": "財務管理",
  "/studio": "カレンダー",
  "/admin": "システム管理",
};

export default function Header({ title }: { title?: string }) {
  const { currentUser, logout } = useAuth();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isHome = pathname === "/" || pathname === "";
  const [manualOpen, setManualOpen] = useState(false);

  const appLabel = title ?? Object.entries(APP_LABELS).find(([p]) => pathname.startsWith(p))?.[1] ?? "";
  const currentApp = pathname.startsWith("/sales") ? "sales"
    : pathname.startsWith("/budget") ? "budget"
    : pathname.startsWith("/studio") ? "studio"
    : "home";

  // ─── グローバル検索 ──────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q) { setSearchResults(null); setShowDropdown(false); return; }
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
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery, doSearch]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const handleResultClick = (path: string) => {
    navigate(path); setShowDropdown(false); setSearchQuery(""); setSearchResults(null);
  };

  const hasResults = searchResults && (
    searchResults.projects.length > 0 || searchResults.customers.length > 0 || searchResults.vendors.length > 0
  );

  // ─── 検索ボックス（centerContent スロット用） ─────────────────────────────
  const searchBox = (
    <div ref={searchRef} className="relative hidden sm:block shrink-0">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          placeholder="案件・顧客・仕入先..."
          className="w-40 lg:w-56 pl-9 pr-8 h-9 text-sm"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => { if (searchResults) setShowDropdown(true); }}
        />
        {searching && (
          <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {showDropdown && searchResults && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-xl border border-border bg-card shadow-lg">
          <div className="max-h-72 overflow-y-auto p-1">
            {!hasResults && (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">該当なし</p>
            )}
            {searchResults.projects.length > 0 && (
              <div>
                <p className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">案件</p>
                {searchResults.projects.map((proj) => (
                  <button key={proj.id} onClick={() => handleResultClick(`/projects/${proj.id}`)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-accent text-left transition-colors">
                    <span className="text-muted-foreground text-xs shrink-0 ">{proj.gls_number || proj.code}</span>
                    <span className="truncate flex-1">{proj.name}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">{statusOf(PROJECT_STAGE, proj.stage).label}</Badge>
                  </button>
                ))}
              </div>
            )}
            {searchResults.customers.length > 0 && (
              <div>
                <p className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">顧客</p>
                {searchResults.customers.map((c) => (
                  <button key={c.id} onClick={() => handleResultClick("/masters/customers")}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-accent text-left transition-colors">
                    <span className="truncate flex-1">{c.name}</span>
                    {c.short_name && <span className="text-xs text-muted-foreground shrink-0">({c.short_name})</span>}
                  </button>
                ))}
              </div>
            )}
            {searchResults.vendors.length > 0 && (
              <div>
                <p className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">仕入先</p>
                {searchResults.vendors.map((v) => (
                  <button key={v.id} onClick={() => handleResultClick("/masters/vendors")}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-accent text-left transition-colors">
                    <span className="truncate flex-1">{v.name}</span>
                    {v.vendor_type && <span className="text-xs text-muted-foreground shrink-0">{v.vendor_type}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <SharedHeader
        currentApp={currentApp}
        appLabel={appLabel}
        currentUser={currentUser}
        onLogout={logout}
        onSwitchUser={logout}
        onToggleSidebar={isHome ? undefined : toggleSidebar}
        centerContent={searchBox}
        onOpenManual={() => setManualOpen(true)}
      />
      <ManualModal open={manualOpen} onOpenChange={setManualOpen} content={SALES_MANUAL} />
    </>
  );
}
