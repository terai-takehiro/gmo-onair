/**
 * ダイアログ・シートの幅の段（`shared/src/client/ui/dialogSize.ts`）
 *
 * ── なぜテストで固定するか ──────────────────────────────────
 *
 * 幅の段は**2か所に書き写されている**:
 *
 * - 旧 `Dialog`  … `DIALOG_MAX_WIDTH_CLASS`（`shared/src/client/ui/dialogSize.ts`）
 * - v4 `Sheet` … `SHEET_WIDTH_CLASS`（`shared/src/client-v4/sheet.tsx`）
 *
 * 分けてあるのは、**Tailwind が完全なクラス文字列しか拾えない**ため
 * （文字列を組み立てると、ビルドしたときだけ幅が効かなくなる）。
 * 書き写しなので**片方だけ直すとずれる** — 「同じ `size` を渡したのに、
 * どちらの土台に載っているかで幅が違う」という、画面を見比べないと
 * 気づけない食い違いになる。ここで機械的に突き合わせる。
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_DIALOG_SIZE,
  DIALOG_SIZE_WIDTH,
  DIALOG_MAX_WIDTH_CLASS,
  resolveDialogSize,
  type DialogSize,
} from '../src/client/ui/dialogSize';
import { SHEET_WIDTH_CLASS } from '../src/client-v4/sheet';

const SIZES: DialogSize[] = ['sm', 'md', 'lg', 'xl', 'full'];

describe('幅の段', () => {
  it('5段そろっている', () => {
    expect(Object.keys(DIALOG_SIZE_WIDTH)).toEqual(SIZES);
    expect(Object.keys(DIALOG_MAX_WIDTH_CLASS)).toEqual(SIZES);
    expect(Object.keys(SHEET_WIDTH_CLASS)).toEqual(SIZES);
  });

  it('既定は md = 640px（512px / 560px から広げた回で決めた値）', () => {
    expect(DEFAULT_DIALOG_SIZE).toBe('md');
    expect(DIALOG_SIZE_WIDTH.md).toBe('640px');
  });

  it('段ごとの px は決めた通り', () => {
    expect(DIALOG_SIZE_WIDTH).toEqual({
      sm: '420px',
      md: '640px',
      lg: '840px',
      xl: '1080px',
      full: 'min(1400px,96vw)',
    });
  });

  it('旧 Dialog と v4 Sheet が同じ px を書いている', () => {
    for (const size of SIZES) {
      expect(DIALOG_MAX_WIDTH_CLASS[size]).toContain(DIALOG_SIZE_WIDTH[size]);
      expect(SHEET_WIDTH_CLASS[size]).toContain(DIALOG_SIZE_WIDTH[size]);
    }
  });

  it('クラスは完全な文字列（組み立てていない）', () => {
    for (const cls of [...Object.values(DIALOG_MAX_WIDTH_CLASS), ...Object.values(SHEET_WIDTH_CLASS)]) {
      // Tailwind は走査した文字列をそのまま探すので、`${…}` が混ざると生成されない
      expect(cls).not.toContain('$');
      expect(cls.trim()).toBe(cls);
      // 幅の指定は空白を含めない（Tailwind の任意値は空白を許さない）
      expect(cls).not.toMatch(/\s/);
    }
  });

  it('旧 Dialog の段には画面幅の接頭辞を付けない（呼び出し側の指定を勝たせるため）', () => {
    // 接頭辞を付けると、接頭辞なしで幅を渡している既存の呼び出しが
    // tailwind-merge の打ち消し対象から外れ、CSS の並び順で土台が勝ってしまう
    for (const cls of Object.values(DIALOG_MAX_WIDTH_CLASS)) {
      expect(cls).not.toContain(':');
    }
  });
});

describe('resolveDialogSize', () => {
  it('何も渡さなければ既定（md）', () => {
    expect(resolveDialogSize()).toBe('md');
    expect(resolveDialogSize(undefined, false)).toBe('md');
  });

  it('wide は lg の別名（旧 API の互換）', () => {
    expect(resolveDialogSize(undefined, true)).toBe('lg');
  });

  it('size と wide が両方来たら size が勝つ', () => {
    expect(resolveDialogSize('sm', true)).toBe('sm');
    expect(resolveDialogSize('full', true)).toBe('full');
  });

  it('渡された段をそのまま返す', () => {
    for (const size of SIZES) expect(resolveDialogSize(size)).toBe(size);
  });
});
