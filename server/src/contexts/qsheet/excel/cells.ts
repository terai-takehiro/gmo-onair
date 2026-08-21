/**
 * ブロック型ごとのセル ↔ Excel フィールド変換（読み・書き 両方向）。実装設計: 03-excel.md §4-3。
 *
 * 実装が持つセルの実際の形（`client-qsheet/src/components/editor/cells/*.tsx` を実測）:
 *   scenario            cell.entries[0] = { name, html, isQWord, image? }
 *   video/audio/telop    cell.entries[0] = { label, memo, image? }
 *   slide                cell = { image? }                       （書き出しのみ）
 *   audio_mic            cell.assignments = [{ ch, person, micType, state }]（マイク香盤シートが正）
 *   led_xr               cell.entries[0] = { sceneId, cueType, cueCustom?, transition, transitionCustom? }
 *   lighting/remarks/item cell = { value }
 *   stage_diagram        cell = { templateId, note }
 */
import { LED_CUE_OPTIONS, LED_TRANSITION_OPTIONS } from './schema';

export interface CellCtx {
  ledSceneNameById: Map<string, string>;
  ledSceneIdByName: Map<string, string>;
  stageTemplateNameById: Map<string, string>;
  stageTemplateIdByName: Map<string, string>;
}

const stripHtml = (s: unknown): string => (typeof s === 'string' ? s.replace(/<[^>]*>/g, '') : '');

// ============================================================
// 読み（書き出し方向）: セル → { field: 表示テキスト }
// ============================================================
export function readBlockFields(type: string, cell: any, ctx: CellCtx): Record<string, string> {
  const c = cell || {};
  switch (type) {
    case 'scenario': {
      const en = (c.entries || [])[0] || {};
      return { speaker: en.name || '', text: stripHtml(en.html), q: en.isQWord ? '○' : '', image: en.image || '' };
    }
    case 'video':
    case 'audio':
    case 'telop': {
      const en = (c.entries || [])[0] || {};
      return { label: en.label || '', memo: en.memo || '', image: en.image || '' };
    }
    case 'slide':
      return { image: c.image || '' };
    case 'audio_mic': {
      const list = (c.assignments || []).filter((a: any) => a.state !== 'off').sort((a: any, b: any) => a.ch - b.ch);
      const summary = list
        .map((a: any) => `Ch${a.ch}:${a.state === 'on' ? 'ON' : 'STBY'}${a.person ? ` ${a.person}` : ''}${a.micType ? `/${a.micType}` : ''}`)
        .join(' / ');
      return { summary };
    }
    case 'led_xr': {
      const en = (c.entries || [])[0] || {};
      const scene = en.sceneId ? ctx.ledSceneNameById.get(en.sceneId) || '' : '';
      const cue = en.cueType === 'custom' ? (en.cueCustom || '') : (en.cueType || '');
      const transition = en.transition === 'custom' ? (en.transitionCustom || '') : (en.transition || '');
      return { scene, cue, transition };
    }
    case 'stage_diagram': {
      const template = c.templateId ? ctx.stageTemplateNameById.get(c.templateId) || '' : '';
      return { template, note: c.note || '' };
    }
    case 'lighting':
    case 'remarks':
    case 'item':
    default:
      return { value: c.value || '' };
  }
}

// ============================================================
// 書き（取込方向）: { field: セルのテキスト（列が無ければキー自体が無い＝変更しない） } → 新しいセル
//   既存セルへ「部分的に」マージする（entries[1] 以降など、Excel が持たない情報を消さない）。
// ============================================================
/**
 * このブロック型として「中身が無い」と言えるか。
 * 行がその型のブロックをそもそも使っていない（列は台本共通で全ブロック分あるが、この行では
 * 空欄のまま）ケースを「新しく空セルを作った」という**見かけ上の差分**にしないために使う
 * （§8-5 冪等性: 使っていない列が空のまま往復しても、同じファイルの再取込で毎回「更新」に
 * 数えられてしまうと、値は壊れなくても差分ノイズと Yjs への無駄な書き込みが積み重なる）。
 */
