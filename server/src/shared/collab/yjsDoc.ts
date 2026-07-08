// Qシート 同時共同編集 — DocumentData ⇄ Y.Doc 変換層 (サーバー側コピー)
// ⚠️ shared/src/collab/yjsDoc.ts と構造を必ず一致させること (更新バイナリ互換性のため)。
// サーバーは server/src/ 外を import できないため意図的に複製している。
// クライアントとサーバーで **同一の Y.Doc 構造** を使う必要があるため shared に置く
// (更新バイナリの互換性のため)。この層が Yjs 化の要で、往復一致を先に固めてから
// 配線 (プロバイダ・永続化・移行) を載せる。
//
// マッピング方針:
//   ydoc.getMap('meta')      — DocumentMeta のスカラー (フィールド単位 LWW)
//   ydoc.getArray('blocks')  — Block[] (列)
//   ydoc.getMap('masters')   — Masters (persons/video/... の各リスト)
//   ydoc.getArray('sections')— Section[] (構造マージ: ロールの挿入/削除/並び替え)
//     section(Y.Map).get('rows') — Y.Array<Y.Map> (行の構造マージ)
//       row(Y.Map).get('cells')  — Y.Map(blockId -> cell) (セル単位 LWW)
//   ydoc.getMap('extras')    — ledScenes / stageTemplates / sectionTemplates 等の
//                              その他トップレベルキー (往復保全)
//
// すべてのネストを Y 型に深く写像することで、行/ロールの並び替えやセル編集を
// 競合フリーにマージできる (2 人が別の行/セルを同時に触っても衝突しない)。

import * as Y from 'yjs';

export const TOP_KEYS = ['meta', 'blocks', 'masters', 'sections'] as const;

/** 素の JSON 値を (必要なら) Y 型のツリーに変換する。undefined は落とす (Yjs は undefined 不可)。 */
function jsonToY(value: any): any {
  if (Array.isArray(value)) {
    const arr = new Y.Array<any>();
    arr.push(value.filter((v) => v !== undefined).map(jsonToY));
    return arr;
  }
  if (value && typeof value === 'object') {
    const map = new Y.Map<any>();
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      map.set(k, jsonToY(v));
    }
    return map;
  }
  // primitive (string / number / boolean / null)
  return value;
}

/** 素の JSON 値を Y ノード (Y.Map/Y.Array/primitive) へ変換する (粒度操作で新規ノードを差し込む用)。 */
export function toYValue(value: any): any {
  return jsonToY(value);
}

/** Y ノードを素の JSON 値へ戻す。 */
export function fromYValue(value: any): any {
  return yToJson(value);
}

/** Y 型ツリーを素の JSON 値へ戻す。 */
function yToJson(value: any): any {
  if (value instanceof Y.Array) return value.toArray().map(yToJson);
  if (value instanceof Y.Map) {
    const o: Record<string, any> = {};
    value.forEach((v, k) => {
      o[k] = yToJson(v);
    });
    return o;
  }
  return value;
}

/** DocumentData の内容を Y.Doc に (再) 適用する。1 トランザクションで書き込む。 */
export function applyDataToYDoc(ydoc: Y.Doc, data: any): void {
  const d = data || {};
  ydoc.transact(() => {
    const meta = ydoc.getMap('meta');
    meta.clear();
    for (const [k, v] of Object.entries(d.meta || {})) {
      if (v !== undefined) meta.set(k, jsonToY(v));
    }

    const blocks = ydoc.getArray<any>('blocks');
    if (blocks.length) blocks.delete(0, blocks.length);
    blocks.push((d.blocks || []).filter((v: any) => v !== undefined).map(jsonToY));

    const masters = ydoc.getMap('masters');
    masters.clear();
    for (const [k, v] of Object.entries(d.masters || {})) {
      if (v !== undefined) masters.set(k, jsonToY(v));
    }

    const sections = ydoc.getArray<any>('sections');
    if (sections.length) sections.delete(0, sections.length);
    sections.push((d.sections || []).filter((v: any) => v !== undefined).map(jsonToY));

    const extras = ydoc.getMap('extras');
    extras.clear();
    for (const [k, v] of Object.entries(d)) {
      if ((TOP_KEYS as readonly string[]).includes(k)) continue;
      if (v === undefined) continue;
      extras.set(k, jsonToY(v));
    }
  });
}

/** DocumentData から新しい Y.Doc を構築する。 */
export function docToYDoc(data: any): Y.Doc {
  const ydoc = new Y.Doc();
  applyDataToYDoc(ydoc, data);
  return ydoc;
}

/** Y.Doc から DocumentData を読み出す。 */
export function yDocToData(ydoc: Y.Doc): any {
  const data: Record<string, any> = {
    meta: yToJson(ydoc.getMap('meta')),
    blocks: yToJson(ydoc.getArray('blocks')),
    masters: yToJson(ydoc.getMap('masters')),
    sections: yToJson(ydoc.getArray('sections')),
  };
  ydoc.getMap('extras').forEach((v, k) => {
    data[k] = yToJson(v);
  });
  return data;
}

/** DocumentData を Y.Doc の状態更新バイナリ (Uint8Array) にエンコードする (永続化・同期用)。 */
export function docToUpdate(data: any): Uint8Array {
  const ydoc = docToYDoc(data);
  const update = Y.encodeStateAsUpdate(ydoc);
  ydoc.destroy();
  return update;
}

/** 状態更新バイナリから DocumentData を復元する。 */
export function updateToData(update: Uint8Array): any {
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, update);
  const data = yDocToData(ydoc);
  ydoc.destroy();
  return data;
}
