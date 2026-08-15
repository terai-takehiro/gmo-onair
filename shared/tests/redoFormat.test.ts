/**
 * **人が書いた本文を「AI が整えた」と言い、押しても何も起きない**（やり取り）
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * `body_html` は **AI が整えた本文にも、人が書いた本文にも**入ります。
 * 画面はその2つを区別せず `!!s || !!a.body_html` で判定していたので、
 * **AI が一度も触っていない記録に**:
 *
 * ・**「AI 整形」の札**が出る
 * ・**「整え直す」**が出る。ところがサーバーの待ち行列は
 *   `body_html IS NULL OR ai_formatted` を要求するので（`PENDING_SQL`）、
 *   **人が書いた本文の行は永久に対象になりません**
 *
 * ⚠️ **押すと 200 が返り、「整え直しの順番に戻しました（毎晩 3:00 に自動で
 * 整えます）」と出ます** — 実際には待ち行列に入っていません（実測）。
 * 何も起きないより悪く、**起きたと言い切ってしまいます**。
 *
 * もう1つ、**続けて2回押すと `before` も `after` も `null` の「不採用」**が
 * `ai_corrections` に積まれます（実測: 3回押して 3 件）。
 * **何も否定していない記録**が無修正採用率の分母だけを増やすので、
 * 会社方針の条件2（人の修正を差分として残す）が測れなくなります。
 *
 * v4 の PR で指摘された形です（#93）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

/** 説明文を外してから探す（前の版の形が注釈に書いてあるため） */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const CARD = code(read('client', 'src', 'contexts', 'sales', 'pages', 'projectDetail', 'thread', 'ThreadCard.tsx'));
const SERVICE = code(read('server', 'src', 'contexts', 'sales', 'services', 'activity-format.service.ts'));

describe('「整った本文がある」と「AI が整えた」を分ける', () => {
  it('AI の印がある行だけを AI 扱いにする', () => {
    expect(CARD).toMatch(/const hasBody = !!s \|\| !!a\.body_html;/);
    expect(CARD).toMatch(/const aiFormatted = !!a\.ai_formatted && hasBody;/);
  });

  it('「AI 整形」の札と「整え直す」は AI の印で出す', () => {
    // 前の版はどちらも `hasFormatted`（= `body_html` があれば真）で出していた
    expect(CARD).toMatch(/\{aiFormatted && \(/);
    expect(CARD).toMatch(/\{canEdit && aiFormatted && onRedo && \(/);
    expect(CARD).not.toMatch(/const hasFormatted =/);
  });

  it('「待っています」の判定は今までどおり', () => {
    // 「整え直す」を押した直後は印が立ったまま中身が空になる
    expect(CARD).toMatch(/const waitingRedo = !!a\.ai_formatted && !hasBody;/);
  });
});

describe('サーバーが人の本文を整え直させない', () => {
  it('⚠️ 画面で隠すだけにしない（古いタブ・直接叩きから通る）', () => {
    // 実測: 守りを外すと HTTP 200 で「順番に戻しました」と返るのに、
    // 待ち行列には入っていない（`PENDING_SQL` が false のまま）
    expect(SERVICE).toMatch(/if \(row\.body_html && !row\.ai_formatted\) \{/);
    expect(SERVICE).toMatch(/'NOT_AI_FORMATTED'/);
  });

  it('判定に要る列を引いている', () => {
    expect(SERVICE).toMatch(/SELECT id, description, body_struct, body_html, ai_formatted/);
  });

  it('⚠️ 中身が無いときは差分を残さない（空の「不採用」を積まない）', () => {
    // 実測: 守りを外して3回押すと 100 → 103 件（どれも before=null / after=null）
    expect(SERVICE).toMatch(/const out = row\.body_struct == null\s*\n\s*\? null\s*\n\s*: await findLatestAiOutput/);
  });
});
