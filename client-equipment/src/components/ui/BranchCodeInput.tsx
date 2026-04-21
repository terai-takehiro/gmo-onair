import { useRef, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "./input";
import { Plus } from "lucide-react";
import api from "@/lib/api";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export default function BranchCodeInput({ value, onChange, placeholder = "GMO-IG" }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: options = [] } = useQuery<string[]>({
    queryKey: ["equipment-branch-codes"],
    queryFn: () => api.get("/equipment/branch-codes").then(r => r.data.data),
    staleTime: 60_000,
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = value
    ? options.filter(o => o.toLowerCase().includes(value.toLowerCase()))
    : options;
  const isNew = value.trim() !== "" && !options.some(o => o.toLowerCase() === value.toLowerCase());
  const showDropdown = open && (filtered.length > 0 || isNew);

  return (
    <div className="relative" ref={containerRef}>
      <Input
        value={value}
        placeholder={placeholder}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {showDropdown && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 rounded-md border border-border bg-card shadow-md max-h-48 overflow-y-auto">
          {filtered.map(o => (
            <button
              key={o}
              type="button"
              onMouseDown={e => { e.preventDefault(); onChange(o); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors ${value === o ? "font-medium text-primary" : ""}`}
            >
              {o}
            </button>
          ))}
          {isNew && (
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-accent border-t border-border transition-colors flex items-center gap-1.5"
            >
              <Plus className="h-3 w-3 shrink-0" />
              <span>「{value}」を新規追加</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
