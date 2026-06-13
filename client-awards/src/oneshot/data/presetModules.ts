import type { EventModuleConfig, ModuleDef } from '../types';

// 動的モジュールスキーマの種データ。
// DynamicModule renderer がこの定義から JSX を生成する。
//
// 各 ModuleDef.id は 'preset:{key}' 形式。ユーザーが追加するモジュールは
// 'custom-{uuid}' 形式 (編集 UI が UUID を発行)。
// プリセットも編集 UI で複製・編集・削除が可能。

const NONE: ModuleDef = {
  id: 'preset:none',
  label: { ja: '（情報なし）', en: '(empty)' },
  icon: 'CircleSlash',
  shortcutKey: '0',
  order: 0,
  visibility: 'always',
  slots: [],
};

const TITLE: ModuleDef = {
  id: 'preset:title',
  label: { ja: 'ノミネートタイトル', en: 'Title' },
  icon: 'FileText',
  shortcutKey: '1',
  order: 1,
  visibility: 'always',
  slots: [
    {
      id: 'title-label',
      kind: 'header-label',
      binding: { source: 'literal', ja: 'ノミネートタイトル', en: 'Nomination' },
    },
    {
      id: 'title-body',
      kind: 'body-title',
      binding: { source: 'nominee', field: 'title' },
    },
  ],
};

const RESPECT: ModuleDef = {
  id: 'preset:respect',
  label: { ja: '尊敬ポイント', en: 'Respect' },
  icon: 'Quote',
  shortcutKey: '2',
  order: 2,
  visibility: 'always',
  slots: [
    {
      id: 'respect-label',
      kind: 'header-label',
      binding: { source: 'literal', ja: '推薦者の尊敬ポイント', en: 'Why we respect' },
    },
    {
      id: 'respect-byline',
      kind: 'header-byline',
      binding: { source: 'recommender', field: 'name' },
    },
    {
      id: 'respect-quote',
      kind: 'body-large-quote',
      binding: { source: 'recommender', field: 'respect' },
    },
  ],
};

const SKILLS: ModuleDef = {
  id: 'preset:skills',
  label: { ja: '私の得意技', en: 'Strengths' },
  icon: 'Award',
  shortcutKey: '3',
  order: 3,
  visibility: 'always',
  slots: [
    {
      id: 'skills-label',
      kind: 'header-label',
      binding: { source: 'literal', ja: '私の得意技 / イズム', en: 'My Strengths' },
    },
    {
      id: 'skills-ism',
      kind: 'body-ism-text',
      binding: { source: 'nominee', field: 'ism' },
    },
    {
      id: 'skills-tags',
      kind: 'body-tags',
      binding: { source: 'nominee', field: 'skills' },
    },
  ],
};

const MEMBERS: ModuleDef = {
  id: 'preset:members',
  label: { ja: 'チームメンバー', en: 'Team' },
  icon: 'Users',
  shortcutKey: '4',
  order: 4,
  visibility: 'team-only',
  slots: [
    {
      id: 'members-label',
      kind: 'header-label',
      binding: { source: 'literal', ja: 'チームメンバー', en: 'Team Members' },
    },
    {
      id: 'members-grid',
      kind: 'body-members-grid',
      binding: { source: 'nominee', field: 'members' },
    },
  ],
};

/** プリセット定義 (情報なし / タイトル / 尊敬ポイント / 得意技 / チームメンバー) */
export const DEFAULT_PRESET_MODULES: ModuleDef[] = [
  NONE, TITLE, RESPECT, SKILLS, MEMBERS,
];

/** 新規イベントの初期 EventModuleConfig */
export function createDefaultEventModuleConfig(): EventModuleConfig {
  // immutable な深いコピーを返す (呼び出し側が改変しても種データに影響しないように)
  return JSON.parse(JSON.stringify({
    version: 1 as const,
    modules: DEFAULT_PRESET_MODULES,
  })) as EventModuleConfig;
}
