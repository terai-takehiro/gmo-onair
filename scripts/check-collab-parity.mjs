#!/usr/bin/env node
// 同時共同編集の変換層が「サーバー側コピー」と「shared 側」で乖離していないかを検証する。
//
// なぜ必要か:
//   サーバーは server/src/ の外を import できないため、Y.Doc の構造を決める変換層を
//   server/src/shared/collab/ と shared/src/collab/ に**意図的に複製**している。
//   ここが片方だけ変わると Y.Doc の形が食い違い、**同時編集が静かに壊れる**
//   (例外も出ず、片方の編集が相手に反映されないだけなので気づきにくい)。
//
//   コメントの差 (ヘッダーの注意書き) は許容し、**それ以外の行が 1 行でも違えば
//   exit 1 でビルドを止める** (fail closed)。v2.9.234 の権限ゲート検証と同じ考え方で、
//   「気づけない不整合」を構造的に起こせなくするのが目的。

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

/** [サーバー側, shared 側] の対。増やしたらここに足す */
const PAIRS = [
  ['server/src/shared/collab/yjsDoc.ts', 'shared/src/collab/yjsDoc.ts'],
  ['server/src/shared/collab/projectCollabDoc.ts', 'shared/src/collab/projectCollabDoc.ts'],
  ['server/src/shared/production/miniapps.ts', 'shared/src/production/miniapps.ts'],
];

/** 行コメント・ブロックコメント・空行を落として「実装だけ」を取り出す */
function stripComments(source) {
  const out = [];
  let inBlock = false;
  for (const raw of source.split('\n')) {
    let line = raw;
    if (inBlock) {
      const end = line.indexOf('*/');
      if (end === -1) continue;
      line = line.slice(end + 2);
      inBlock = false;
    }
    // 行内のブロックコメント開始
    for (;;) {
      const start = line.indexOf('/*');
      if (start === -1) break;
      const end = line.indexOf('*/', start + 2);
      if (end === -1) {
        line = line.slice(0, start);
        inBlock = true;
        break;
      }
      line = line.slice(0, start) + line.slice(end + 2);
    }
    // 行コメント (文字列リテラル中の // は本ファイル群に無いので単純処理で足りる)
    const lc = line.indexOf('//');
    if (lc !== -1) line = line.slice(0, lc);
    const trimmed = line.trim();
    if (trimmed) out.push(trimmed);
  }
  return out;
}

let failed = false;
for (const [serverRel, sharedRel] of PAIRS) {
  const a = path.join(root, serverRel);
  const b = path.join(root, sharedRel);
  if (!existsSync(a) || !existsSync(b)) {
    console.error(`[collab-parity] 対のファイルが見つかりません:\n  ${serverRel}\n  ${sharedRel}`);
    failed = true;
    continue;
  }
  const la = stripComments(readFileSync(a, 'utf8'));
  const lb = stripComments(readFileSync(b, 'utf8'));
  if (la.length === lb.length && la.every((l, i) => l === lb[i])) continue;

  failed = true;
  console.error(`\n[collab-parity] ❌ 変換層が乖離しています (Y.Doc の構造が食い違うと同時編集が静かに壊れます)`);
  console.error(`  A: ${serverRel}`);
  console.error(`  B: ${sharedRel}`);
  const max = Math.max(la.length, lb.length);
  let shown = 0;
  for (let i = 0; i < max && shown < 10; i++) {
    if (la[i] !== lb[i]) {
      console.error(`  行 ${i + 1}:`);
      console.error(`    A: ${la[i] ?? '(なし)'}`);
      console.error(`    B: ${lb[i] ?? '(なし)'}`);
      shown++;
    }
  }
  console.error('  → どちらかに合わせて両方を同じ実装にしてください (コメントの差は許容されます)。\n');
}

if (failed) process.exit(1);
console.log(`[collab-parity] OK (${PAIRS.length} 対の変換層が一致)`);
