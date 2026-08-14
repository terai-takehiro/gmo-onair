/**
 * 案件の入力項目 — 案件作成（`/sales/projects/new`）と案件を直す
 * （`/sales/projects/:id/edit`）が**同じ定義を使っている**ことを固定する。
 *
 * ── なぜ固定するか ──────────────────────────────────────────
 *
 * この2画面は長いあいだ別々の欄を持っており、作るときに訊いた
 * 客入れの有無・案件分類・ご担当・継続区分・来場人数・案件内容・リード経路が
 * **直す画面にひとつも無い**状態でした。欄が無いことは型でも lint でも
 * 見つかりません（画面を開いた人だけが気づく）。
 *
 * → 必須の判定（`missingOf`）と畳んだ札の数（`moreFieldCount`）は
 *   **1つの定義を両方の画面が読む**形にしたので、その約束をここで固定します。
 *   欄を足して数を直し忘れると、ここが落ちます。
 */
import { describe, it, expect } from 'vitest';
import {
  EMPTY_NEW_PROJECT, missingOf, moreFieldCount,
  type NewProjectValues,
} from '../../client/src/contexts/sales/pages/projectNew/fields';

/** 5つの必須がすべて埋まった値 */
const FILLED: NewProjectValues = {
  ...EMPTY_NEW_PROJECT,
  customer_id: 'cus-1',
  name: '60周年 記念式典 配信・収録',
  audience: 'with_audience',
  project_category: 'broadcast',
  assigned_to: 'usr-1',
};

describe('missingOf — 足りない必須項目', () => {
  it('空のときは5つとも名指しする（フォームの並び順）', () => {
    expect(missingOf(EMPTY_NEW_PROJECT)).toEqual([
      'お客様', '案件名', '客入れの有無', '案件分類', '社内の担当',
    ]);
  });

  it('埋まっていれば空', () => {
    expect(missingOf(FILLED)).toEqual([]);
  });

  it('案件名が空白だけなら「入っていない」と数える', () => {
    expect(missingOf({ ...FILLED, name: '   ' })).toEqual(['案件名']);
  });

  it('客入れの有無だけ選んでも、案件分類が空なら足りない', () => {
    expect(missingOf({ ...FILLED, project_category: '' })).toEqual(['案件分類']);
  });

  /**
   * GLS-B（工事・構築のプロジェクト）は2段分類を持たない。
   * 直す画面で古い GLS-B の行を開いたときに、
   * **意味の無い分類を選ばせない**（サーバーも NULL のままにする）。
   */
  it('GLS-B では2段分類を訊かない', () => {
    const b: NewProjectValues = {
      ...FILLED, gls_category: 'B', audience: '', project_category: '',
    };
    expect(missingOf(b)).toEqual([]);
  });

  it('GLS-B でも お客様・案件名・社内の担当 は必須のまま', () => {
    const b: NewProjectValues = { ...EMPTY_NEW_PROJECT, gls_category: 'B' };
    expect(missingOf(b)).toEqual(['お客様', '案件名', '社内の担当']);
  });
});

describe('moreFieldCount — 畳んだ「進んだら聞く」の札の数', () => {
  it('作る画面: 有観客は9・無観客は8（来場人数の欄ごと出ないため）', () => {
    expect(moreFieldCount('with_audience')).toBe(9);
    expect(moreFieldCount('no_audience')).toBe(8);
  });

  it('作る画面: まだ選んでいないときは来場人数を数えない', () => {
    expect(moreFieldCount('')).toBe(8);
  });

  /**
   * 直す画面は 実施日・最初のタスク・メモ を出さず（それぞれ
   * スタジオの日程・タスクタブ・やり取りが持つ）、グループ区分を出す。
   */
  it('直す画面: 有観客は7・無観客は6', () => {
    expect(moreFieldCount('with_audience', 'edit')).toBe(7);
    expect(moreFieldCount('no_audience', 'edit')).toBe(6);
  });

  it('直す画面のほうが必ず少ない（3つ落として1つ足すため）', () => {
    expect(moreFieldCount('with_audience', 'edit'))
      .toBe(moreFieldCount('with_audience') - 2);
  });
});
