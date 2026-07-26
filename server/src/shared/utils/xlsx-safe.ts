// shared/utils/xlsx-safe.ts — Excel ファイルを読む唯一の入口
//
// なぜこのファイルがあるか
// ------------------------------------------------------------------
// 表計算ファイルの読み取りに使っている xlsx (SheetJS) には既知の脆弱性が 2 つあり、
// **npm 上に修正版が存在しない** (SheetJS は 0.18.5 以降 npm への公開を止め、
// 自社 CDN 配布に移行した。0.19.3 / 0.20.2 で修正済みだが npm からは取得できない)。
//
//   - GHSA-4r6h-8v6p-xvw6  Prototype Pollution (細工したファイルを読むと
//                          Object.prototype に prop を差し込める) — 0.19.3 で修正
//   - GHSA-5pgg-2g8v-p4x9  ReDoS — 0.20.2 で修正
//
// ライブラリを差し替える (exceljs 等) 案は取らなかった: 読み取りは
// 機材台帳の一括取り込み・決算 GL 取り込み・アワードのエントリ取り込みの
// 3 系統で使われており、日付・数値・結合セル・空セルの扱いが 1 つ変わるだけで
// 「今まで入っていた表が入らない」形の事故になる。差し替えは実データで
// 突き合わせる必要があるため、別の版で行う (README「既知の課題」に記載)。
//
// 代わりに**境界で止める**。この 2 つを全ての読み取りに強制する:
//
//  1. 中身を見て表計算ファイルかを判定する (拡張子と Content-Type は名乗りなので
//     信じない)。パーサに届く前に弾くので、細工した任意のバイト列を
//     xlsx のパーサに通す経路自体が無くなる。
//
//  2. 読み取りの前後で Object/Array/Function の prototype の自前キーを比べ、
//     **増えていたら消してファイルを拒否する**。XLSX.read は同期なので
//     Node の単一スレッドでは汚染から掃除までの間に他のリクエストの JS は
//     一切走らない (= 汚染を観測できる隙が無い)。
//
// `scripts/check-forbidden-patterns.mjs` が `XLSX.read(` をこのファイル以外で
// 使えないようにしている (npm run lint で落ちる)。読み取りを足すときは
// ここの safeReadWorkbook を通すこと。
import * as XLSX from 'xlsx';
import { AppError } from '../middleware/errorHandler';

/** 表計算ファイルの先頭バイト。xlsx/xlsm = ZIP、xls (旧バイナリ) = OLE2 複合ドキュメント */
const SIGNATURES: { name: string; bytes: number[] }[] = [
  { name: 'xlsx', bytes: [0x50, 0x4b, 0x03, 0x04] }, // 'PK\x03\x04'
  { name: 'xls', bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] }, // OLE2
];

/** 中身を見て表計算ファイルかを判定する (名乗りは見ない) */
export function detectSpreadsheet(buf: Buffer): 'xlsx' | 'xls' | null {
  for (const sig of SIGNATURES) {
    if (buf.length >= sig.bytes.length && sig.bytes.every((b, i) => buf[i] === b)) {
      return sig.name as 'xlsx' | 'xls';
    }
  }
  return null;
}

const PROTOS: { label: string; obj: object }[] = [
  { label: 'Object', obj: Object.prototype },
  { label: 'Array', obj: Array.prototype },
  { label: 'Function', obj: Function.prototype },
];

const snapshotProtos = (): Set<string>[] =>
  PROTOS.map((p) => new Set(Object.getOwnPropertyNames(p.obj)));

/**
 * 読み取りの前後で prototype に増えたキーを消し、増えていた事実を返す。
 * 消すのは「増えた分」だけなので、正常なファイルでは何もしない。
 */
function cleanupProtos(before: Set<string>[]): string[] {
  const injected: string[] = [];
  PROTOS.forEach((p, i) => {
    for (const key of Object.getOwnPropertyNames(p.obj)) {
      if (before[i].has(key)) continue;
      injected.push(`${p.label}.${key}`);
      try {
        delete (p.obj as Record<string, unknown>)[key];
      } catch {
        /* 消せなくても検知はできているので、下で拒否する */
      }
    }
  });
  return injected;
}

/**
 * fn を挟んで prototype の汚染を検知する。**汚染されたら消してから拒否する。**
 *
 * fn は同期でなければならない。Node は単一スレッドなので、同期の間は
 * 他のリクエストの JS が一切走らない = 汚染してから消すまでの間に
 * 別の処理がそれを観測する隙が無い。非同期にすると隙ができる。
 *
 * 例外時も掃除する (パースが途中で落ちても、そこまでの汚染は残さない)。
 */
export function runGuarded<T>(fn: () => T, onParseError: (err: unknown) => never): T {
  const before = snapshotProtos();
  let out: T;
  try {
    out = fn();
  } catch (err) {
    cleanupProtos(before);
    onParseError(err);
  }

  const injected = cleanupProtos(before);
  if (injected.length > 0) {
    // 汚染は消したうえで拒否する。ログに残すのは「どのキーが差し込まれたか」だけ
    // (ファイルの中身は出さない)。
    console.error(`[xlsx-safe] 拒否: prototype への差し込みを検知 (${injected.join(', ')})`);
    throw new AppError(
      400,
      'BAD_REQUEST',
      'このファイルは安全でない内容を含んでいるため読み込みませんでした。作成元に確認してください',
    );
  }
  return out;
}

/**
 * Excel ファイルを読む。**読み取りは必ずこの関数を通す。**
 *
 * @param buffer  アップロードされたバイト列
 * @param opts    XLSX.read のオプション (type は 'buffer' 固定)。
 *                呼び出し側の既存の読み取り挙動を変えないため、そのまま渡す。
 * @throws AppError(400) 表計算ファイルでない / 細工されている
 */
export function safeReadWorkbook(
  buffer: Buffer,
  opts: Omit<XLSX.ParsingOptions, 'type'> = {},
): XLSX.WorkBook {
  if (!buffer || buffer.length === 0) {
    throw new AppError(400, 'BAD_REQUEST', 'ファイルが空です');
  }
  if (!detectSpreadsheet(buffer)) {
    throw new AppError(
      400,
      'BAD_REQUEST',
      'Excel ファイル (.xlsx / .xls) ではないようです。表計算ソフトで保存したファイルを選んでください',
    );
  }

  return runGuarded(
    () => XLSX.read(buffer, { ...opts, type: 'buffer' }),
    (err) => {
      throw new AppError(
        400,
        'BAD_REQUEST',
        `Excel ファイルを読めませんでした (壊れている可能性があります): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    },
  );
}
