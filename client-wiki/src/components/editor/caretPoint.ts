/**
 * `<textarea>` の中の、ある位置の画面上の座標を測る
 *
 * 選んだ文字の近くに小さなバー（太字・リンク）を浮かせるために要ります。
 * ブラウザは `<textarea>` の中の座標を教えてくれないので、**同じ書体・同じ幅の
 * 隠した写しを作って、そこでの位置を測る**という昔からのやり方を使います。
 *
 * ⚠️ 測れなかったときは `null` を返します。呼ぶ側は**バーを出さない**のではなく
 * 決まった場所に出すなど、必ず代わりの置き場所を持つこと（測定は補助であって、
 * これが外れて機能ごと消えてよいわけではない）。
 */

/**
 * 写しに移す書式（CSS の名前で持つ）。ここが1つでも欠けると測った位置がずれる。
 * 名前で `getPropertyValue` / `setProperty` を使うのは、型の上で書けない
 * プロパティ名を避けるため。
 */
const COPIED = [
  'box-sizing', 'font-family', 'font-size', 'font-weight', 'font-style',
  'letter-spacing', 'line-height', 'text-indent', 'text-transform', 'word-spacing',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
];

export interface CaretPoint {
  /** `<textarea>` の左上からの位置（スクロールを引いたあと） */
  x: number;
  y: number;
  /** その行の高さ（バーを行の上に置くのに使う） */
  lineHeight: number;
}

export function caretPoint(el: HTMLTextAreaElement, index: number): CaretPoint | null {
  if (typeof document === 'undefined') return null;
  try {
    const style = window.getComputedStyle(el);
    const mirror = document.createElement('div');
    for (const key of COPIED) mirror.style.setProperty(key, style.getPropertyValue(key));
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.overflowWrap = 'break-word';
    mirror.style.top = '0';
    mirror.style.left = '-9999px';
    mirror.style.height = 'auto';
    mirror.style.width = `${el.clientWidth}px`;

    mirror.textContent = el.value.slice(0, index);
    const marker = document.createElement('span');
    // 空だと高さを持たないので、続きの1文字（無ければ点）を入れて測る
    marker.textContent = el.value.slice(index, index + 1) || '.';
    mirror.appendChild(marker);
    document.body.appendChild(mirror);

    const lineHeight = marker.offsetHeight || parseFloat(style.lineHeight) || 20;
    const point = {
      x: marker.offsetLeft - el.scrollLeft,
      y: marker.offsetTop - el.scrollTop,
      lineHeight,
    };
    document.body.removeChild(mirror);
    return point;
  } catch {
    return null;
  }
}
