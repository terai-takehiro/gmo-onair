// v2.8.76+: cue.moduleKey ↔ ModuleDef.id の相互変換ヘルパ。
//
// 設計:
//  ・cue.moduleKey (DB awards_oneshot_cue_state.module_key) は preset 互換のため
//    短キー 'title' / 'respect' / ... を保持。custom モジュールは 'custom-{uuid}'。
//  ・ModuleDef.id は presetModules.ts で 'preset:title' / 'preset:respect' / ...
//    形式。custom 追加は 'custom-{uuid}' (= cue.moduleKey と同じ)。
//  ・両者の変換は本ファイルのヘルパで集中管理。

import type { ModuleDef, EventModuleConfig } from '../types';

/** ModuleDef.id → cue.moduleKey */
export function moduleIdToCueKey(modId: string): string {
  if (modId.startsWith('preset:')) return modId.slice('preset:'.length);
  return modId;
}

/** cue.moduleKey → ModuleDef.id (preset の場合は 'preset:' 接頭辞を補う) */
export function cueKeyToModuleId(cueKey: string): string {
  if (cueKey.startsWith('custom-')) return cueKey;
  return 'preset:' + cueKey;
}

/** EventModuleConfig から cue.moduleKey にマッチする ModuleDef を解決。
 *  preset 短キー / 完全 ID どちらでも引ける。 */
export function findModuleByCueKey(
  config: EventModuleConfig | null,
  cueKey: string,
): ModuleDef | null {
  if (!config) return null;
  const targetId = cueKeyToModuleId(cueKey);
  return (
    config.modules.find((m) => m.id === targetId) ??
    config.modules.find((m) => m.id === cueKey) ??
    null
  );
}
