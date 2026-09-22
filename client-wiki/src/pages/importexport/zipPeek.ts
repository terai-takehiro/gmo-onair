/**
 * 選んだ zip の中身を**開く前に数える**（`/wiki/transfer` の取り込み）
 *
 * 取り込みは**元に戻せません**（設計 §5-2 の約束3-3・サーバーの `wiki-import.service.ts` は
 * 途中で失敗してもそこまでが入ったまま止まります）。だから確認のダイアログに
 * 「何件が入るか」を書く必要があり、そのためにファイルの一覧だけを先に読みます。
 *
 * ⚠️ **中身は展開しません。** zip の末尾にある「目次」（central directory）は
 *    圧縮されていないので、名前と件数だけならここを読むだけで分かります。
 *    50MB の zip をまるごとブラウザのメモリに載せずに済みます。
 *
 * ⚠️ **数えるのは目安です。** サーバーの取り込み（`buildImportPlan`）は
 *    `フォルダ＋同じ名前の .md` を1枚にまとめたり、Notion の CSV を
 *    データベース1つにしたりするので、作られるページ数と1件ずつ一致するとは限りません。
 *    画面でも「Markdown ファイル N 件」と数えたものの名前で書きます。
 *
 * ⚠️ **読めない形もあります**（zip64・目次が壊れている）。そのときは
 *    `readable: false` を返し、画面は件数を伏せて「中身を数えられませんでした」と出します。
 *    **取り込み自体は止めません** — 読めるかどうかを決めるのはサーバーです。
 */

/** 末尾の「目次の終わり」の印（End of central directory） */
const EOCD_SIGNATURE = 0x06054b50;
/** 目次の1件ぶんの印（Central directory file header） */
const ENTRY_SIGNATURE = 0x02014b50;
/** zip の末尾に付けられるコメントの最大長。EOCD はこれ＋22 バイトの中にある */
const MAX_COMMENT_BYTES = 0xffff;
/** 16bit・32bit に収まらない値の印。これが立っていたら zip64（読まない） */
const U16_MAX = 0xffff;
const U32_MAX = 0xffffffff;

export interface ZipPeek {
  /** 目次を読めたか。false のときは件数が全部 0（数えられなかった） */
  readable: boolean;
  /** `.md` の数（根の `README.md` は書き出しが付ける案内なので数えない） */
  markdown: number;
  /** データベースになりうる `.csv` の数（`_index.csv` は行の `.md` が正なので数えない） */
  csv: number;
  /** フォルダを除いたファイルの数（画像なども含む） */
  files: number;
}

const EMPTY: ZipPeek = { readable: false, markdown: 0, csv: 0, files: 0 };

function baseName(path: string): string {
  const at = path.lastIndexOf('/');
  return at === -1 ? path : path.slice(at + 1);
}

/** 目次（central directory）から、入っているファイルの名前を並べる */
function namesOf(dir: DataView, count: number): string[] {
  const decoder = new TextDecoder('utf-8');
  const names: string[] = [];
  let at = 0;
  for (let i = 0; i < count; i += 1) {
    if (at + 46 > dir.byteLength) break;
    if (dir.getUint32(at, true) !== ENTRY_SIGNATURE) break;
    const nameLen = dir.getUint16(at + 28, true);
    const extraLen = dir.getUint16(at + 30, true);
    const commentLen = dir.getUint16(at + 32, true);
    const nameAt = at + 46;
    if (nameAt + nameLen > dir.byteLength) break;
    names.push(decoder.decode(new Uint8Array(dir.buffer, dir.byteOffset + nameAt, nameLen)));
    at = nameAt + nameLen + extraLen + commentLen;
  }
  return names;
}

/** 名前の一覧を、サーバーの取り込みと同じ見落とし方で数える */
function count(names: string[]): ZipPeek {
  const peek: ZipPeek = { readable: true, markdown: 0, csv: 0, files: 0 };
  for (const name of names) {
    // フォルダそのもの・macOS が付ける付属品は取り込まれない（サーバーも同じ）
    if (name.endsWith('/')) continue;
    if (name.startsWith('__MACOSX/')) continue;
    const base = baseName(name);
    if (base === '.DS_Store') continue;
    peek.files += 1;
    // 根の README.md は ONAiR の書き出しが必ず置くもの（取り込み側も飛ばす）
    if (name === 'README.md') continue;
    if (base.toLowerCase().endsWith('.md')) peek.markdown += 1;
    else if (base !== '_index.csv' && base.toLowerCase().endsWith('.csv')) peek.csv += 1;
  }
  return peek;
}

/**
 * zip の中のファイルを数える。**開かない・展開しない。**
 * 読めない形のときは `readable: false`（件数は 0）を返し、例外は投げません。
 */
export async function peekZip(file: Blob): Promise<ZipPeek> {
  try {
    const tailBytes = Math.min(file.size, MAX_COMMENT_BYTES + 22);
    const tail = new DataView(await file.slice(file.size - tailBytes).arrayBuffer());

    // EOCD は末尾寄りにある（後ろから探す。コメントの中に同じ並びがあっても、
    // 後ろから見つけたほうが本物に近い）
    let eocd = -1;
    for (let i = tail.byteLength - 22; i >= 0; i -= 1) {
      if (tail.getUint32(i, true) === EOCD_SIGNATURE) { eocd = i; break; }
    }
    if (eocd === -1) return EMPTY;

    const entries = tail.getUint16(eocd + 10, true);
    const dirBytes = tail.getUint32(eocd + 12, true);
    const dirAt = tail.getUint32(eocd + 16, true);
    // zip64（4GB 超・65535 件超）は並びが別。数えずに「読めなかった」にする
    if (entries === U16_MAX || dirBytes === U32_MAX || dirAt === U32_MAX) return EMPTY;
    if (dirBytes === 0 || dirAt + dirBytes > file.size) return EMPTY;

    const dir = new DataView(await file.slice(dirAt, dirAt + dirBytes).arrayBuffer());
    return count(namesOf(dir, entries));
  } catch {
    // 読めなくても取り込みは止めない（読めるかどうかを決めるのはサーバー）
    return EMPTY;
  }
}
