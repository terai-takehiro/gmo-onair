/**
 * 「AI で整える」のやり方（設計 §7-1 ③）— **画面に出す言葉はここが正**
 *
 * 5つの中身（何をするか）はサーバーのプロンプト（`wiki-ai-prompts.ts` の
 * `TIDY_INSTRUCTION`）が持っています。ここが持つのは**画面のラベルと説明**だけです。
 *
 * ⚠️ **並びの先頭は `structure`（手順書の形にする）**。2026-09-22 のご指示で、
 * この機能の主な使い方は「手入力のメモを手順書の形にする」だと決まっています。
 * 並べ替えると、いちばん使うものが端に寄ります。
 */
import type { WikiTidyMode } from '@gmo-onair/shared/src/wiki/types';

export interface TidyModeChoice {
  id: WikiTidyMode;
  label: string;
  /** 何が起きるかの1行（選んでいるときだけ出す） */
  hint: string;
}

export const TIDY_MODES: TidyModeChoice[] = [
  {
    id: 'structure',
    label: '手順書の形にする',
    hint: '見出しで区切り、作業は番号付きの箇条書きに、気をつけることは注意書きにします。',
  },
  {
    id: 'heading',
    label: '見出しを付ける',
    hint: '文のまとまりごとに見出しを付けます。言い回しはそのままです。',
  },
  {
    id: 'bullets',
    label: '箇条書きにする',
    hint: '並んでいることを箇条書きにします。順番が意味を持つものは番号付きにします。',
  },
  {
    id: 'terms',
    label: '言葉を揃える',
    hint: '同じものを指す別の呼び方を、社内で使う言葉に揃えます。',
  },
  {
    id: 'shorten',
    label: '短くする',
    hint: '意味を落とさずに短くします。手順・数値・注意書きは残します。',
  },
];

export const DEFAULT_TIDY_MODE: WikiTidyMode = 'structure';

export function tidyModeLabel(mode: WikiTidyMode): string {
  return TIDY_MODES.find((m) => m.id === mode)?.label ?? '整える';
}
