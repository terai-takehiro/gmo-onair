// 担当欄（自由入力）のユーザー名補完。14-schedule-v2-plan.md §3 B8・02-schedule.md §11-4。
//
// ⚠️ FK は張らない。「MC」「社長」「出演者受賞者」のような社内ユーザーでない担当が
// 多数あるため、この欄は今後も自由入力のまま——ここで足すのは**候補を出すだけ**で、
// 選ばせる・検証することはしない（一覧に無い名前を打っても一切エラーにならない）。
//
// `BufferedInput` をそのまま使わず `useBufferedValue` を直接呼ぶ理由: 候補の絞り込みは
// 「打った直後」に反応する必要があるが、`BufferedInput` が外（親の draft state）へ渡す
// `onCommit` は 500ms 後・IME 変換中は出ない（IME対策・lib/useBufferedValue.ts）。
// フックが内部に持つ `val`（打鍵ごとに更新される）を直接読めば、コミット前でも
// 候補を絞り込める。日本語入力そのものの安全策（composition 判定）はフックに任せる。
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBufferedValue } from "@/lib/useBufferedValue";
import * as scheduleApi from "@/lib/scheduleApi";

interface Props {
  id?: string;
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  className?: string;
}

const MAX_SUGGESTIONS = 6;

export default function AssigneeAutocomplete({ id, value, onCommit, placeholder, className }: Props) {
  const buf = useBufferedValue(value, onCommit);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 表の共有ピッカー（ScheduleShareSection.tsx）と同じ候補・同じキャッシュ鍵。
  // 20人規模のユーザー一覧なのでサーバー検索は不要——一度取れば十分（staleTime 5分）
  const candidatesQuery = useQuery({
    queryKey: ["schedule-share-users"],
    queryFn: scheduleApi.listShareUsers,
    staleTime: 5 * 60 * 1000,
  });

  const suggestions = useMemo(() => {
    const q = buf.val.trim().toLowerCase();
    if (!q) return [];
    return (candidatesQuery.data ?? [])
      .filter((u) => u.name.toLowerCase().includes(q))
      .slice(0, MAX_SUGGESTIONS);
  }, [buf.val, candidatesQuery.data]);

  const showDropdown = focused && suggestions.length > 0;

  // 候補クリック→本文を差し替えて即コミット（値は文字列のまま。id は保存しない）。
  // `buf.onBlur()` を実際の DOM blur なしに直接呼ぶのは、内部の ref だけで完結する
  // 純粋な「未コミット分を確定させる」処理だから（useBufferedValue.ts の onBlur 実装参照）。
  const select = (name: string) => {
    buf.onChange(name);
    buf.onBlur();
    setFocused(false);
    inputRef.current?.blur();
  };

  return (
    <div className="relative">
      <input
        id={id}
        ref={inputRef}
        value={buf.val}
        onChange={(e) => buf.onChange(e.target.value)}
        onFocus={() => { buf.onFocus(); setFocused(true); }}
        onBlur={() => { buf.onBlur(); setFocused(false); }}
        onCompositionStart={buf.onCompositionStart}
        onCompositionEnd={(e) => buf.onCompositionEnd((e.target as HTMLInputElement).value)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
        role="combobox"
        aria-expanded={showDropdown}
        aria-autocomplete="list"
      />
      {showDropdown && (
        <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md">
          {suggestions.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                // mousedown を止めて input の blur を先に発火させない
                // （先に閉じるとクリックがドロップダウンごと消えて選べなくなる、定番の事故）
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(u.name)}
                className="flex min-h-[44px] w-full flex-col items-start justify-center px-3 text-left hover:bg-accent"
              >
                <span className="text-sm text-foreground">{u.name}</span>
                <span className="text-xs text-muted-foreground">{u.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
