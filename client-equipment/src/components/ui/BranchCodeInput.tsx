import { useRef, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { ChevronDown, Plus, Check } from "lucide-react";
import api from "@/lib/api";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export default function BranchCodeInput({ value, onChange, placeholder = "GMO-IG" }: Props) {
  const [open, setOpen] = useState(false);
  const [inputMode, setInputMode] = useState(false); // true = typing new value
  const [draft, setDraft] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: options = [] } = useQuery<string[]>({
    queryKey: ["equipment-branch-codes"],
    queryFn: () => api.get("/equipment/branch-codes").then(r => r.data.data),
    staleTime: 60_000,
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setInputMode(false);
        setDraft("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredOptions = draft
    ? options.filter(o => o.toLowerCase().includes(draft.toLowerCase()))
    : options;

  const handleSelect = (v: string) => {
    onChange(v);
    setOpen(false);
    setInputMode(false);
    setDraft("");
  };

  const handleAddNew = () => {
    if (draft.trim()) {
      onChange(draft.trim());
      setOpen(false);
      setInputMode(false);
      setDraft("");
    }
  };

  const handleNewKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); handleAddNew(); }
    if (e.key === "Escape") { setInputMode(false); setDraft(""); }
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger button (looks like Select) */}
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setInputMode(false); setDraft(""); }}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background",
          "hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          "transition-colors",
          !value && "text-muted-foreground"
        )}
      >
        <span className="truncate">{value || placeholder}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 rounded-md border border-border bg-card shadow-md overflow-hidden">
          {/* Existing options */}
          <div className="max-h-48 overflow-y-auto py-1">
            {filteredOptions.length === 0 && !inputMode && (
              <p className="px-3 py-2 text-sm text-muted-foreground">選択肢なし</p>
            )}
            {filteredOptions.map(o => (
              <button
                key={o}
                type="button"
                onMouseDown={e => { e.preventDefault(); handleSelect(o); }}
                className="h-ctl-3 w-full flex items-center gap-2 text-left px-3 text-sm hover:bg-accent transition-colors"
              >
                {value === o
                  ? <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                  : <span className="w-3.5 shrink-0" />
                }
                {o}
              </button>
            ))}
          </div>

          {/* Add new input */}
          <div className="border-t border-border p-2">
            {inputMode ? (
              <div className="flex gap-1.5">
                <input
                  ref={inputRef}
                  autoFocus
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={handleNewKeyDown}
                  placeholder="新しい所管コードを入力..."
                  className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
                />
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); handleAddNew(); }}
                  disabled={!draft.trim()}
                  className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors"
                >
                  追加
                </button>
              </div>
            ) : (
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); setInputMode(true); setDraft(""); }}
                className="h-ctl-1 w-full flex items-center gap-1.5 px-2 text-sm text-primary hover:bg-accent rounded transition-colors"
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                新規追加
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
