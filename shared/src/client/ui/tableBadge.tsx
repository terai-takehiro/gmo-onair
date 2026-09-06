/**
 * 表・一覧の中のバッジ (docs/design/v4/_rules.md「1. 縦の整列」)
 *
 * ── なぜ幅を固定するか ──────────────────────────────────────
 *
 * ステータス列に「受信」「確認中」「処理完了」が縦に並ぶとき、幅を中身に任せると
 * **バッジの右端が行ごとにずれます**。目は文字ではなく「色の塊の形」で行を追うので、
 * 形がそろっていないと縦に流し読みできません。だから**列ごとに幅を固定**します。
 *
 * ── 文字は「中央寄せ」。均等割り付けにはしない ──────────────
 *
 * **モックのバッジは中央寄せです。** 以前ここは 62px の帯に
 * `text-align-last: justify` で均等割り付けしていましたが、これは
 * **モックの読み間違い**でした。モックの指定はこうなっています:
 *
 *   width:62px; display:inline-flex; justify-content:center;
 *   text-align-last:justify;   ← inline-flex では効かない
 *   padding:0 6px; white-space:nowrap; overflow:hidden
 *
 * **`text-align` 系は flex コンテナの中身の配置には効きません**
 * (テキストは匿名フレックスアイテムになり、置き場所は `justify-content` が決める)。
 * つまりモックではこの1行は最初から死んでいて、実際には
 * `justify-content: center` で**中央に寄って描かれていました**。
 *
 * 実装側はこの死んだ指定を「割り付けたいのだ」と読み、**表示を block 系に変え
 * padding を 0 にして**わざわざ効くようにしてしまったため、「口頭決定」が
 * 「口 頭 決 定」に、「固定資産」が「固 定 資 産」に見えていました。
 * `docs/v4-plan.md`「実装がモックと違ったらモックに合わせる」に従って戻します。
 *
 * **縦の整列は幅の固定だけで足りています。** 色の塊 (62px) と枠 (列幅) は
 * どちらも固定なので、文字をどう寄せても**左端・右端は動きません**
 * (`verify-ui.mjs` が見ているのは枠 `[data-badge-slot]` の座標)。
 * 割り付けは「帯の中で文字幅までそろえる」だけのもので、整列には要りません。
 *
 * ── 62px に収めるための padding (変えるときは実測し直すこと) ──
 *
 * 実ブラウザで測った自然幅 (LINE Seed JP 700 / 11px / 字間 0.3px):
 *
 *   2字「受信」22.6px ／ 3字「確認中」33.9px ／ 4字「処理完了」45.2px ／ 6字 67.8px
 *
 * 左右の padding をモックと同じ **6px** にすると中身は 62 − 6×2 = **50px** で、
 * 4字 45.2px が収まります (`Badge` の既定は 10px なので 42px しか無く
 * **4字が収まりません**)。5字以上は 62px に入らないので**自然幅**にします
 * (`FIXED_MAX`)。さらにモックと同じく**折り返しを禁止し、あふれ分は隠す**ので、
 * **万一あふれても2行になりません** — 折り返すと行高が倍になり、
 * そろえたかった行そのものがずれます。
 *
 * **`text-badge` を効かせるのに `cn()` の設定が要る。** 詳細は
 * `shared/src/client/utils.ts` — 教えていないと `Badge` の既定 `text-xs`(12px) が
 * 勝ち、自然幅が 61.2px になって4字が収まりません (実際に踏んだ)。
 */
import { cn } from '../utils';
import { Badge, type BadgeProps } from './badge';
import { type SlotWidth } from './row';

/** 幅を固定する帯の幅 (docs/design/v4 のモックで 62px と決めてある) */
const FIXED_W = 62;

/** 幅を固定する文字数の上限。これを超えると 62px に収まらない */
const FIXED_MAX = 4;

/** 和文 (ひらがな・カタカナ・漢字) を2字以上含むか */
function isJapanese(text: string): boolean {
  const jp = text.match(/[぀-ゟ゠-ヿ一-龯]/g);
  return (jp?.length ?? 0) >= 2;
}