export function isBlankCell(type: string, cell: any): boolean {
  if (!cell || typeof cell !== 'object') return true;
  switch (type) {
    case 'scenario': {
      const en = (cell.entries || [])[0];
      return !en || (!en.name && !en.html && !en.isQWord);
    }
    case 'video':
    case 'audio':
    case 'telop': {
      const en = (cell.entries || [])[0];
      return !en || (!en.label && !en.memo);
    }
    case 'led_xr': {
      const en = (cell.entries || [])[0];
      return !en || (!en.sceneId && !en.cueType && !en.transition);
    }
    case 'stage_diagram':
      return !cell.templateId && !cell.note;
    case 'lighting':
    case 'remarks':
    case 'item':
      return !cell.value;
    default:
      return true;
  }
}

export function writeBlockFields(
  type: string,
  fields: Record<string, string | undefined>,
  existing: any,
  ctx: CellCtx,
): { cell: any; warnings: string[] } {
  const warnings: string[] = [];
  const c = existing && typeof existing === 'object' ? existing : {};

  const patchEntry0 = (patch: Record<string, unknown>) => {
    const entries = Array.isArray(c.entries) ? [...c.entries] : [];
    entries[0] = { ...(entries[0] || {}), ...patch };
    return { ...c, entries };
  };

  let next: any = c;
  switch (type) {
    case 'scenario': {
      const patch: Record<string, unknown> = {};
      if ('speaker' in fields) patch.name = fields.speaker || '';
      if ('text' in fields) patch.html = fields.text || '';
      if ('q' in fields) patch.isQWord = (fields.q || '').trim() === '○';
      if (Object.keys(patch).length) next = patchEntry0(patch);
      break;
    }
    case 'video':
    case 'audio':
    case 'telop': {
      const patch: Record<string, unknown> = {};
      if ('label' in fields) patch.label = fields.label || '';
      if ('memo' in fields) patch.memo = fields.memo || '';
      if (Object.keys(patch).length) next = patchEntry0(patch);
      break;
    }
    case 'led_xr': {
      const patch: Record<string, unknown> = {};
      if ('scene' in fields) {
        const name = (fields.scene || '').trim();
        if (!name) {
          patch.sceneId = undefined;
        } else {
          const id = ctx.ledSceneIdByName.get(name);
          if (id) patch.sceneId = id;
          else warnings.push(`LEDシーン「${name}」が見つかりません`);
        }
      }
      if ('cue' in fields) {
        const v = (fields.cue || '').trim();
        if (!v) { patch.cueType = undefined; patch.cueCustom = undefined; }
        else if ((LED_CUE_OPTIONS as readonly string[]).includes(v)) { patch.cueType = v; patch.cueCustom = undefined; }
        else { patch.cueType = 'custom'; patch.cueCustom = v; }
      }
      if ('transition' in fields) {
        const v = (fields.transition || '').trim();
        if (!v) { patch.transition = undefined; patch.transitionCustom = undefined; }
        else if ((LED_TRANSITION_OPTIONS as readonly string[]).includes(v)) { patch.transition = v; patch.transitionCustom = undefined; }
        else { patch.transition = 'custom'; patch.transitionCustom = v; }
      }
      if (Object.keys(patch).length) next = patchEntry0(patch);
      break;
    }
    case 'stage_diagram': {
      const patched = { ...c };
      if ('template' in fields) {
        const name = (fields.template || '').trim();
        if (!name) patched.templateId = undefined;
        else {
          const id = ctx.stageTemplateIdByName.get(name);
          if (id) patched.templateId = id;
          else warnings.push(`立ち位置図ひな形「${name}」が見つかりません`);
        }
      }
      if ('note' in fields) patched.note = fields.note || '';
      next = patched;
      break;
    }
    case 'lighting':
    case 'remarks':
    case 'item': {
      if ('value' in fields) next = { ...c, value: fields.value || '' };
      break;
    }
    case 'slide':
    case 'audio_mic':
    default:
      // slide: 画像は Excel から変更できない（往復不可・§4-2）。
      // audio_mic: 実データは「マイク香盤」シートが正（plan.ts が別処理する）。
      break;
  }

  // 元々ブランク・結果もブランクなら「触っていない」ものとして元の参照をそのまま返す
  if (isBlankCell(type, next) && isBlankCell(type, c)) return { cell: c, warnings };
  return { cell: next, warnings };
}
