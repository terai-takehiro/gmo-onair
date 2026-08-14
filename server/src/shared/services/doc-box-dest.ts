/**
 * 帳票（見積書・請求書・検収書）を BOX のどこに入れるか — **この表が正**
 *
 * ── なぜ別ファイルなのか ────────────────────────────────────
 *
 * 中身は表だけで、DB にも BOX にもつなぎません。**BOX につないでいない環境
 * （検証用の Postgres だけ立てたとき・CI）でも試験で固定できる**ようにするためです
 * （`box.ts` の `mapBoxItems` を純関数にしてあるのと同じ理由）。
 *
 * ── 間違えると何が起きるか ──────────────────────────────────
 *
 * `scope` を取り違えると、**社内限りのつもりの書類が社外と共有するフォルダに入ります**。
 * しかも入ってしまえば画面はどちらも「保存しました」としか言わないので、
 * **誰も気づけません**。`shared/tests/docBoxDest.test.ts` で固定してあります。
 */

/** 帳票の種類。`GET /revenues/:id/pdf?type=` と同じ語を使う（言葉を2つ作らない） */
export type FinanceDocKind = 'estimate' | 'invoice' | 'inspection';

export interface DocBoxDest {
  /** `internal` = 社内限り親フォルダ / `external` = 社外と共有する親フォルダ */
  scope: 'internal' | 'external';
  /** 案件フォルダの直下のサブフォルダ名。`box-folder.service.ts` の並びと同じ綴り */
  subfolder: string;
}

/**
 * | 帳票   | 親フォルダ | サブフォルダ |
 * | ---    | ---        | ---          |
 * | 見積書 | 社外と共有 | `01_見積・提案` |
 * | 請求書 | 社内限り   | `03_請求`       |
 * | 検収書 | 社内限り   | `03_請求`       |
 *
 * 検収書を社内限りに置くのはご判断です（検収 → 請求 の流れなので請求書と
 * 同じ場所にまとめ、お客様に渡すときは人が BOX から共有する）。
 */
export const DOC_BOX_DEST: Record<FinanceDocKind, DocBoxDest> = {
  estimate:   { scope: 'external', subfolder: '01_見積・提案' },
  invoice:    { scope: 'internal', subfolder: '03_請求' },
  inspection: { scope: 'internal', subfolder: '03_請求' },
};

/**
 * 画面に出す言い方。**サーバーの表から作る** — 写すと出る場所と入る場所が食い違う。
 *
 * @param actualSubfolder **実際に入ったフォルダの名前**（`ensureSubfolder` が返すもの）。
 *   昔の綴りのフォルダ（プロジェクト管理の `01_個別見積`）を掴んだときに渡します。
 *   渡さなければ表の綴り＝**これから入るはずの場所**を言います（まだ入れていないとき）。
 */
export function describeDocBoxDest(kind: FinanceDocKind, actualSubfolder?: string): string {
  const d = DOC_BOX_DEST[kind];
  const parent = d.scope === 'internal' ? '社内限りフォルダ' : '社外と共有するフォルダ';
  return `${parent}の「${actualSubfolder || d.subfolder}」`;
}