export interface TableBadgeProps extends Omit<BadgeProps, 'children'> {
  /** バッジに出す文字。**文字列で渡す** — 幅を固定するかの判定に文字数を使うため */
  label: string;
  /**
   * 列幅。`RowSlot` と同じ7段から選ぶ。既定は 96px (ステータス列)。
   * `<RowSlot>` の中に置くときは `w={null}` にして枠を二重にしないこと。
   */
  w?: SlotWidth | null;
  /**
   * **その列だけ帯の幅を変える** (opt-in・単位 px)。
   *
   * 既定の 62px は和文4字までの札を想定した幅で、5字以上のラベルが混ざる列では
   * **帯が自然幅になり右端が行ごとにずれます** (機材の種別は「映像貸出」から
   * 「ネットワーク設備」まで 4〜8字が同居する)。列でいちばん長い札が収まる幅を
   * 渡すと、**その列だけ**帯がその幅にそろいます。
   *
   * ⚠️ **渡さなければ振る舞いは今までと1ピクセルも変わりません。**
   * 既定を広げると全アプリの札が太るので、必ず列側から渡すこと。
   * 渡す値は**実測して決める** (中身に使えるのは padding 6px×2 を引いた幅で、
   * あふれた分は隠れて読めなくなる)。
   */
  fixedW?: number;
}

export function TableBadge({ label, w = 96, fixedW, className, style, ...rest }: TableBadgeProps) {
  const fixed = fixedW != null || (isJapanese(label) && label.length <= FIXED_MAX);
  const width = fixedW ?? FIXED_W;

  const badge = (
    <Badge
      // `Badge` の既定は角丸が完全に丸い「カプセル」形（丸ボタンに見える）。
      // モックのバッジは角丸の小さい四角なので、v4 対象3アプリだけ角を上書きする。
      // 上書きし忘れていたのが v4 の一覧・状態バッジ全般で「ボタンのような形」に
      // 見えていた原因（`docs/design/v4/mockups` の実測: stage/status バッジは
      // すべて小さい四角。カプセル形は1つも無い）。
      //
      // **属性だけを足し、上書きは `tokens-v4.css` に置く**（`button.tsx` の
      // `data-ui="button"` と同じやり方）。ここは全アプリの Tailwind が走査する
      // 場所なので、角丸の役割名クラスを直に書くと**凍結アプリの CSS にも
      // その分の規則が増える**（実測: qsheet/techsheet（当時。いまは削除済み）/live で +33 バイト。
      // `shared/CLAUDE.md` が繰り返し警告している「クラス漏れ」を実際に踏んだ）
      data-ui="table-badge"
      className={cn(
        'text-badge max-w-full whitespace-nowrap font-bold',
        // **あふれたら隠す。** 札は `whitespace-nowrap` なので、列より長い中身は
        // 折り返さずに**隣の列の上へそのまま伸びます**（`RowSlot` は `shrink-0`
        // なので押し出されず、上に乗るだけ＝利用者からは「レイアウトが崩れている」
        // としか見えない）。実際に設定＞保管場所の「拠点」列（56px）で、拠点名
        // 「GMOグローバルスタジオ」が右隣の保管場所名に重なっていました。
        // 中の文字は `truncate` で `…` にするので、**切れたことが読めます**。
        'overflow-hidden',
        // 幅を固定するときはモックと同じ形にする — 中央に寄せ、左右の padding を
        // 6px に落として中身の幅を稼ぎ (既定の 10px では 4字が収まらない。
        // 上の計算参照)、あふれ分は隠す (モックにもある)。
        // **`Badge` の既定の表示 (flex) を block 系に変えないこと** —
        // 変えると `text-align` 系が効くようになり、均等割り付けの事故が戻る。
        fixed && 'justify-center overflow-hidden px-1.5',
        className,
      )}
      style={fixed ? { width, ...style } : style}
      {...rest}
    >
      {/*
        **`…` を出すには、文字を包む子が要ります。** `Badge` は `inline-flex` なので
        `text-overflow` は文字に直接は効きません（`display` を block 系に変えるのは
        禁止 — 上の注意書きのとおり均等割り付けの事故が戻る）。子に分けると
        **フレックスの子は block 化される**ので、そこで `truncate` が効きます。
        `truncate` / `min-w-0` はすでに `row.tsx` などが使っている一般的な
        クラスなので、**凍結アプリの CSS は1バイトも増えません**。
      */}
      <span className="min-w-0 truncate">{label}</span>
    </Badge>
  );

  // 枠を持たない形。`<RowSlot>` の中に置くときはこちら
  // `min-w-0` が要る: `RowSlot` は `flex` なので、この包みは**中身の最小幅より
  // 縮まず**（フレックスの子の既定は `min-width: auto`）、上の `max-w-full` も
  // 効かないまま列からはみ出します。**`display` は変えない** — フレックスの中では
  // どのみち block 化されるので `min-w-0` が効き、フレックスでない所（カードの中など）
  // では今までどおり素の inline のままで、行の途中に置いても改行しません
  if (w === null) return <span data-badge-slot className="min-w-0">{badge}</span>;

  return (
    <span data-badge-slot className="inline-flex shrink-0 justify-center" style={{ width: w }}>
      {badge}
    </span>
  );
}
