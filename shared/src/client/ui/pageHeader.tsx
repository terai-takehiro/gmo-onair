/**
 * 画面の見出し (docs/design/v4/_rules.md「3. スマホ」/ `_tokens.md` の型スケール)
 *
 * ```tsx
 * <PageHeader
 *   title="案件一覧"
 *   sub={`${count}件 ・ 全員が同じものを見ています`}
 *   primaryAction={<Button onClick={…}>案件をつくる</Button>}
 * >
 *   <ViewSwitch … />        {/ * 見出しの右に並ぶ補助操作 * /}
 * </PageHeader>
 * ```
 *
 * ── `primaryAction` が置かれる場所 ──────────────────────────
 *
 *   PC (640px 以上)  見出しの右端
 *   スマホ           **画面下端** (共通シェルの差し込み口。`shell/primaryAction.ts`)
 *
 * 画面側は場所を書きません。73画面が個別に `fixed bottom-0` を書くと、
 * 高さ・余白・セーフエリアの扱いが画面ごとにばらつき、
 * どれか1つは必ずホームバーに重なって押せなくなります。
 *
 * スマホ側では**幅いっぱい・高さ 48px** にします (_tokens.md「スマホ 主ボタン」)。
 * 中のボタンに直接クラスを足すのではなく、外から `[&_button]` で当てているのは、
 * 呼ぶ側が `<Button>` でも `<a>` でも同じ形になるようにするためです。
 *
 * ── `PageTitle` との違い ────────────────────────────────────
 *
 * `ui/numbers.tsx` の `<PageTitle>` は **v4 より前の段**
 * (`text-xl lg:text-2xl` = 20/24px) を持っており、まだ作り直していない画面が
 * 38 か所で使っています。ここを一度に変えると、作り直していない画面の
 * 見出しだけが動くので**分けてあります**。
 * **v4 で作り直した画面はこの `PageHeader` を使ってください。**
 * 全画面が移り終わったら `PageTitle` を消します (Phase 7)。
 */
import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../utils';
import { usePrimaryActionSlot } from '../shell/primaryAction';

export interface PageHeaderProps {
  /** 画面の名前。`text-h1` (23px / 800) */
  title: React.ReactNode;
  /** 見出しの下の1行。件数や「何が見えているか」を書く */
  sub?: React.ReactNode;
  /** 見出しの左のアイコン */
  icon?: React.ReactNode;
  /**
   * その画面で**いちばんやること**。1つだけ。
   * PC は右上・スマホは下端に置かれます。2つ目以降は `children` に入れてください。
   */
  primaryAction?: React.ReactNode;
  /** 見出しの右に並ぶ補助操作 (表示の切替など)。スマホでは見出しの下に折り返る */
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  sub,
  icon,
  primaryAction,
  children,
  className,
}: PageHeaderProps) {
  const slot = usePrimaryActionSlot();

  return (
    <div className={cn('flex flex-wrap items-end gap-3', className)}>
      <div className="min-w-0 flex-1">
        <h1 className="text-h1 flex items-center gap-2 [overflow-wrap:anywhere]">
          {icon}
          {title}
        </h1>
        {sub && <p className="text-note mt-1 text-muted-foreground">{sub}</p>}
      </div>

      {children}

      {/* PC の置き場所。スマホでは下端に出るのでここは消す */}
      {primaryAction && <div className="hidden shrink-0 sm:block">{primaryAction}</div>}

      {/*
        スマホの置き場所。**シェルが用意した差し込み口へ描く**ので、
        本文のスクロール領域と重なりません (`shell/primaryAction.ts`)。
        シェルの外で使われたとき (`slot === null`) は PC 側の表示だけになります。
      */}
      {primaryAction && slot
        ? createPortal(
            <div className="[&_a]:h-12 [&_a]:w-full [&_button]:h-12 [&_button]:w-full">
              {primaryAction}
            </div>,
            slot,
          )
        : null}
    </div>
  );
}
