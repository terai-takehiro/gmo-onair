import type { ReactNode } from 'react';
import type { Lang, ModuleKey, Nominee } from '../types';
import TitleModule from './TitleModule';
import RespectModule from './RespectModule';
import SkillsModule from './SkillsModule';
import CommentModule from './CommentModule';
import MembersModule from './MembersModule';
import RecCommentModule from './RecCommentModule';

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  keyHint: string;
  render: () => ReactNode;
}

export type ModuleMap = Partial<Record<ModuleKey, ModuleDef>>;

export function getModules(n: Nominee, lang: Lang): ModuleMap {
  const isJa = lang === 'ja';
  const isTeam = n.type === 'team';

  const modules: ModuleMap = {
    title: {
      key: 'title',
      label: isJa ? 'ノミネートタイトル' : 'Title',
      keyHint: '1',
      render: () => <TitleModule n={n} lang={lang} />,
    },
    respect: {
      key: 'respect',
      label: isJa ? '尊敬ポイント' : 'Respect',
      keyHint: '2',
      render: () => <RespectModule n={n} lang={lang} />,
    },
    skills: {
      key: 'skills',
      label: isJa ? '私の得意技' : 'Strengths',
      keyHint: '3',
      render: () => <SkillsModule n={n} lang={lang} />,
    },
    comment: {
      key: 'comment',
      label: isJa ? '本人コメント' : 'Comment',
      keyHint: '4',
      render: () => <CommentModule n={n} lang={lang} />,
    },
    ...(isTeam
      ? {
          members: {
            key: 'members' as const,
            label: isJa ? 'チームメンバー' : 'Team',
            keyHint: '5',
            render: () => <MembersModule n={n} lang={lang} />,
          },
        }
      : {}),
    recComment: {
      key: 'recComment',
      label: isJa ? '推薦コメント' : 'Recommendation',
      keyHint: '6',
      render: () => <RecCommentModule n={n} lang={lang} />,
    },
    none: {
      key: 'none',
      label: isJa ? '（情報なし）' : '(empty)',
      keyHint: '0',
      render: () => null,
    },
  };

  return modules;
}
