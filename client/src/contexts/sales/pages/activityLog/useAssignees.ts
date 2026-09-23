/**
 * 担当者の絞り込みに使う人の一覧 (v4・PR #727 の宿題②)
 *
 * ── 鍵を `['users-list']` にしている理由 ─────────────────────
 *
 * 同じ鍵を `SgaListPage.tsx`・`projectNew/useNewProjectForm.ts` が
 * **同じ問い合わせ（`GET /users?limit=200`・返りは `{ data, pagination }`）**で持っています。
 * 鍵と中身を揃えておけば、他の画面で読んだ一覧をそのまま使え、二重に取りません。
 *
 * ⚠️ **`GET /auth/users` は使わない。** あちらは開発用のログイン一覧で、
 * `AUTH_MODE=password`（本番・検証）では 400 `NOT_AVAILABLE` を返します
 * （`platform/routes/auth.routes.ts`）。同じ鍵で別の口を叩くと、先に開いた画面次第で
 * 中身が変わる罠にもなります（`finance/pages/ledger/usePurchaseDialogData.ts` の注記と同じ）。
 *
 * ⚠️ `GET /users` は1ページ100人で切れます（`extractPagination`）。100人を超えたら
 * 101人目以降が選択肢に出ません — そのときは `fetchAllUsers`
 * （`usePurchaseDialogData.ts`）の形へ寄せ、鍵も分けること。
 */
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { AssigneeUser } from './logParams';

/** 役割（`role`）は営業評価タブの `staffUsers` が読むので、型に残しておく */
export interface UserListRow extends AssigneeUser {
  role: string;
  /** `active` / `invited` / `inactive` など。`/auth/users` と違い、有効でない人も返る */
  status?: string;
}

export const USERS_LIST_KEY = ['users-list'] as const;

export function useUsersList(enabled: boolean) {
  return useQuery<{ data: UserListRow[] }>({
    queryKey: USERS_LIST_KEY,
    queryFn: async () => (await api.get('/users?limit=200')).data,
    enabled,
    // 人の一覧は分単位では変わらない。タブを行き来するたびに取り直さない
    staleTime: 5 * 60_000,
  });
}
