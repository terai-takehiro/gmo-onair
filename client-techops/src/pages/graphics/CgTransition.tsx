// テロップCG — 汎用 In/Out トランジション・ラッパー（段6-3・Out=In逆再生の契約）。
//
// docs/design/v4/graphics.md §5「Out = In の逆再生」・
// docs/design/v4/graphics-design-specs.md §11 の実装。**個々の部品
// （nameParts.tsx・scoreParts.tsx・voteParts.tsx・outputPartsExtra.tsx）は一切変更しない** —
// GraphicsOutputPage.tsx / ConsolePreview.tsx が並べる1枚1枚をこのコンポーネントで包むだけの
// 汎用契約。cue の pageId が変わった（=キーが入れ替わった）ときに:
//   ・新しいページ = 透明・わずかに縮小 → フェードイン＋等倍へ（減速イージング）
//   ・古いページ   = 即座に消さず、フェードアウト＋わずかに拡大（加速イージング。
//     「フェードインの逆再生」— 同じ持続時間・逆方向のイージング）してから DOM を外す
//
// 部品側は `position:absolute` の `top/left/right/bottom` を「1920×1080キャンバス」
// 基準の px 値で書いている（例: nameParts.tsx の `bottom: SAFE_Y`、outputPartsExtra.tsx の
// `TickerBand` の `left:0; right:0; bottom:0`）。フェード用に `transform: scale()` を掛ける層は
// **キャンバスと同じ width/height を明示**しないと、この `bottom` 等の基準が壊れる
// （`transform` を持つ要素は子孫の絶対配置の基準＝containing block になるため、
// 高さ0の入れ物のままだと `bottom` の基準がずれる）。そのため各層は
// `position:absolute; inset:0; width; height` を固定して渡す。
//
// 時計・カウントダウン・速報帯は呼び出し側が 250ms ごとに serverNowMs を更新して
// 再描画している。ここでは pageId が同じ限り「中身（node）」を毎レンダー差し替えるだけで
// enter/leave のアニメーション状態には触れない — フェード中でも秒は刻み続ける。
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';

/** 持続時間・イージングは docs/design/v4/graphics-design-specs.md §11 の数値そのもの */
export const CG_TRANSITION_MS = 400;
// In: 軽い減速（ease-out）。Out はこの逆再生 = 同じ曲線を時間反転した加速（ease-in）カーブ
const EASE_IN = 'cubic-bezier(0.16, 1, 0.3, 1)';
const EASE_OUT = 'cubic-bezier(0.7, 0, 0.84, 0)';
const SCALE_FROM = 0.98; // In: このスケールから 1 へ
const SCALE_TO = 1.02; // Out: 1 からこのスケールへ（Inの逆再生を近似）

export interface CgTransitionItem {
  /** 差し替えを検知する鍵。`page.id` を渡す想定（cue の pageId が変われば鍵も変わる） */
  key: string;
  node: ReactNode;
  /** PVWの文脈表示（他スロットの現在オンエアを薄く重ねる）用。フェードと掛け合わせる不透明度 */
  dim?: boolean;
}

interface TrackedEntry extends CgTransitionItem {
  leaving: boolean;
}

/**
 * `items` の中身（鍵の集合）が変わるたびに、消えた鍵をフェードアウトさせてから取り除き、
 * 新しい鍵をフェードインで迎える。鍵が同じ項目は `node`/`dim` の中身だけ毎回更新する
 * （アニメーションは再生しない — リアルタイム更新を妨げないため）。
 */
export function CgTransition({ items, width, height }: {
  items: CgTransitionItem[];
  /** 部品の絶対配置の基準にする箱のサイズ（放送キャンバスは 1920×1080） */
  width: number;
  height: number;
}) {
  const [entries, setEntries] = useState<TrackedEntry[]>(() => items.map((it) => ({ ...it, leaving: false })));

  useEffect(() => {
    setEntries((prev) => {
      const incomingByKey = new Map(items.map((it) => [it.key, it]));
      const next: TrackedEntry[] = [];
      for (const e of prev) {
        const incoming = incomingByKey.get(e.key);
        if (incoming) {
          // 生きている鍵: 中身だけ更新（フェード状態はいじらない）。
          // ただし既に leaving 中に同じ鍵が復活した場合は素朴に leaving のまま流し切る
          next.push(e.leaving ? e : { ...incoming, leaving: false });
        } else if (!e.leaving) {
          // 消えた鍵: フェードアウトへ（DOMからはまだ外さない）
          next.push({ ...e, leaving: true });
        } else {
          next.push(e); // 既にフェードアウト中 → 子の onExited が取り除くのを待つ
        }
      }
      for (const it of items) {
        if (!prev.some((e) => e.key === it.key)) next.push({ ...it, leaving: false });
      }
      return next;
    });
  }, [items]);

  const handleExited = useCallback((key: string) => {
    setEntries((prev) => prev.filter((e) => !(e.key === key && e.leaving)));
  }, []);

  return (
    <>
      {entries.map((e) => (
        <CgTransitionLayer
          key={e.key}
          entering={!e.leaving}
          dim={e.dim}
          width={width}
          height={height}
          onExited={() => handleExited(e.key)}
        >
          {e.node}
        </CgTransitionLayer>
      ))}
    </>
  );
}

function CgTransitionLayer({ entering, dim, width, height, onExited, children }: {
  entering: boolean;
  dim?: boolean;
  width: number;
  height: number;
  onExited: () => void;
  children: ReactNode;
}) {
  // マウント直後は透明・縮小のまま1フレーム焼き付け、その次のフレームで目標値へ
  // 遷移させる（rAF を2段挟むのは、1段だと React 18 のバッチ処理で最初のレンダーと
  // 同じフレームに乗ってしまい、ブラウザがトランジションの起点を観測できないため）
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!entering) return undefined;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [entering]);

  // フェードアウト側: onTransitionEnd を主経路にしつつ、発火しない環境向けに
  // setTimeout フォールバックを添える（素朴な実装で構わない、との指示どおり）
  useEffect(() => {
    if (entering) return undefined;
    const t = setTimeout(onExited, CG_TRANSITION_MS + 80);
    return () => clearTimeout(t);
    // onExited は呼び出し側で毎回作り直される関数だが、依存に入れると
    // leaving 化の瞬間だけタイマーを張りたいこの効果の意図とずれるため見送る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entering]);

  const opacity = (entering ? (shown ? 1 : 0) : 0) * (dim ? 0.4 : 1);
  const scale = entering ? (shown ? 1 : SCALE_FROM) : SCALE_TO;
  const easing = entering ? EASE_IN : EASE_OUT;
  const style: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width,
    height,
    opacity,
    transform: `scale(${scale})`,
    transformOrigin: 'center center',
    transition: `opacity ${CG_TRANSITION_MS}ms ${easing}, transform ${CG_TRANSITION_MS}ms ${easing}`,
    pointerEvents: 'none',
  };

  return (
    <div style={style} onTransitionEnd={() => { if (!entering) onExited(); }}>
      {children}
    </div>
  );
}
