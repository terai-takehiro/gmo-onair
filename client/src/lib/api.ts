/**
 * v2.4.0 — 他 5 アプリと同じ `createApi` ベースに統一。
 * 401 時は `gmo_onair_user` を削除して `/login` にハード遷移する
 * (createApi の挙動)。SSO 統一が完全に揃う。
 */
import { createApi } from "@gmo-onair/shared/src/client/createApi";

const api = createApi({
  storageKey: "gmo_onair_user",
  loginPath: "/login",
});

export default api;
