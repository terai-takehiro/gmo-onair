import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/platform/AuthContext";
import { useUiStore } from "@/stores/uiStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Menu, LogOut, ChevronDown, Search, Loader2 } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import api from "@/lib/api";
import AppSwitcher from "@gmo-onair/shared/src/client/AppSwitcher";

const roleLabelMap: Record<string, string> = {
  system_admin: "システム管理者",
  staff: "スタッフ",
  viewer: "閲覧者",
  external_client: "外部クライアント",
};

const stageLabelMap: Record<string, string> = {
  neta: "ネタ",
  d_hold: "D保留",
  c_proposal: "C提案",
  b_verbal: "B内示",
  a_won: "A受注",
  s_completed: "S完了",
  e_lost: "E失注",
};

interface SearchResults {
  projects: Array<{ id: string; code: string; gls_number: string | null; name: string; stage: string }>;
  customers: Array<{ id: string; name: string; short_name: string }>;
  vendors: Array<{ id: string; name: string; vendor_type: string }>;
}

const APP_LABELS: Record<string, string> = {
  "/sales": "案件管理",
  "/budget": "予算管理",
  "/studio": "スタジオ予約",
  "/admin": "システム管理",
};

export default function Header({ title }: { title?: string }) {
  const { currentUser, logout } = useAuth();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isHome = pathname === "/" || pathname === "";

  // Auto-detect app name from path
  const autoTitle = title || Object.entries(APP_LABELS).find(([prefix]) => pathname.startsWith(prefix))?.[1] || "";

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleSwitchUser = () => {
    logout();
    navigate("/login");
  };

  const doSearch = useCallback(async (q: string) => {
    if (!q || q.length < 1) {
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
    debounceRef.current = setTimeout(() => {
      doSearch(searchQuery);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, doSearch]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
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
    <header className="flex h-14 items-center justify-between border-b bg-card px-3 sm:px-5 relative z-30">
      <div className="flex items-center gap-3 min-w-0">
        <AppSwitcher currentApp={pathname.startsWith("/sales") ? "sales" : pathname.startsWith("/budget") ? "budget" : pathname.startsWith("/studio") ? "studio" : "home"} />
        {!isHome && (
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden shrink-0 h-9 w-9"
            onClick={toggleSidebar}
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <div className="flex items-center gap-1.5 min-w-0">
          <a href="/" className="text-sm font-bold text-primary hover:opacity-80 transition-opacity shrink-0">ONAiR</a>
          {autoTitle && (
            <>
              <span className="text-muted-foreground/40 shrink-0">/</span>
              <span className="text-sm font-semibold text-foreground truncate max-w-[200px]">{autoTitle}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Global Search */}
        <div ref={searchRef} className="relative hidden sm:block">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="請求KEY・案件名で検索..."
              className="w-40 sm:w-56 lg:w-64 pl-9 pr-8 h-9 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => {
                if (searchResults) setShowDropdown(true);
              }}
            />
            {searching && (
              <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>

          {showDropdown && searchResults && (
            <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-md border bg-popover shadow-lg">
              <div className="max-h-80 overflow-y-auto p-1">
                {!hasResults && (
                  <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                    該当する結果がありません
                  </div>
                )}

                {searchResults.projects.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                      案件
                    </div>
                    {searchResults.projects.map((proj) => (
                      <button
                        key={proj.id}
                        className="flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-sm hover:bg-accent text-left"
                        onClick={() => handleResultClick(`/projects/${proj.id}`)}
                      >
                        <span className="text-muted-foreground text-xs shrink-0">{proj.gls_number || proj.code}</span>
                        <span className="truncate flex-1">{proj.name}</span>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {stageLabelMap[proj.stage] || proj.stage}
                        </Badge>
                      </button>
                    ))}
                  </div>
                )}

                {searchResults.customers.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                      顧客
                    </div>
                    {searchResults.customers.map((cust) => (
                      <button
                        key={cust.id}
                        className="flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-sm hover:bg-accent text-left"
                        onClick={() => handleResultClick("/masters/customers")}
                      >
                        <span className="truncate flex-1">{cust.name}</span>
                        {cust.short_name && (
                          <span className="text-xs text-muted-foreground shrink-0">({cust.short_name})</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {searchResults.vendors.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                      仕入先
                    </div>
                    {searchResults.vendors.map((v) => (
                      <button
                        key={v.id}
                        className="flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-sm hover:bg-accent text-left"
                        onClick={() => handleResultClick("/masters/vendors")}
                      >
                        <span className="truncate flex-1">{v.name}</span>
                        {v.vendor_type && (
                          <span className="text-xs text-muted-foreground shrink-0">{v.vendor_type}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <span className="hidden lg:inline text-xs text-muted-foreground/50">v{__APP_VERSION__}</span>
        {currentUser && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="flex items-center gap-1.5 px-2">
                <span className="hidden sm:inline text-sm font-medium">{currentUser.name}</span>
                <Badge variant="secondary" className="hidden md:inline text-xs">
                  {roleLabelMap[currentUser.role] || currentUser.role}
                </Badge>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>{currentUser.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSwitchUser}>
                ユーザー切替
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                ログアウト
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
