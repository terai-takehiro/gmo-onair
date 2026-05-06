import type { EventModuleConfig, ModuleDef } from '../types';

// ── 段階1 (v2.8.71): 動的モジュールスキーマの種データ ──────────
// 現行ハードコード版 (modules/{Title,Respect,Skills,Comment,Members,RecComment}Module.tsx)
// + 'none' を ModuleDef[] として 1:1 で書き起こしたもの。
// 段階2 で DynamicModule renderer がこの定義から JSX を生成する。
//
// 各 ModuleDef.id は 'preset:{key}' 形式。ユーザーが追加するモジュールは
// 'custom-{uuid}' 形式 (段階4 の編集 UI が UUID を発行)。
// プリセットも段階4 で複製・編集・削除が可能になる。

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

const COMMENT: ModuleDef = {
  id: 'preset:comment',
  label: { ja: '本人コメント', en: 'Comment' },
  icon: 'MessageSquare',
  shortcutKey: '4',
  order: 4,
  visibility: 'always',
  width: 'wide',
  slots: [
    {
      id: 'comment-label',
      kind: 'header-label',
      binding: { source: 'literal', ja: 'ノミネート者コメント', en: 'Nominee Comment' },
    },
    {
      id: 'comment-body',
      kind: 'body-text',
      binding: { source: 'nominee', field: 'comment' },
    },
  ],
};

const MEMBERS: ModuleDef = {
  id: 'preset:members',
  label: { ja: 'チームメンバー', en: 'Team' },
  icon: 'Users',
  shortcutKey: '5',
  order: 5,
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

const REC_COMMENT: ModuleDef = {
  id: 'preset:recComment',
  label: { ja: '推薦コメント', en: 'Recommendation' },
  icon: 'MessageCircle',
  shortcutKey: '6',
  order: 6,
  visibility: 'always',
  width: 'wide',
  slots: [
    {
      id: 'rec-label',
      kind: 'header-label',
      binding: { source: 'literal', ja: '推薦者コメント', en: 'From the Recommender' },
    },
    {
      id: 'rec-byline',
      kind: 'header-byline',
      binding: { source: 'recommender', field: 'name' },
    },
    {
      id: 'rec-quote',
      kind: 'body-rec-quote',
      binding: { source: 'recommender', field: 'respectComment' },
    },
  ],
};

/** 既存 6 モジュール + 'none' のプリセット定義 (段階1 では参照のみ) */
export const DEFAULT_PRESET_MODULES: ModuleDef[] = [
  NONE, TITLE, RESPECT, SKILLS, COMMENT, MEMBERS, REC_COMMENT,
];

/** 新規イベントの初期 EventModuleConfig (現行 7 プリセットをそのまま含む) */
export function createDefaultEventModuleConfig(): EventModuleConfig {
  // immutable な深いコピーを返す (呼び出し側が改変しても種データに影響しないように)
  return JSON.parse(JSON.stringify({
    version: 1 as const,
    modules: DEFAULT_PRESET_MODULES,
  })) as EventModuleConfig;
}
