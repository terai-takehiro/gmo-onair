/**
 * 案件台帳 — 列の表と、まとめて直すときの送り方を固定する
 *
 * ── なぜ固定するか ──────────────────────────────────────────
 *
 * この画面の危ないところは**まとめて書き換える**ことです。取り消せません
 * （どの案件が元は何だったかを持っていない）。しかも間違いは
 * **画面を見ても分かりません** — N 件が黙って別の値になるだけです。
 *
 * ここで固定するのは3つ:
 *
 *  ① **列の幅が寸法表の7段に乗っていること**（乗っていないと「この画面だけの幅」が
 *    でき、金額の桁が他の一覧と揃わない）
 *  ② **片方だけの分類を送らないこと**。サーバーは2つ揃ったときだけ保存するので
 *    （`resolveClassification`）、片方だけ送ると**黙って捨てられ**、
 *    押した人には「選んだのに入っていない」としか見えない
 *  ③ **ステージが一括の項目に入っていないこと**。`PATCH /projects/bulk` は
 *    履歴（`project_stage_changes`）・失注理由・GLS 発番の確認をどれもしないので、
 *    ここから変えられるようにすると**記録の残らない段の移動**が起きる
 */
import { describe, it, expect } from 'vitest';
import { SLOT_WIDTHS } from '../src/client/ui/row';
import {
  BULK_FIELDS, COL_DEFS, DEFAULT_COL_ORDER, DEFAULT_VISIBLE_COLS, colDef,
} from '../../client/src/contexts/sales/pages/projectLedger/types';
import { buildBulkSet } from '../../client/src/contexts/sales/pages/projectLedger/bulkSet';

/** `buildBulkSet` に渡す値の空の形 */
const EMPTY = { audience: '', category: '', text: '', flag: '', tagsMode: 'append' };

