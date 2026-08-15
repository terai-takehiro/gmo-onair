/**
 * 帳票の BOX 格納先を固定する。
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * `scope` を取り違えると、**社内限りのつもりの帳票が社外と共有するフォルダに
 * 入ります**。しかも入ってしまえば画面は「保存しました」としか言わないので、
 * **誰も気づけません**（案件の写真を社内限りに置いてはいけない、と同じ理由の裏返し）。
 * サブフォルダ名も、1文字でも違うと `ensureSubfolder` が**新しいフォルダを作る**ので、
 * `01_見積・提案` の隣に `01_見積提案` が生えて、探しても見つからなくなります。
 *
 * 表そのもの（`doc-box-dest.ts`）は DB にも BOX にもつながないので、
 * ここから直接読めます。
 */
import { describe, it, expect } from 'vitest';
import {
  DOC_BOX_DEST, describeDocBoxDest, type FinanceDocKind,
} from '../../server/src/shared/services/doc-box-dest';
import { LEGACY_SUBFOLDER_ALIASES } from '../../server/src/contexts/gpm/services/gpm-box-folder.service';

/**
 * 案件フォルダに実際に作られるサブフォルダ
 * (`server/src/contexts/sales/services/box-folder.service.ts`)。
 * **綴りをここに写してあるのは、写しを比べるため**です —
 * 片方だけ直すと `ensureSubfolder` が黙って新しいフォルダを作ります。
 */
const INTERNAL_SUBFOLDERS = ['02_発注・契約', '03_請求', '07_原価・利益管理'];
const EXTERNAL_SUBFOLDERS = ['01_見積・提案', '04_Qシート', '05_台本・進行表', '06_納品物', '08_写真'];

describe('帳票の BOX 格納先', () => {
  it('見積書は社外と共有するフォルダの 01_見積・提案', () => {
    expect(DOC_BOX_DEST.estimate).toEqual({ scope: 'external', subfolder: '01_見積・提案' });
  });

  it('請求書と検収書は社内限りフォルダの 03_請求 (ご判断)', () => {
    expect(DOC_BOX_DEST.invoice).toEqual({ scope: 'internal', subfolder: '03_請求' });
    expect(DOC_BOX_DEST.inspection).toEqual({ scope: 'internal', subfolder: '03_請求' });
  });

  it('3種とも行き先を持つ (増やしたら必ずここに現れる)', () => {
    expect(Object.keys(DOC_BOX_DEST).sort()).toEqual(['estimate', 'inspection', 'invoice']);
  });

  it('置き先は案件フォルダに実在するサブフォルダだけ', () => {
    for (const kind of Object.keys(DOC_BOX_DEST) as FinanceDocKind[]) {
      const { scope, subfolder } = DOC_BOX_DEST[kind];
      const known = scope === 'internal' ? INTERNAL_SUBFOLDERS : EXTERNAL_SUBFOLDERS;
      expect(known, `${kind} の ${scope}/${subfolder}`).toContain(subfolder);
    }
  });
});

/**
 * プロジェクト管理 (GPM) のフォルダ構成。
 * **帳票は案件とプロジェクトで同じ表（`DOC_BOX_DEST`）を通る**ので、
 * 綴りがそろっていないと `ensureSubfolder` が**隣に双子のフォルダを作ります**
 * （画面はどちらでも「BOX に保存しました」としか言わないので気づけません）。
 */
const GPM_INTERNAL_SUBFOLDERS = ['02_原価・発注', '03_請求'];
const GPM_EXTERNAL_SUBFOLDERS = ['01_見積・提案', '03_議事メモ', '04_図面', '05_仕様書', '06_工程表'];

