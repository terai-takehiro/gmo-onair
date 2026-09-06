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
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useLocation, matchPath } from 'react-router-dom';
import { Monitor, ArrowRight, Eye } from 'lucide-react';
import { useIsMobile } from './mobile';

/**
 * 案内の中身を上から順に立ち上げる（アイコン → 見出し → 札 → ボタン）。
 *
 * 仕組みは一覧の行と同じもの（`tokens-v4.css` の行の立ち上がり・データ属性方式）を
 * そのまま使う。ここに新しい動きを作らないのが要点で、
 * **動きを減らす設定（OS の「視差効果を減らす」）ではあちら側で止まる**。
 */
const rise = (order: number) => ({
  'data-row-in': '',
  style: { '--v4-row': order } as CSSProperties,
});

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
  /**
   * **スマホの左メニューにも出さない**（ご判断）。
   *
   * データを入れる道具（DB バックアップ・データビューア・決算の取込）は
   * 案件の仕事に出てこないので、**スマホでは選べること自体が邪魔**です。
   * メニューが長くなるほど、毎日使う項目が見つかりにくくなります。
   *
   * **ルートは消しません。** 共有された URL を開いたときは今までどおり案内が出ます
   * （消すと「昨日まで開けたのに」になる）。
   */
  hidden?: boolean;
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
 *
 * ── 見た目（磨き直し）─────────────────────────────────────────
 *
 * 「使えません」ではなく「ここは PC でどうぞ」に見せる:
 *
 *   ・案内アイコンは他の画面の空表示と同じ「色つきの丸いバッジ」に載せ、
 *     さらに淡い輪を1枚敷いて**エラーではなく案内**の顔にする。バッジは案内の色
 *     （実際に押せる主ボタンとは別の色）にして、**「読む場所」と「押す場所」を
 *     色だけでも見分けられる**ようにした
 *   ・小見出しはトップページの節と同じ字間の広い小さな見出し（`tokens-v4.css`）
 *   ・幅を止めて左右の中央に置く。この案内は 1023px 幅まで出るので、
 *     止めないとタブレットで横に間延びした「壊れた画面」に見える
 *   ・中身は上から順に立ち上がる（一覧の行と同じ動き・上の `rise`）
 */
export function PcOnlyPanel({ what, why, instead, onOpenAnyway, onGoInstead, inset }: PcOnlyPanelProps) {
  return (
    <div className={inset ? '' : 'px-4 py-6'}>
      <div className="mx-auto w-full max-w-md rounded-card border border-border bg-card px-5 py-8 text-center shadow-sm">
        <div {...rise(0)} className="mx-auto flex h-20 w-20 items-center justify-center rounded-chip bg-info-surface/50">
          <div className="flex h-14 w-14 items-center justify-center rounded-chip bg-info-surface text-info">
            <Monitor className="h-6 w-6" aria-hidden="true" />
          </div>
        </div>

        <div {...rise(1)}>
          <p className="v4-eyebrow mt-5">PC 専用の画面</p>
          <h2 className="text-cardtitle mt-1.5">{what}</h2>
          <p className="text-sub mt-2 text-secondary-foreground">{why}</p>
        </div>

        {/* **「消えた」と読ませない。** これが無いと「機能が無くなった」と受け取られる。
            理由文と分けて、丸い札で目立たせている */}
        <p {...rise(2)} className="text-list mt-4 inline-block rounded-chip bg-muted px-3 py-1 text-muted-foreground">
          機能は PC 版に用意しています。
        </p>

        {/* 立ち上がりはボタンではなく**この入れ物**に掛ける。ボタン自身に掛けると、
            終わったあとも最終コマが効き続けて（fill が normal 宣言に勝つ）
            押した瞬間の 0.97 倍の手応えが消える */}
        {((instead && onGoInstead) || onOpenAnyway) && (
          <div {...rise(3)} className="mt-6 space-y-2">
            {instead && onGoInstead && (
              <button
                type="button"
                onClick={() => onGoInstead(instead.to)}
                className="rounded-control-lg min-h-tap flex w-full items-center justify-center gap-1.5 bg-primary px-4 text-list text-primary-foreground transition-colors hover:bg-primary-800"
              >
                {instead.label}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}

            {onOpenAnyway && (
              <button
                type="button"
                onClick={onOpenAnyway}
                className="rounded-control-lg min-h-tap flex w-full items-center justify-center gap-1.5 text-list text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                それでもこのまま開く
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 画面の中に置く短い版（帯）。**画面ぜんぶを止めるほどではない**ときに使う。
 * 例: 案件一覧の `?view=board`（リストは出せるので、ボードだけ出せないと書く）
 *
 * 見た目は他の画面にある同種の帯（ファイル・やり取りタブの案内帯など）に揃えてある。
 * 帯の中でさらにアイコンを丸バッジにすると狭い帯の中でかえって目立ちすぎるため、
 * ここは磨かず既存の形（アイコン＋文）のままにしている。
 */
export function PcOnlyNote({ what, why }: { what: string; why: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-note border border-info-border bg-info-surface px-3.5 py-3">
      <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
      <p className="text-note text-secondary-foreground">
        <strong className="font-bold">{what}は PC 専用の画面です。</strong>
        {why}
      </p>
    </div>
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
