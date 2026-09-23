/**
 * スペース管理の呼び出し（区画 `wiki` の manager・設計 §8）。
 *
 * サーバーは `server/src/contexts/wiki/routes/space-admin.routes.ts`。
 * 道が `/wiki/manage/spaces` なのは、`/wiki/spaces/:key` が `manage` を
 * スペースの key として食べてしまうためです（同ファイルの冒頭）。
 *
 * ⚠️ **URL はここにしか書きません**（`client-wiki/CLAUDE.md`「同じ URL を2つのファイルに持たない」）。
 *
 * ⚠️ 管理の一覧にも**読めるスペースだけ**が返ります（manager でも、入っていない
 * 「メンバーだけ」のスペースは出ない・§8）。system_admin にはすべて返ります。
 */
import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { WikiSpace, WikiSpaceVisibility } from '@gmo-onair/shared/src/wiki/types';
import api from '@/lib/api';
import { wikiKeys } from '@/lib/wikiApi';

export const SPACE_ADMIN_URL = {
  list: '/wiki/manage/spaces',
  one: (id: string) => `/wiki/manage/spaces/${id}`,
  members: (id: string) => `/wiki/manage/spaces/${id}/members`,
  member: (id: string, userId: string) => `/wiki/manage/spaces/${id}/members/${userId}`,
  users: '/wiki/manage/users',
} as const;

export const spaceAdminKeys = {
  all: ['wiki', 'manage', 'spaces'] as const,
  list: () => ['wiki', 'manage', 'spaces', 'list'] as const,
  members: (id: string) => ['wiki', 'manage', 'spaces', 'members', id] as const,
  users: () => ['wiki', 'manage', 'users'] as const,
};

/** 管理の一覧の1行（ふつうの一覧の列 ＋ 下書きを含むページ数） */
export interface AdminSpace extends WikiSpace {
  /** 下書きも含むページの数。**これが 0 のときだけ削除できる** */
  all_page_count: number;
}

export interface SpaceMember {
  user_id: string;
  name: string;
}

export interface CreateSpaceInput {
  key: string;
  name: string;
  description?: string | null;
  visibility: WikiSpaceVisibility;
  owner_user_id?: string | null;
}

export type UpdateSpaceInput = Partial<Omit<CreateSpaceInput, 'key'>> & {
  /** 開いたときの `updated_at`。他の人が先に保存していたら 409（古い閲覧範囲で上書きしない） */
  expected_updated_at?: string;
};

/** `{ success, data }` の包みを外す */
function unwrap<T>(res: { data: { success?: boolean; data: T } }): T {
  return res.data.data;
}

export function useAdminSpaces(enabled: boolean) {
  return useQuery({
    queryKey: spaceAdminKeys.list(),
    enabled,
    queryFn: async ({ signal }) => unwrap<AdminSpace[]>(await api.get(SPACE_ADMIN_URL.list, { signal })),
  });
}

export function useSpaceMembers(spaceId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: spaceAdminKeys.members(spaceId ?? ''),
    enabled: enabled && !!spaceId,
    queryFn: async ({ signal }) =>
      unwrap<SpaceMember[]>(await api.get(SPACE_ADMIN_URL.members(spaceId!), { signal })),
  });
}

/**
 * 担当・メンバーに選べる人（**Wiki を使える人だけ・全員**）。
 *
 * ⚠️ 全体の利用者一覧（`useOnairUsers`）は使いません。あちらは1回で100人までで、
 * しかも Wiki の権限が無い人も並ぶため、選べない人を選べて・選べる人が出ない、の
 * 両方が起きていました（#740 の Codex 指摘・P2 ×2）。
 */
export function useAssignableUsers(enabled: boolean) {
  return useQuery({
    queryKey: spaceAdminKeys.users(),
    enabled,
    queryFn: async ({ signal }) => unwrap<{ id: string; name: string }[]>(await api.get(SPACE_ADMIN_URL.users, { signal })),
    staleTime: 5 * 60_000,
  });
}

export async function createSpace(input: CreateSpaceInput): Promise<AdminSpace> {
  return unwrap<AdminSpace>(await api.post(SPACE_ADMIN_URL.list, input));
}

export async function updateSpace(id: string, input: UpdateSpaceInput): Promise<AdminSpace> {
  return unwrap<AdminSpace>(await api.patch(SPACE_ADMIN_URL.one(id), input));
}

export async function deleteSpace(id: string): Promise<void> {
  await api.delete(SPACE_ADMIN_URL.one(id));
}

export async function addSpaceMember(id: string, userId: string): Promise<SpaceMember[]> {
  return unwrap<SpaceMember[]>(await api.put(SPACE_ADMIN_URL.member(id, userId)));
}

export async function removeSpaceMember(id: string, userId: string): Promise<SpaceMember[]> {
  return unwrap<SpaceMember[]>(await api.delete(SPACE_ADMIN_URL.member(id, userId)));
}

/**
 * 書いたあとに読み直すもの。
 *
 * ⚠️ **ふつうの一覧（ホームのタイル・左のツリー・検索の絞り込み）も古くします。**
 * 管理の一覧だけ読み直すと、名前や閲覧範囲を変えたのに他の画面が前のまま残ります。
 */
export function useSpaceAdminRefresh() {
  const qc = useQueryClient();
  return useMemo(() => ({
    all() {
      void qc.invalidateQueries({ queryKey: spaceAdminKeys.all });
      void qc.invalidateQueries({ queryKey: wikiKeys.spaces() });
      void qc.invalidateQueries({ queryKey: wikiKeys.home() });
    },
  }), [qc]);
}

/** 閲覧範囲の言葉（画面に出すのはこの2つだけ） */
export const VISIBILITY_LABEL: Record<WikiSpaceVisibility, string> = {
  all: '全員',
  members: 'メンバーだけ',
};

export const VISIBILITY_NOTE: Record<WikiSpaceVisibility, string> = {
  all: 'Wiki を使える人なら誰でも読めます',
  members: 'メンバーに加えた人だけが読めます。それ以外の人には、検索にも AI の回答にも出ません',
};
