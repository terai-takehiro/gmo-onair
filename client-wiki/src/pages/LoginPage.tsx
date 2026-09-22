import { SubAppLoginRedirect } from '@gmo-onair/shared/src/client/SubAppLoginRedirect';

/**
 * Wiki は独自のログイン UI を持たない。
 * メインアプリの /login (email/password) に統一された認証フローへリダイレクトする。
 */
export default function LoginPage() {
  return (
    <SubAppLoginRedirect
      storageKey="gmo_onair_user"
      appBasePath="/wiki/"
      appLabel="Wiki"
    />
  );
}
