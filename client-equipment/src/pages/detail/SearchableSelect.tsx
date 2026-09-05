/**
 * 機材詳細の「既存の機材を紐付ける」で使う、検索欄つきのセレクト。
 * 台帳の全機材が候補になるので、素の Select だと一覧が長すぎて選べない。
 */
import { useState, useRef, useEffect } from "react";
import { ChevronDown, Search } from "lucide-react";

export function SearchableSelect({ value, onChange, items, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  items: { id: string; label: string }[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = items.find((it) => it.id === value);
  const filtered = search
    ? items.filter((it) => it.label.toLowerCase().includes(search.toLowerCase()))
    : items;

  return (
    <div ref={ref} className="relative flex-1">
      <button
        type="button"
        className="min-h-tap lg:min-h-0 w-full flex items-center justify-between px-3 py-2 text-sm border rounded-md bg-background hover:bg-muted/50 transition-colors"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) setTimeout(() => inputRef.current?.focus(), 50);
        }}
      >
        <span className={selected ? "truncate" : "text-muted-foreground truncate"}>
          {selected ? selected.label : (placeholder || "選ぶ")}
        </span>
        <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-1" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-popover border rounded-md shadow-lg">
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
              placeholder="名前・型名・IDで探す"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">見つかりません</div>
            ) : (
              filtered.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors truncate block ${value === it.id ? "bg-primary/10 font-medium" : ""}`}
                  onClick={() => { onChange(it.id); setOpen(false); setSearch(""); }}
                >
                  {it.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
