/**
 * Wiki — zip の中身を「解いた後の大きさ」を見張りながら読む（段D・Codex の指摘・P1）。
 *
 * ⚠️ **multer の 50MB は「圧縮したあとの大きさ」にしか効きません。**
 * zip は同じ文字が続くほどよく縮むので、**数十 MB の zip が解くと数 GB**になる
 * ものを作れます（いわゆる zip 爆弾）。取り込みは中身を文字列・Buffer として
 * いったんメモリに載せるので、上限（ページ数）を見る前にサーバーの山が尽きます。
 *
 * そこで**読みながら**数えて、超えたらその場で止めます。
 *   ・1つあたり  … `MAX_ENTRY_BYTES`
 *   ・zip 全体で … `MAX_TOTAL_BYTES`
 *
 * ⚠️ **zip が申告する大きさ（`uncompressedSize`）だけを信じないこと。**
 * 申告は zip の目次に書いてあるだけで、嘘を書けます。**先に申告で弾き**、
 * そのうえで**実際に流れてきた分を数えながら**読みます（嘘をつかれても、
 * 上限を超えた時点で止まります）。
 */
import type JSZip from 'jszip';
import { ValidationError } from '../../qsheet/services/httpErrors';

/** 1つのファイルの上限（解いたあと）。図面つきの手順書でもこれを超えない */
export const MAX_ENTRY_BYTES = 20 * 1024 * 1024;
/** zip 全体の上限（解いたあと）。書き出し側の上限（画像の合計）と釣り合わせてある */
export const MAX_TOTAL_BYTES = 300 * 1024 * 1024;

const TOO_BIG = '中身が大きすぎます。フォルダを分けてからお試しください。';

/** 解いた大きさを数えながら zip を読む。**1回の取り込みに1つ**作って使い回す */
export class ZipReader {
  private total = 0;

  constructor(private readonly zip: JSZip) {}

  /** いまの合計（報告用） */
  get unpackedBytes(): number {
    return this.total;
  }

  async text(path: string): Promise<string | null> {
    const buf = await this.read(path);
    return buf === null ? null : buf.toString('utf8');
  }

  async buffer(path: string): Promise<Buffer | null> {
    return this.read(path);
  }

  private async read(path: string): Promise<Buffer | null> {
    const entry = this.zip.file(path);
    if (!entry) return null;

    // ① 申告の大きさで先に弾く（解く前に止められる分はここで止める）
    const declared = Number(
      (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize,
    );
    if (Number.isFinite(declared) && declared > 0) {
      this.assertFits(declared);
    }

    // ② 実際に流れてきた分を数えながら読む（申告が嘘でも止まる）
    const chunks: Buffer[] = [];
    let got = 0;
    await new Promise<void>((resolve, reject) => {
      // `nodeStream` は jszip の公開 API（解きながら少しずつ流してくれる）
      const stream = entry.nodeStream('nodebuffer');
      stream.on('data', (chunk: Buffer) => {
        got += chunk.length;
        try {
          this.assertFits(got);
        } catch (e) {
          reject(e);
          return;
        }
        chunks.push(chunk);
      });
      stream.on('error', reject);
      stream.on('end', () => resolve());
      stream.resume();
    });

    this.total += got;
    return Buffer.concat(chunks);
  }

  /** この1つが `size` になったとき、上限を超えるか */
  private assertFits(size: number): void {
    if (size > MAX_ENTRY_BYTES || this.total + size > MAX_TOTAL_BYTES) {
      throw new ValidationError(TOO_BIG);
    }
  }
}
