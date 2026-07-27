import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Search, ChevronDown, X } from "lucide-react";

interface Option {
  value: string;
  label: string;
  subLabel?: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  onSearchChange?: (search: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  onSearchChange,
  placeholder = "検索...",
  disabled = false,
  className = "",
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  // サーバ検索 (onSearchChange 指定) が有効な場合も、デバウンス中の即時ユーザフィードバック
  // のためクライアント側フィルタを併用する。サーバ側で絞り込まれた結果が返ったあとも
  // 同じ条件でさらにローカル絞り込みされるため表示は一貫する。
  const filtered = search
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(search.toLowerCase()) ||
          (o.subLabel && o.subLabel.toLowerCase().includes(search.toLowerCase()))
      )
    : options;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!onSearchChange) return;
    const timer = setTimeout(() => onSearchChange(search), 200);
    return () => clearTimeout(timer);
  }, [search, onSearchChange]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setOpen(!open); setSearch(""); }}
        className="flex h-ctl-3 w-full items-center justify-between gap-2 rounded-control border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        title={selected ? selected.label : undefined}
      >
        {/*
          選んだものは**1行で省略する**。`min-w-0` と `truncate` が無いと、
          長い会社名 (「GMOインターネットグループ株式会社」) が高さ40pxの枠の中で
          2行に折り返し、中央寄せに見えて崩れる (実際に起きていた)。
        */}
        <span
        className={`min-w-0 flex-1 truncate text-left ${selected ? "text-foreground" : "text-muted-foreground"}`}
        >
          {selected ? selected.label : placeholder}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {value && (
            <X
              className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); onChange(""); setOpen(false); }}
            />
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </div>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
          <div className="p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={placeholder}
                className="h-8 pl-8 text-sm"
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                該当なし
              </div>
            ) : (
              filtered.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => { onChange(option.value); setOpen(false); setSearch(""); }}
                  className={`flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground ${
                    option.value === value ? "bg-primary/10 font-medium" : ""
                  }`}
                >
                  <span>{option.label}</span>
                  {option.subLabel && (
                    <span className="text-xs text-muted-foreground">{option.subLabel}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
