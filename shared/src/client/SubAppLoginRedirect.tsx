/**
 * shared/src/client/SubAppLoginRedirect.tsx
 *
 * サブアプリ (qsheet/equipment/liveops/awards) の /<app>/login で表示する
 * "redirect-only" ページ。
 *
 * v2.5.2: dev でも本番でも email/password 認証 (メインアプリ) に統一されたため、
 * サブアプリは独自のログイン UI を持たない。
 *
 *   - 既にログイン済み (localStorage に user あり)            → /<app>/ へ即遷移
 *   - 未ログイン                                                  → /login?redirect=/<app>/ へ遷移
 *
 * いずれも window.location.replace で hard navigation。replaceState は使わない。
 */
import { useEffect, useRef } from 'react';
import { useUiStore } from './uiStore';

export interface SubAppLoginRedirectProps {
  /** localStorage キー (gmo_onair_user) */
  storageKey: string;
  /** ログイン後の戻り先 + 既ログイン時のホーム遷移先 (例: '/live/', '/awards/') */
  appBasePath: string;
  /** 表示用のアプリ名 (例: '計時LIVE') */
  appLabel: string;
}

function hasStoredUser(storageKey: string): boolean {
  try {
    return !!localStorage.getItem(storageKey);
  } catch {
    return false;
  }
}

export function SubAppLoginRedirect({ storageKey, appBasePath, appLabel }: SubAppLoginRedirectProps) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    if (hasStoredUser(storageKey)) {
      // 既ログイン: アプリのトップへ
      window.location.replace(appBasePath);
    } else {
      // 未ログイン: メインアプリのログインへ (戻り先パラメータ付き)
      // currentUserId Zustand も念のためクリア
      try { useUiStore.getState().setCurrentUserId(null); } catch { /* ignore */ }
      const redirect = encodeURIComponent(appBasePath);
      window.location.replace(`/login?redirect=${redirect}`);
    }
    // 一度だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center">
      <p className="text-sm text-muted-foreground">
        {appLabel} は GMO ONAiR のメインアプリの認証情報を共有しています。
      </p>
      <p className="text-xs text-muted-foreground">
        ログインページに移動しています…
      </p>
    </div>
  );
}
