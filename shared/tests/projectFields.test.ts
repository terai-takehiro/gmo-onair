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
  EMPTY_NEW_PROJECT, isPartialClassification, missingOf, moreFieldCount,
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

/**
 * 直す画面（`mode='edit'`）だけの決めごと（ご指示）。
 *
 * ── なぜ分けるか（実際に起きたこと）──────────────────────────
 *
 * migration 182 が埋め戻したのは旧 `project_type` の**4種だけ**で、
 * **`other` は列の既定値**です。つまり **AI（MCP）が起こしたネタ案件・
 * 決算取込・Excel/GLS 取込でできた案件**はどれも分類が**空のまま GLS-A に残って**います。
 *
 * 必須のままだと、そういう案件は**案件名を直したいだけでも保存が押せません**。
 * しかも画面には「選ぶ」と出るので、**入れたのに画面が戻したように見えます**
 * （実際にそう報告されました）。
 *
 * → **両方とも空なら通す。片方だけなら止める。作る画面は今までどおり必須。**
 */
describe('missingOf — 直す画面では「もともと空の分類」を止めない', () => {
  /** 分類だけが空の、取込・AI 起票でできた案件 */
  const NO_CLASS: NewProjectValues = { ...FILLED, audience: '', project_category: '' };

  it('両方とも空なら保存できる（名前だけ直せる）', () => {
    expect(missingOf(NO_CLASS, 'edit')).toEqual([]);
  });

  it('作る画面では今までどおり両方とも必須', () => {
    expect(missingOf(NO_CLASS, 'create')).toEqual(['客入れの有無', '案件分類']);
  });

  it('既定は作る画面（引数を省いても必須が緩まない）', () => {
    expect(missingOf(NO_CLASS)).toEqual(missingOf(NO_CLASS, 'create'));
  });

  /*
   * ⚠️ **片方だけは通さない。** サーバーは2つ揃ったときだけ保存するので
   * （`resolveClassification`）、片方だけ送ると**黙って捨てられ**、
   * 押した人には「選んだのに入っていない」としか見えません。
   */
  it('客入れの有無だけ入れたら、案件分類を訊く', () => {
    expect(missingOf({ ...NO_CLASS, audience: 'with_audience' }, 'edit')).toEqual(['案件分類']);
  });

  it('案件分類だけ入れたら、客入れの有無を訊く', () => {
    expect(missingOf({ ...NO_CLASS, project_category: 'recording' }, 'edit')).toEqual(['客入れの有無']);
  });

  it('両方入れれば通る', () => {
    expect(missingOf(FILLED, 'edit')).toEqual([]);
  });

  it('分類を緩めても、ほかの3つは直す画面でも必須のまま', () => {
    const empty: NewProjectValues = { ...EMPTY_NEW_PROJECT };
    expect(missingOf(empty, 'edit')).toEqual(['お客様', '案件名', '社内の担当']);
  });
});

/**
 * `touchedClassification`（第3引数）— 「片方だけ」を止めるのは触ったときだけ。
 *
 * もともと片方だけしか入っていない古いデータ（手動SQL・過去の他経路の書き込みなど）を
 * 開いた場合、分類を1つも触らずに他の項目だけ直したい。このとき毎回ブロックすると
 * 「継続区分を変えても保存ボタンが押せない」になる（実際に報告された）。
 */
describe('missingOf — touchedClassification（片方だけを止めるのは触ったときだけ）', () => {
  /** もともと客入れの有無だけ入っている、古いデータの案件 */
  const PARTIAL: NewProjectValues = { ...FILLED, project_category: '' };

  it('既定（省略）は今までどおり常に見る（片方だけなら止める）', () => {
    expect(missingOf(PARTIAL, 'edit')).toEqual(['案件分類']);
  });

  it('触っていなければ、片方だけでも直す画面では通す（無関係な項目だけ保存できる）', () => {
    expect(missingOf(PARTIAL, 'edit', false)).toEqual([]);
  });

  it('触っていれば、今までどおり片方だけを止める', () => {
    expect(missingOf(PARTIAL, 'edit', true)).toEqual(['案件分類']);
  });

  it('作る画面では touchedClassification を渡しても常に必須のまま', () => {
    expect(missingOf(PARTIAL, 'create', false)).toEqual(['案件分類']);
  });

  it('両方とも空なら touchedClassification に関わらず通す', () => {
    const noClass: NewProjectValues = { ...FILLED, audience: '', project_category: '' };
    expect(missingOf(noClass, 'edit', false)).toEqual([]);
    expect(missingOf(noClass, 'edit', true)).toEqual([]);
  });
});

describe('isPartialClassification — 片方だけ入っているか', () => {
  it('両方 空 / 両方 入り は「片方だけ」ではない', () => {
    expect(isPartialClassification(EMPTY_NEW_PROJECT)).toBe(false);
    expect(isPartialClassification(FILLED)).toBe(false);
  });

  it('どちらか片方だけなら true', () => {
    expect(isPartialClassification({ ...FILLED, project_category: '' })).toBe(true);
    expect(isPartialClassification({ ...FILLED, audience: '' })).toBe(true);
  });
});

/**
 * ⚠️ **継続区分（回のある案件か）は「進んだら聞く」から出した**
 * （`RegularSeriesSection` の見出し行へ。`docs/design/v4/_form-order.md`）。
 * 畳んだ枠の中で選ぶと、その値に依存する「レギュラーの取り決め」カードが
 * **枠の外に**生える形だったため。作る画面・直す画面とも数が1つ減っている。
 */
/**
 * **事業主体（2026-09-06・migration 282）が両方の画面に1つ増えた。**
 * 隔週キープの主体別の収支のための欄で、既定は「自動」（お客様の区分から）。
 */
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
