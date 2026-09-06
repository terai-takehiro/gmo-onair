// テロップCG — ①一覧ヘッダーの「＋テロップ」ドロップダウン（`GraphicsHubPage.tsx` から
// 分離。400行基準）。位置決め（`relative`）は呼び出し側の見出し行に残したまま、
// トリガーボタンと開いたときのメニューだけをここに持つ（`absolute right-0 top-full` は
// 呼び出し側の `relative` コンテナ基準のまま・見た目は変えていない）。
import { ChevronDown, Plus, Tv, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function TelopAddMenu({
  open, onOpenChange, onPickRoster, onPickRequestQueue, onPickBlank,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPickRoster: () => void;
  onPickRequestQueue: () => void;
  onPickBlank: () => void;
}) {
  return (
    <>
      <Button variant="outline" onClick={() => onOpenChange(!open)}>
        <Plus className="mr-1 h-4 w-4" aria-hidden="true" />テロップ<ChevronDown className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
      </Button>

      {open && (
        <>
          {/* 背面クリックで閉じる透明レイヤー（Radix 等を新規導入せず素の実装で済ませる） */}
          <button
            type="button"
            aria-label="メニューを閉じる"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => onOpenChange(false)}
          />
          <div className="absolute right-0 top-full z-20 mt-1 w-72 rounded-card border border-border bg-card p-1 shadow-lg">
            <button
              type="button"
              className="flex min-h-tap w-full items-start gap-2.5 rounded-control-md px-2.5 py-2 text-left hover:bg-surface-subtle"
              onClick={onPickRoster}
            >
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span>
                <span className="block text-sub font-bold">名簿から作る</span>
                <span className="block text-note text-muted-foreground">Excel の名簿から、同じ種類のテロップをまとめて</span>
              </span>
            </button>
            <button
              type="button"
              className="flex min-h-tap w-full items-start gap-2.5 rounded-control-md px-2.5 py-2 text-left hover:bg-surface-subtle"
              onClick={onPickRequestQueue}
            >
              <Tv className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span>
                <span className="block text-sub font-bold">依頼から作る</span>
                <span className="block text-note text-muted-foreground">ディレクターからの依頼を1枚ずつテロップに</span>
              </span>
            </button>
            <button
              type="button"
              className="flex min-h-tap w-full items-start gap-2.5 rounded-control-md px-2.5 py-2 text-left hover:bg-surface-subtle"
              onClick={onPickBlank}
            >
              <Plus className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span>
                <span className="block text-sub font-bold">空から作る</span>
                <span className="block text-note text-muted-foreground">種類を選んで文言を入れる</span>
              </span>
            </button>
          </div>
        </>
      )}
    </>
  );
}
