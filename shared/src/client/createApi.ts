// shared/src/client/createApi.ts — Factory for per-app axios instance
import axios from 'axios';
import { useUiStore } from './uiStore';

interface ApiConfig {
  /** localStorage key for user data, e.g. 'qs_user', 'ts_user' */
  storageKey: string;
  /** Login redirect path, e.g. '/qsheet/login' */
  loginPath: string;
}

export function createApi(config: ApiConfig) {
  const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api/v1/internal',
    withCredentials: true,
    headers: { 'Content-Type': 'application/json' },
  });

  api.interceptors.request.use((reqConfig) => {
    /**
     * ── ファイルを送るときは JSON の Content-Type を外す（最重要）──────
     *
     * この instance は `headers: { 'Content-Type': 'application/json' }` を
     * **全リクエストに固定**しています。axios 1.x は
     * **中身が FormData でも Content-Type が JSON なら `formDataToJSON()` で
     * 素の JSON に変換して送ります**（`axios/dist/…` の transformRequest）。
     * `File` は列挙できるプロパティを持たないので、
     * **`{"audio":{}}` になってファイルが丸ごと消えます**。
     *
     * 実際に踏んでいました:
     *   ・打合せを録音（`/projects/:id/minutes`）… **録音が投げられていなかった**
     *   ・BOX にファイルを置く（`/projects/:id/box-files`）
     *   ・トップの投入口の添付・録音
     * どれも「押しても何も起きない / 400 が返る」形で、**理由が画面に出ません**でした。
     * 動いていたのは、呼び出し側が `multipart/form-data` を**手で書いていた**
     * 3 か所（Excel 取込・精算PDF・表彰の写真）だけです。
     *
     * ここで外すと、あとは **axios の XHR アダプタが境界文字列つきの
     * `multipart/form-data` をブラウザに任せて付けます**。
     * 呼び出し側が手で書いている 3 か所も同じ道を通るので壊れません。
     *
     * ⚠️ **呼び出し側で直して回らないこと。** 296 か所ある書き込みのうち
     * どれがファイルを送るかは増えていくので、**入口で 1 回**外します。
     */
    if (typeof FormData !== 'undefined' && reqConfig.data instanceof FormData) {
      // `headers` は AxiosHeaders なので delete が効く（大文字小文字も見てくれる）
      reqConfig.headers.delete?.('Content-Type');
      delete (reqConfig.headers as unknown as Record<string, unknown>)['Content-Type'];
    }

    const token = localStorage.getItem('gmo_onair_token');
    // "undefined"/"null"文字列はlocalStorage汚染なので無視してCookieにフォールバック
    if (token && token !== 'undefined' && token !== 'null') {
      reqConfig.headers['Authorization'] = `Bearer ${token}`;
    }
    const userId = useUiStore.getState().currentUserId;
    if (userId) {
      reqConfig.headers['x-user-id'] = userId;
    }
    return reqConfig;
  });

  api.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        useUiStore.getState().setCurrentUserId(null);
        localStorage.removeItem(config.storageKey);
        // Don't redirect if already on login page (prevents infinite loop)
        if (!window.location.pathname.endsWith('/login')) {
          window.location.href = config.loginPath;
        }
      }
      return Promise.reject(error);
    },
  );

  return api;
}
