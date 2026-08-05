/**
 * `cn()` のクラス打ち消しのテスト。
 *
 * ── なぜここをテストするか ──────────────────────────────────
 *
 * `cn()` は「あとから渡したクラスが前のクラスを打ち消す」ための道具だが、
 * **打ち消せなかったときに何も起きない**。エラーも警告も出ず、型も通り、
 * lint も通る。**画面を見ても「なんとなく小さい/大きい」しか分からない。**
 *
 * 実際に踏んだ: `<Badge>` の既定 `text-xs`(12px) の上に `text-badge`(11px) を
 * 重ねたのに 12px のまま描かれ、和文4字のバッジが幅 62px の枠に収まらず
 * **2行に折り返して行の高さがそろわなくなった**。原因は tailwind-merge が
 * 独自の名前 (`text-badge`) を知らず、`text-...` を**色**の指定だと解釈して
 * 「サイズとは衝突しない」と判断したこと。
 *
 * 気づけたのは実ブラウザで font-size を実測したときだけだった。
 * **段を足したときに同じ穴に落ちないよう、ここで固定する。**
 */
import { describe, it, expect } from 'vitest';
import { cn } from '../src/client/utils';

describe('cn — v4 の型スケールが組み込みの text-* を打ち消す', () => {
  it('あとに書いた v4 の段が勝つ', () => {
    expect(cn('text-xs', 'text-badge')).toBe('text-badge');
    expect(cn('text-sm', 'text-list')).toBe('text-list');
    expect(cn('text-2xl', 'text-h1')).toBe('text-h1');
    expect(cn('text-xs', 'text-sub-sm')).toBe('text-sub-sm');
  });

  it('あとに書いた組み込みの段も v4 の段を打ち消す (向きが逆でも効く)', () => {
    expect(cn('text-badge', 'text-xs')).toBe('text-xs');
  });

  it('**色の指定とは衝突させない** (どちらも残る)', () => {
    // `text-list` は大きさ・`text-muted-foreground` は色。両方効かないといけない
    expect(cn('text-list', 'text-muted-foreground').split(' ').sort()).toEqual(
      ['text-list', 'text-muted-foreground'],
    );
  });
});

describe('cn — v4 の角丸の役割名が組み込みの rounded-* を打ち消す', () => {
  it('あとに書いた役割名が勝つ', () => {
    expect(cn('rounded-md', 'rounded-card')).toBe('rounded-card');
    expect(cn('rounded-full', 'rounded-badge')).toBe('rounded-badge');
    expect(cn('rounded-lg', 'rounded-control')).toBe('rounded-control');
  });
});

describe('cn — 凍結4アプリが渡す形は今までどおり', () => {
  it('v4 の名前を含まない指定は1文字も変えない', () => {
    // 凍結アプリは v4 の段を使わない。ここが変わると見た目が変わってしまう
    expect(cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold'))
      .toBe('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold');
    expect(cn('text-xs', 'text-sm')).toBe('text-sm');
    expect(cn('px-2.5', 'px-0')).toBe('px-0');
    expect(cn('bg-primary', 'bg-destructive')).toBe('bg-destructive');
  });
});