describe('プロジェクト管理の BOX 格納先', () => {
  it('帳票3種の置き先はプロジェクトのフォルダにも実在する', () => {
    for (const kind of Object.keys(DOC_BOX_DEST) as FinanceDocKind[]) {
      const { scope, subfolder } = DOC_BOX_DEST[kind];
      const known = scope === 'internal' ? GPM_INTERNAL_SUBFOLDERS : GPM_EXTERNAL_SUBFOLDERS;
      expect(known, `${kind} の ${scope}/${subfolder}`).toContain(subfolder);
    }
  });

  it('昔の綴り (01_個別見積) は 01_見積・提案 として受け入れる', () => {
    // 名前をそろえる前に作ったプロジェクトは `01_個別見積` を持っている。
    // 受け入れないと、そのプロジェクトだけ**空の `01_見積・提案` が生えて**
    // 見積書がそちらに入り、人は古いフォルダを見て「出ていない」と読む
    expect(LEGACY_SUBFOLDER_ALIASES['01_見積・提案']).toEqual(['01_個別見積']);
  });

  it('別名は本来の綴りの代わりにしかならない (知らないフォルダを掴まない)', () => {
    for (const [name, aliases] of Object.entries(LEGACY_SUBFOLDER_ALIASES)) {
      // 別名の行き先そのものが実在するフォルダであること
      expect([...GPM_INTERNAL_SUBFOLDERS, ...GPM_EXTERNAL_SUBFOLDERS, ...INTERNAL_SUBFOLDERS, ...EXTERNAL_SUBFOLDERS])
        .toContain(name);
      // 別名が**現役のフォルダ名**と重なっていないこと。重なると
      // 「01_見積・提案 が無いから 03_請求 を使う」のような取り違えになる
      for (const alias of aliases) {
        expect([...GPM_INTERNAL_SUBFOLDERS, ...GPM_EXTERNAL_SUBFOLDERS], alias).not.toContain(alias);
      }
    }
  });
});

describe('describeDocBoxDest', () => {
  it('画面に出す言い方を表から作る (写しを作らない)', () => {
    expect(describeDocBoxDest('estimate')).toBe('社外と共有するフォルダの「01_見積・提案」');
    expect(describeDocBoxDest('invoice')).toBe('社内限りフォルダの「03_請求」');
    expect(describeDocBoxDest('inspection')).toBe('社内限りフォルダの「03_請求」');
  });

  // 昔の綴りのフォルダに入ったときは**そのフォルダの名前で答える**。
  // 表の綴りを返すと、受け入れが要る案件でだけ「01_見積・提案 に入れました」と嘘になり、
  // 人は**空のフォルダを探しに行く**（`doc-box.service` が `ensureSubfolder` の
  // 返り値の名前を渡している。渡し忘れるとここが落ちる）
  it('実際に入ったフォルダの名前で答える (昔の綴りを掴んだとき)', () => {
    expect(describeDocBoxDest('estimate', '01_個別見積'))
      .toBe('社外と共有するフォルダの「01_個別見積」');
    // 親フォルダ (社内/社外) は表のまま — 名前を渡しても scope は変わらない
    expect(describeDocBoxDest('invoice', '03_請求ほか')).toBe('社内限りフォルダの「03_請求ほか」');
  });

  it('名前を渡さなければ表の綴りを言う (まだ入れていないとき)', () => {
    for (const kind of Object.keys(DOC_BOX_DEST) as FinanceDocKind[]) {
      expect(describeDocBoxDest(kind, undefined)).toBe(describeDocBoxDest(kind));
      // 空文字が来ても「」にしない（`ensureSubfolder` が名前を取れなかったとき）
      expect(describeDocBoxDest(kind, '')).toBe(describeDocBoxDest(kind));
    }
  });

  it('社内と社外を言い間違えない (取り違えると原価が外に出たと読める)', () => {
    for (const kind of Object.keys(DOC_BOX_DEST) as FinanceDocKind[]) {
      const text = describeDocBoxDest(kind);
      const internal = DOC_BOX_DEST[kind].scope === 'internal';
      expect(text.startsWith('社内限り')).toBe(internal);
      expect(text.startsWith('社外と共有')).toBe(!internal);
    }
  });

  // ヘッダー (`X-Box-Where`) に載せて画面へ渡すので、%エンコードで往復できること。
  // 戻せないと「BOX に保存しました」の行き先が消える
  it('%エンコードして戻すと元に戻る', () => {
    for (const kind of Object.keys(DOC_BOX_DEST) as FinanceDocKind[]) {
      const text = describeDocBoxDest(kind);
      expect(decodeURIComponent(encodeURIComponent(text))).toBe(text);
    }
  });
});
