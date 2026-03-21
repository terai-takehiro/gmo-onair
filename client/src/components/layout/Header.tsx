import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/features/auth/AuthContext";
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
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";

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
  opportunities: Array<{ id: string; opp_code: string; title: string; stage: string }>;
  projects: Array<{ id: string; gls_number: string; name: string; status: string }>;
  customers: Array<{ id: string; name: string; short_name: string }>;
  vendors: Array<{ id: string; name: string; vendor_type: string }>;
}

export default function Header({ title }: { title?: string }) {
  const { currentUser, logout } = useAuth();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const navigate = useNavigate();

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
    (searchResults.opportunities.length > 0 ||
      searchResults.projects.length > 0 ||
      searchResults.customers.length > 0 ||
      searchResults.vendors.length > 0);

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={toggleSidebar}
        >
          <Menu className="h-5 w-5" />
        </Button>
        {title && (
          <h1 className="text-lg font-semibold">{title}</h1>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Global Search */}
        <div ref={searchRef} className="relative hidden sm:block">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="検索..."
              className="w-64 pl-9 pr-8 h-9"
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

                {searchResults.opportunities.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                      ヨミ
                    </div>
                    {searchResults.opportunities.map((opp) => (
                      <button
                        key={opp.id}
                        className="flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-sm hover:bg-accent text-left"
                        onClick={() => handleResultClick(`/opportunities/${opp.id}`)}
                      >
                        <span className="truncate flex-1">{opp.title}</span>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {stageLabelMap[opp.stage] || opp.stage}
                        </Badge>
                      </button>
                    ))}
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
                        onClick={() => handleResultClick(`/projects/${proj.id}/episodes`)}
                      >
                        <span className="text-muted-foreground text-xs shrink-0">{proj.gls_number}</span>
                        <span className="truncate flex-1">{proj.name}</span>
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

        <span className="text-xs text-muted-foreground">v0.1.0</span>
        {currentUser && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2">
                <span className="text-sm font-medium">{currentUser.name}</span>
                <Badge variant="secondary" className="text-xs">
                  {roleLabelMap[currentUser.role] || currentUser.role}
                </Badge>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
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
