/**
 * 探す欄 — **入力したそばから絞る**。
 *
 * 押して初めて効く形にすると押し忘れて「検索が効かない」と読まれます。
 * 財務の `LedgerSearch` と同じ形を機材管理にも置いています
 * (`shared/` に足すと凍結4アプリの CSS が増えるので、アプリの中に持ちます)。
 */
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';

export function SearchField({
  value, onChange, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative min-w-0 flex-1 sm:max-w-[360px]">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-9 pr-9"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="検索を消す"
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-badge text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
