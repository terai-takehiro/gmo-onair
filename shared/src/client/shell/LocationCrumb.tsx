// shared/src/client/shell/LocationCrumb.tsx — 上辺の現在地 (v3.1.0)
//
// ── なぜ共通にしたか ───────────────────────────────────────
//
// v3.0.11 まで、パンくずの中身はアプリごとにばらばらだった:
//
//   案件管理   活性なレールの名前 (「案件」「お金」…)。当たらない8画面では**何も出ない**
//   機材       固定文字列「機材管理」   ← 中のどこに居ても同じ
//   Qシート     固定文字列「Qシート」    ← 同じ
//   技術資料    固定文字列「技術資料」   ← 同じ
//   計時LIVE   固定文字列「計時LIVE」   ← 同じ
//   CG         固定文字列「リアルタイムCG」← 同じ
//   日々の事務  固定文字列「日常業務」   ← 同じ
//
// つまり「アプリの名前」は分かるが「仕事のどこに居るか」は分からない。しかも
// 現場アプリではレールが1つも点かないので、上辺・左のレール・ハンバーガーの
// **3つとも現在地を示さない**画面が5アプリぶんあった。
//
// 区分は仕事の順番で1つに決めてある (`SITE_SECTIONS`) ので、行き先の表から引く。
// これで全アプリ・全画面が同じ形の現在地を持つ。

import { locatePath } from '../commandPalette/commands';

export interface LocationCrumbProps {
  /** ブラウザの実パス。basename を付けたアプリは `realPathname()` を通したもの */
  path: string;
  /**
   * 表から引けなかったときに出す名前 (アプリ名など)。
   * 空にすると何も出ないので、**呼び出し側は必ず渡す**。
   */
  fallback: string;
  /**
   * このアプリの入口。渡すと現在地の名前が**入口へのリンク**になる。
   *
   * 1項目しかない二次ナビ (Qシート・技術資料・リアルタイムCG) を消す代わりの戻り道。
   * 詳細画面から一覧に戻る手段が必要なだけなので、そのために
   * 220px の列とハンバーガーを1つずつ持つのは重すぎた。
   */
  home?: { path: string; onGo: () => void };
}

export default function LocationCrumb({ path, fallback, home }: LocationCrumbProps) {
  const here = locatePath(path);
  if (!here) {
    return <span className="font-bold text-foreground">{fallback}</span>;
  }
  // 入口そのものに居るときはリンクにしない (自分自身へのリンクは押しても何も起きない)
  const linkHome = home && path.split('?')[0].replace(/\/+$/, '') !== home.path.replace(/\/+$/, '');
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {/* 区分は補助。太字にするのは今いる画面の名前のほう */}
      <span className="shrink-0 text-secondary-foreground">{here.section}</span>
      <span className="shrink-0 select-none text-border" aria-hidden="true">
        /
      </span>
      {linkHome ? (
        <button
          type="button"
          onClick={home!.onGo}
          className="truncate rounded font-bold text-primary underline underline-offset-2 hover:text-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={`${here.label} の一覧にもどる`}
        >
          {here.label}
        </button>
      ) : (
        <span className="truncate font-bold text-foreground">{here.label}</span>
      )}
    </span>
  );
}
