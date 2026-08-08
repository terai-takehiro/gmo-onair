/**
 * 「この画面は PC で触るもの」を出す部品と、その振り分け（M1 / M2）
 *
 * ── なぜ要るか ──────────────────────────────────────────────
 *
 * モックの「**スマホに置かないもの**」（`docs/design/v4/mobile.md` の `spNotOnPhone`）は
 * お客様・お金・設定と権限・ガント・3列レビュー・Qシートの編集 を挙げています。
 * ところが実装では**「PC で」と書いて止めている画面が 63 中 6 枚しかなく**、
 * 残りは判断せずに縦に畳んだだけでした。しかも案内の文面と見た目が
 * **10 か所でバラバラ**で、うち**行き先を書いているのは 3 か所だけ**（残りは行き止まり）。
 *
 * ここに寄せると3つ手に入ります:
 *
 *   1. 見た目と言い回しが1つになる（利用者が「壊れていない」と1秒で分かる）
 *   2. **どの画面がスマホ対応済みかを機械で数えられる**（`scripts/check-mobile-declared.mjs`）。
 *      いままでは数えられないので、**取り残しに永久に気づけませんでした**
 *   3. **代わりにできること**を型で要求できる
 *
 * ── 「それでもこのまま開く」を置く理由（ご判断） ─────────────
 *
 * 出張先で見積の金額だけ確かめたい、は実際に起きます。目的は
 * **「壊れていると思わせないこと」**なので、本人が選んで開くなら目的は果たされます。
 * 隠すのではなく、**先に理由を読ませてから本人に選ばせる**形にしています。
 *
 * ── 置き場所 ────────────────────────────────────────────────
 *
 * **`src/client/` ではなく `src/client-v4/` に置くこと。** 各アプリの Tailwind は
 * `shared/src/client/**` を走査するので、あちらに新しいクラス名を書くと
 * **凍結4アプリの CSS が増えます**（`RichContent` で実測 4規則・231バイト）。
 */
import { useState, type ReactNode } from 'react';
import { useLocation, matchPath } from 'react-router-dom';
import { Monitor, ArrowRight, Eye } from 'lucide-react';
import { useIsMobile } from './mobile';

/** 1画面ぶんの宣言 */
export interface PcOnlyEntry {
  /** ルートのパターン。`react-router` の `matchPath` に渡す（`:id` などが使える） */
  path: string;
  /** 画面の名前。案内の見出しに出る */
  what: string;
  /**
   * **なぜ PC なのか。** 「読めません」で終わらせず、何がどう読めないのかを書く。
   * 理由が具体的でないと「手抜きで作っていないだけ」と受け取られます。
   */
  why: string;
  /**
   * **代わりにスマホでできること。** 省略できますが、**省くと行き止まり**になります。
   * 既存の手書き 10 か所のうち 7 か所がこれを書いていませんでした。
   */
  instead?: { label: string; to: string };
}

export interface PcOnlyPanelProps extends Omit<PcOnlyEntry, 'path'> {
  /** 「それでもこのまま開く」。渡さないとボタンを出さない */
  onOpenAnyway?: () => void;
  /** 代わりの行き先へ移る。`instead` があるときは必須 */
  onGoInstead?: (to: string) => void;
  /** 画面ぜんぶを置き換えるのか、画面の一部（タブの中など）なのか */
  inset?: boolean;
}

/**
 * PC 向きの画面を開いたときの案内（1枚）。
 *
 * **順番に意味があります**: ①何の画面か ②なぜ PC なのか ③代わりにできること
 * ④それでも開く。④を上に置くと理由を読まずに押されるので必ず最後です。
 */
export function PcOnlyPanel({ what, why, instead, onOpenAnyway, onGoInstead, inset }: PcOnlyPanelProps) {
  return (
    <div className={inset ? '' : 'p-3'}>
      <div className="rounded-card border border-border bg-card p-4">
        <p className="text-th flex items-center gap-1.5 text-muted-foreground">
          <Monitor className="h-3.5 w-3.5" aria-hidden="true" />
          PC で触る画面
        </p>
        <h2 className="text-cardtitle mt-1.5">{what}</h2>
        <p className="text-sub mt-1.5 text-secondary-foreground">
          {why}
          {/* **「消えた」と読ませない。** これが無いと「機能が無くなった」と受け取られる */}
          <strong className="font-bold">消したのではなく、PC にあります。</strong>
        </p>

        {instead && onGoInstead && (
          <button
            type="button"
            onClick={() => onGoInstead(instead.to)}
            className="rounded-control min-h-tap mt-3.5 flex w-full items-center justify-center gap-1.5 bg-primary px-4 text-list font-bold text-primary-foreground"
          >
            {instead.label}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}

        {onOpenAnyway && (
          <button
            type="button"
            onClick={onOpenAnyway}
            className="min-h-tap text-sub mt-1 flex w-full items-center justify-center gap-1.5 text-muted-foreground underline"
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            それでもこのまま開く
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * 画面の中に置く短い版（帯）。**画面ぜんぶを止めるほどではない**ときに使う。
 * 例: 案件一覧の `?view=board`（リストは出せるので、ボードだけ出せないと書く）
 */
export function PcOnlyNote({ what, why }: { what: string; why: string }) {
  return (
    <p className="rounded-note flex items-start gap-2 border border-info-border bg-info-surface px-3.5 py-3 text-note text-secondary-foreground">
      <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
      <span>
        <strong className="font-bold">{what}は PC で触る画面です。</strong>
        {why}
      </span>
    </p>
  );
}

/**
 * 宣言の表を見て、スマホなら案内に差し替える。**アプリのシェルに1つだけ**置く。
 *
 * **画面ごとに `useIsMobile()` を書かせない**のが要点です。画面の中で分岐させると
 * 書き忘れに気づけず、しかも**数えられません**（M2 の検査が成り立たない）。
 *
 * ここは早期 return しますが、**この部品自身が呼ぶフックの数は常に同じ**なので
 * 安全です（`mobile.ts` が禁じているのは「1つの部品の中でフックの数が変わる」形）。
 */
export function PcOnlyGate({
  table,
  onGoInstead,
  children,
}: {
  table: PcOnlyEntry[];
  onGoInstead: (to: string) => void;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const mobile = useIsMobile();
  // **パスごとに覚える。** 1つ開いたら全部開く形にすると、
  // 次に別の PC 向き画面へ移ったとき案内が出ずに崩れた画面が出る
  const [opened, setOpened] = useState<string[]>([]);

  const hit = mobile ? table.find((e) => matchPath({ path: e.path, end: true }, pathname)) : undefined;
  if (!hit || opened.includes(pathname)) return <>{children}</>;

  return (
    <PcOnlyPanel
      what={hit.what}
      why={hit.why}
      instead={hit.instead}
      onGoInstead={onGoInstead}
      onOpenAnyway={() => setOpened((v) => [...v, pathname])}
    />
  );
}
