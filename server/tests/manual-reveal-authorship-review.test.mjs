import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

// 運営マニュアル — 外部レビュー再指摘（P2）: enforceRevealAuthorship() が「reveal が
// ある全ブロックへ無条件で by=いま保存している本人」を書いていた。キャンバスは毎回ページ
// 全体（触っていない他のブロックも含む）を送るため、editor A が秘密を解除した直後に
// editor B が別のブロックを動かしただけでも、Aの reveal.by が B に書き換わって
// しまい（at はAのまま）、監査証跡（§7-2）が誰の操作かを取り違える。
// `reveal.fields` が前回と同じなら既存の reveal をそのまま保ち、新規/変更のときだけ
// server が by/at を付け直すことを固定する。

async function load() {
  return loadTs('server/src/contexts/qsheet/services/manual-reveal-authorship.service.ts', {});
}

function linkedBlock(id, reveal) {
  return {
    id, kind: 'linked', x: 0, y: 0, w: 10, h: 10, z: 1, style: {},
    link: { block: 'streaming.list', sourceId: null, options: {}, frozen: null, ...(reveal ? { reveal } : {}) },
  };
}

test('enforceRevealAuthorship: reveal.fields が前回と同じなら、他人の操作でも by/at を保つ', async () => {
  const { enforceRevealAuthorship } = await load();
  const existingBlocks = [
    linkedBlock('blk-1', { by: 'editor-A', at: '2026-09-01T09:00:00.000Z', fields: ['streamKey'] }),
    linkedBlock('blk-2'), // editor B がいま動かしただけの、別の（reveal 無し）ブロック
  ];
  // editor B の保存: blk-1 の reveal はそのまま同じ内容で再送されてくる（クライアントは
  // ページ全体を毎回送る）。blk-1 の位置だけ動かした想定
  const incoming = [
    { ...existingBlocks[0], x: 20 },
    { ...existingBlocks[1], x: 5 },
  ];

  const result = enforceRevealAuthorship(incoming, existingBlocks, 'editor-B');

  assert.deepEqual(result[0].link.reveal, { by: 'editor-A', at: '2026-09-01T09:00:00.000Z', fields: ['streamKey'] }, '中身が同じ解除は監査証跡を書き換えない');
});

test('enforceRevealAuthorship: fields が変わった（新たに解除した項目が増えた）ときは、いまの本人・いまの時刻で付け直す', async () => {
  const { enforceRevealAuthorship } = await load();
  const existingBlocks = [linkedBlock('blk-1', { by: 'editor-A', at: '2026-09-01T09:00:00.000Z', fields: ['streamKey'] })];
  const incoming = [linkedBlock('blk-1', { by: 'editor-A', at: '2026-09-01T09:00:00.000Z', fields: ['streamKey', 'passcode'] })];

  const result = enforceRevealAuthorship(incoming, existingBlocks, 'editor-B');

  assert.equal(result[0].link.reveal.by, 'editor-B');
  assert.notEqual(result[0].link.reveal.at, '2026-09-01T09:00:00.000Z');
  assert.deepEqual(result[0].link.reveal.fields, ['streamKey', 'passcode']);
});

test('enforceRevealAuthorship: 新規に解除したブロックは、devtoolsで詐称した by を無視して本人で付け直す', async () => {
  const { enforceRevealAuthorship } = await load();
  const incoming = [linkedBlock('blk-1', { by: 'someone-else', at: '2000-01-01T00:00:00.000Z', fields: ['streamKey'] })];

  const result = enforceRevealAuthorship(incoming, [], 'editor-B');

  assert.equal(result[0].link.reveal.by, 'editor-B');
  assert.notEqual(result[0].link.reveal.at, '2000-01-01T00:00:00.000Z');
});

test('enforceRevealAuthorship: reveal を持たないブロック・free ブロックはそのまま', async () => {
  const { enforceRevealAuthorship } = await load();
  const free = { id: 'f1', kind: 'free', x: 0, y: 0, w: 1, h: 1, z: 1, style: {}, free: { type: 'text', content: { text: 'hi' } } };
  const linkedNoReveal = linkedBlock('blk-2');

  const result = enforceRevealAuthorship([free, linkedNoReveal], [], 'editor-B');

  assert.deepEqual(result[0], free);
  assert.deepEqual(result[1], linkedNoReveal);
});
