/**
 * 探して選ぶ欄
 *
 * ── キーボードと読み上げに対応させた（手触りの回） ────────────
 *
 * 開いたあと**矢印キーで動かせず、Enter でも選べません**でした。
 * 選べるのはマウスの click だけで、Tab で送ると候補を1つずつ通ります。
 * 読み上げにも「これは選択欄だ」と伝わっていません（`role` が無い）。
 *
 * 足したのは **`role` と `aria-*`、そして ↑↓ / Enter / Esc / Home / End** です。
 * **クラス名は1つも足していません** — `shared/src/client/` に新しいクラス名を
 * 書くと凍結4アプリの CSS が増えるためです（ビルドして 1 バイトも
 * 増えないことを確かめました）。
 *
 * ── いま指しているものを見た目で出す ────────────────────────
 *
 * 矢印で動かしても色が変わらないと、Enter で何が入るのか分かりません。
 * `aria-selected` と、**hover と同じ色**（`--accent`）で出します。
 * ただし**その面の色を Tailwind のクラスで書くと、凍結4アプリの CSS が
 * 92 バイト増えます**（実測）。しかも **Tailwind はコメントの中の
 * クラス名も拾う**ので、ここに実物を書くこともできません
 * （それで1度やり直しました）。`data-cursor` という属性だけ付けて、
 * 色は `tokens-v4.css` が当てます。
 *
 * ── 選んだ項目の名前が長いと、下の要素と重なっていた ──────────────
 *
 * 選択欄のボタンは `h-11`（PC は `h-10`）の**固定高さ**なのに、選んだ項目の
 * ラベルに `truncate` が無かったため、長い案件名（「【問い合わせ】株式会社〜
 * イベント(11月土日・空き確認)」のような数十文字）が折り返して4行分に伸び、
 * ボタンの高さからあふれた分がすぐ下の要素（案件で絞り込み中の注記など）と
 * 重なって読めなくなっていた。ラベルに `min-w-0 flex-1 truncate` を足し、
 * 右側のアイコンに `shrink-0` を足して、**1行で省略する**形にした
 * （`truncate` 等は既存の一般的な Tailwind クラスなので、凍結4アプリの
 * CSS を増やさない）。
 */
import { useState, useRef, useEffect } from "react";
import { Input } from "./input";
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
  /** 矢印キーでいま指しているもの。**マウスとは別に持つ** */
  const [cursor, setCursor] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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

  /** 開いたら「いま選ばれているもの」を指す（先頭ではない） */
  useEffect(() => {
    if (!open) return;
    const i = options.findIndex((o) => o.value === value);
    setCursor(i >= 0 ? i : 0);
  }, [open, options, value]);

  /** 絞り込むと候補の数が変わる。**指し先が範囲の外に残らないようにする** */
  useEffect(() => { setCursor(0); }, [search]);

  /** 指しているものが見えていないと、Enter で何が入るのか分からない */
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor, open]);

  const pick = (v: string) => { onChange(v); setOpen(false); setSearch(""); };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      // 閉じているときは ↓ か Enter で開く（選択欄のふつうの振る舞い）
      if (e.key === "ArrowDown" || e.key === "Enter") { e.preventDefault(); setOpen(true); setSearch(""); }
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((n) => Math.min(n + 1, filtered.length - 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setCursor((n) => Math.max(n - 1, 0)); return; }
    if (e.key === "Home") { e.preventDefault(); setCursor(0); return; }
    if (e.key === "End") { e.preventDefault(); setCursor(Math.max(filtered.length - 1, 0)); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      const hit = filtered[cursor];
      // **候補が無いときは何もしない。** 空の Enter で欄が閉じると、
      // 打ち間違いに気づかないまま先に進む
      if (hit) pick(hit.value);
    }
  };

  useEffect(() => {
    if (!onSearchChange) return;
    const timer = setTimeout(() => onSearchChange(search), 200);
    return () => clearTimeout(timer);
  }, [search, onSearchChange]);

  return (
    <div ref={ref} className={`relative ${className}`} onKeyDown={onKey}>
      <button
        type="button"
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => { setOpen(!open); setSearch(""); }}
        className="min-h-tap flex h-11 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm lg:h-10 lg:min-h-0 ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={`min-w-0 flex-1 truncate text-left ${selected ? "text-foreground" : "text-muted-foreground"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {value && (
            <X
              className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground"
              aria-label="選んだものを外す"
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
          <div ref={listRef} role="listbox" className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                該当なし
              </div>
            ) : (
              filtered.map((option, i) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  data-idx={i}
                  /*
                   * **クラス名ではなく属性で指す。** 面の色をクラスで書いたら
                   * 凍結4アプリの CSS に1規則・92バイト増えました（実測）。
                   * 見た目は `tokens-v4.css` の `:root [data-cursor='on']` が付けます
                   * （v4 対象3アプリだけが読む）。凍結アプリは属性が増えるだけです。
                   */
                  data-cursor={i === cursor ? 'on' : undefined}
                  // マウスを乗せたら指し先もそちらへ。**2つの現在地を出さない**
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => pick(option.value)}
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
