/**
 * 下にスクロールしたら上辺バーを畳む（M9）
 *
 * ── なぜ要るのか（実測）──────────────────────────────────────
 *
 * スマホでは**上辺バー 64px ＋ 下タブ 56px が常に居座ります**。
 * 画面の高さが 667px（iPhone SE / 8）の端末では **18%** が枠で、
 * 名簿やカードを追っているあいだずっと消えません。
 *
 * 読んでいるあいだは枠が要らないので、**下へ動かしたら上辺バーを畳み、
 * 上へ戻したら出します。** 下タブは畳みません — あれは行き先そのもので、
 * 消すと「戻る道が無くなった」と読まれます。
 *
 * ── 畳むのは高さで、`transform` ではない ────────────────────
 *
 * `translateY(-100%)` だと**場所は取ったまま**なので、64px の空白が残るだけで
 * 中身は1行も増えません。`height: 0` にして本文の領域そのものを広げます。
 *
 * ── いちばん危ないところ: 下端での跳ね返り ──────────────────
 *
 * 畳むと本文の見える高さが 64px 増えます。**いちばん下まで来ていると、
 * 指を離したときのわずかな戻り（ゴムのような跳ね返り）が「上へ動かした」
 * と読まれ**、読んでいる途中で上辺バーが飛び出してきます。
 * だから**下端の近く（32px）では状態を変えません**。
 *
 * **実測（390×667・下端まで送ってから 20px 戻す）**:
 *   遊び 32px → `0/0/0/0/0…`（そのまま）
 *   遊び  0px → `0/64/64/64…`（**飛び出す**）
 * 際限なく往復するわけではなく、**1回ひっくり返ります**。
 * 守りを外して実際にひっくり返ることを確かめてあります。
 *
 * ── 焦点は CSS で守る ──────────────────────────────────────
 *
 * 畳んだ状態でも Tab は中の ☰ やベルに入れます。**JS で見張らず**
 * `tokens-v4.css` の `:not(:focus-within)` で、焦点が入ったら開くようにしてあります
 * （JS で見張ると、焦点の移り変わりに1フレーム遅れて畳み直すことになる）。
 *
 * ── 置き場所が `client-v4/` な理由 ──────────────────────────
 *
 * `shared/src/client/` に置くと**凍結4アプリの CSS が増えます**。
 * ここは v4 対象3アプリだけが走査します（このファイルにクラス名はありませんが、
 * 同じ仲間はここに揃えます）。
 */
import { useEffect, useState } from 'react';

/** ここより上では必ず出す（見出しのすぐ下で畳むと、行き先を見失う） */
const ALWAYS_SHOW_ABOVE = 72;
/** 手ぶれで畳んだり出したりしないための遊び */
const HYSTERESIS = 8;
/** 下端のこの範囲では状態を変えない（上の「往復」の説明） */
const BOTTOM_DEAD_ZONE = 32;

/**
 * `el`（スクロールする箱）を見張って、畳むかどうかを返します。
 *
 * @param el      スクロールする要素。まだ無いあいだは `null` を渡す
 * @param enabled `false` のあいだは何もしない（PC では見張る意味がない）
 */
export function useCollapseOnScroll(el: HTMLElement | null, enabled: boolean): boolean {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!el || !enabled) {
      setCollapsed(false);
      return;
    }

    let last = el.scrollTop;
    let ticking = false;

    const read = () => {
      ticking = false;
      const y = el.scrollTop;
      const atBottom = y + el.clientHeight >= el.scrollHeight - BOTTOM_DEAD_ZONE;

      if (y <= ALWAYS_SHOW_ABOVE) {
        setCollapsed(false);
      } else if (!atBottom) {
        if (y > last + HYSTERESIS) setCollapsed(true);
        else if (y < last - HYSTERESIS) setCollapsed(false);
      }
      // **`last` は必ず更新する。** 遊びの中で止めると、
      // ゆっくり動かしたときにいつまでも閾値に届かない
      last = y;
    };

    const onScroll = () => {
      // 1フレームに1回だけ読む（`scrollTop` の読み取りはレイアウトを確定させる）
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(read);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [el, enabled]);

  return collapsed;
}