describe('列の表（COL_DEFS）', () => {
  it('鍵が重複していない（重複すると React の key がぶつかって列が消える）', () => {
    const keys = COL_DEFS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('幅は寸法表の7段だけ（この画面だけの幅を作らない）', () => {
    for (const c of COL_DEFS) {
      if (c.width === undefined) continue;
      expect(SLOT_WIDTHS as readonly number[]).toContain(c.width);
    }
  });

  /**
   * **幅を持たない列は1つだけ**（＝案件名）。2つ以上を伸ばすと、
   * 行ごとにどちらが伸びるかが変わって縦の線が崩れます
   * （`RowMain` が「唯一伸びる子」なのと同じ決めごと）。
   */
  it('伸びる列は1つも無い（あると table-layout: fixed が使えない）', () => {
    // ⚠️ **実測で見つけた**: 伸びる列があるとブラウザが中身に合わせて広げ、
    // 1440px の画面で表が 1376px になって**いちばん右の列が画面の外**に出ていた
    const flex = COL_DEFS.filter((c) => c.width === undefined);
    expect(flex.map((c) => c.key)).toEqual([]);
  });

  it('既定で出す列は多すぎない（開いた瞬間に横スクロールにしない）', () => {
    expect(DEFAULT_VISIBLE_COLS.length).toBeLessThanOrEqual(10);
    expect(DEFAULT_VISIBLE_COLS.length).toBeGreaterThan(0);
  });

  it('既定の並びは全部の列を含む（`ColumnPicker` から消える列を作らない）', () => {
    expect(new Set(DEFAULT_COL_ORDER)).toEqual(new Set(COL_DEFS.map((c) => c.key)));
  });

  it('金額の列は右寄せ（桁を縦にそろえる）', () => {
    for (const key of ['estimate_amount', 'expected_amount', 'total_revenue', 'total_purchase'] as const) {
      expect(colDef(key).numeric).toBe(true);
    }
  });
});

describe('まとめて直す項目（BULK_FIELDS）', () => {
  /*
   * ⚠️ **ステージを足さないこと。** 足すと、履歴も失注理由も GLS 発番の確認も
   * 無いまま段が動きます。段は案件詳細のヘッダーから1件ずつ
   * （`PATCH /projects/:id/stage`）。
   */
  it('ステージは入っていない', () => {
    expect(BULK_FIELDS.map((f) => f.key)).not.toContain('stage');
  });

  it('案件名・金額は入っていない（1件ずつ直すもの）', () => {
    const keys = BULK_FIELDS.map((f) => f.key) as string[];
    expect(keys).not.toContain('name');
    expect(keys).not.toContain('expected_amount');
  });
});

describe('buildBulkSet — 送る中身', () => {
  it('何も選んでいなければ送らない（押せない）', () => {
    for (const f of BULK_FIELDS) {
      if (f.key === 'tags') continue;   // タグは置換だけ空でも通す（下で確かめる）
      expect(buildBulkSet(f.key, EMPTY)).toBeNull();
    }
  });

  /*
   * ここが今回いちばん大事な1件。**片方だけでは送らない。**
   * 送ると `resolveClassification` が導けず、選んだ値は**黙って捨てられます**。
   */
  it('分類は片方だけでは送らない', () => {
    expect(buildBulkSet('classification', { ...EMPTY, audience: 'with_audience' })).toBeNull();
    expect(buildBulkSet('classification', { ...EMPTY, category: 'recording' })).toBeNull();
  });

  it('分類は2つ揃ったときだけ、2つとも送る（旧種類は送らない＝サーバーが導く）', () => {
    const set = buildBulkSet('classification', { ...EMPTY, audience: 'with_audience', category: 'recording' });
    expect(set).toEqual({ audience: 'with_audience', project_category: 'recording' });
    expect(set).not.toHaveProperty('project_type');
  });

  it('申込書・ロゴは「なし」も送れる（0 を空と混同しない）', () => {
    expect(buildBulkSet('application_form', { ...EMPTY, flag: '0' })).toEqual({ application_form: false });
    expect(buildBulkSet('logo_permission', { ...EMPTY, flag: '1' })).toEqual({ logo_permission: true });
  });

  /**
   * タグの「置き換える」は**空でも通す** — タグを消したいことがあるため。
   * 「足す」は空だと何も起きないので押させない。
   */
  it('タグ: 置き換えは空でも通し、足すは空だと送らない', () => {
    expect(buildBulkSet('tags', { ...EMPTY, tagsMode: 'replace', text: '' }))
      .toEqual({ tags: '', tagsMode: 'replace' });
    expect(buildBulkSet('tags', { ...EMPTY, tagsMode: 'append', text: '' })).toBeNull();
    expect(buildBulkSet('tags', { ...EMPTY, tagsMode: 'append', text: '周年' }))
      .toEqual({ tags: '周年', tagsMode: 'append' });
  });
});

/**
 * サーバー側の約束。**`project_type` を単独で書かない**ことを、
 * SQL を組み立てているファイルの文面で固定します（`bulkUpdate`）。
 * ここが崩れると分類と種類がずれた行ができ、
 * **一覧と詳細で違う分類が出る**のに画面からは正誤が判断できません。
 */
describe('サーバーの一括更新（bulkUpdate）', () => {
  it('2段分類を受け、旧種類はそこから導いている', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(
      join(__dirname, '..', '..', 'server', 'src', 'contexts', 'sales', 'services', 'project.service.ts'),
      'utf8',
    );
    const fn = src.slice(src.indexOf('async bulkUpdate('), src.indexOf('async create('));
    // 2段で来たら `projectTypeOf` で導く
    expect(fn).toMatch(/projectTypeOf\(\s*set\.audience,\s*set\.project_category\s*\)/);
    // 旧種類で来たら2段を埋め戻す（片方だけ書かない）
    expect(fn).toMatch(/classificationOf\(set\.project_type\)/);
    // 片方だけの2段は 400 で止める
    expect(fn).toMatch(/VALIDATION_ERROR/);
  });
});
