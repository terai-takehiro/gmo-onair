// shared/src/client/states/NotFoundPanel.tsx — 知らないURLに来たとき (v3.1.0)
//
// ── なぜ共通部品にしたか ───────────────────────────────────
//
// 認証後の未知URLの扱いが**アプリごとに3通り**あった:
//
//   案件管理             `path="*"` → `/` (= 今日) へ黙って転送
//   機材 / Qシート / 技術資料  各アプリの一覧へ転送
//   計時LIVE / CG / 日々の事務  **`path="*"` が無く、何も描かれない = 真っ白**
//
// 真っ白がいちばん悪い。「壊れた」のか「読み込み中」なのか区別が付かず、
// 現場では本番中に画面が白くなったように見える。黙って転送するのも同じ質の問題で、
// 実際に壊れたリンク (案件の「機材」ボタン・今日の「すべて見る」) が
// 「押しても何も起きない」ようにしか見えず長く残っていた。
//
// **起きたことを言い、次に行ける場所を出す。** router に依存しないので
// どのアプリからでも使える (行き先は呼び出し側が渡す)。
//
// 「無い」と断定しない — 権限で見えない画面のURLを直接開いた場合もここに来るので、
// 実際には在るが見せてもらえない、という場合がある。

import { Compass, Map as MapIcon } from 'lucide-react';
import { cn } from '../utils';
import { PageTitle } from '../ui/numbers';

export interface NotFoundPanelProps {
  /** 開こうとしたパス。何を押したのかを思い出せるように出す */
  path?: string;
  /** このアプリの入口 (「◯◯の一覧にもどる」)。省略すると出さない */
  home?: { label: string; onGo: () => void };
  /** 全体マップ (`/map`)。省略すると出さない */
  onOpenSiteMap?: () => void;
  className?: string;
}

export function NotFoundPanel({ path, home, onOpenSiteMap, className }: NotFoundPanelProps) {
  return (
    <div className={cn('mx-auto max-w-2xl px-4 py-10 sm:py-14', className)}>
      <div className="rounded-card border border-border bg-card p-6">
        <PageTitle>この画面を開けませんでした</PageTitle>
        {path && (
          <p className="mt-3 break-all text-[13px] leading-relaxed text-muted-foreground">
            <code className="rounded bg-muted px-1.5 py-0.5 text-[12px] text-foreground">{path}</code>{' '}
            という行き先はありません。
          </p>
        )}
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          名前が変わったか、あなたの権限では開けない画面です。行き先の一覧は
          <strong className="font-bold text-foreground">全体マップ</strong>にあります。
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {onOpenSiteMap && (
            <button
              type="button"
              onClick={onOpenSiteMap}
              className="min-h-tap inline-flex items-center gap-1.5 rounded-control bg-primary px-4 text-[13px] font-bold text-primary-foreground transition-colors hover:bg-primary-800"
            >
              <MapIcon className="h-4 w-4" aria-hidden="true" />
              全体マップを見る
            </button>
          )}
          {home && (
            <button
              type="button"
              onClick={home.onGo}
              className="min-h-tap inline-flex items-center gap-1.5 rounded-control border border-border bg-card px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-accent"
            >
              <Compass className="h-4 w-4" aria-hidden="true" />
              {home.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
