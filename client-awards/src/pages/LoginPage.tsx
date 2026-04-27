import { SubAppLoginRedirect } from '@gmo-onair/shared/src/client/SubAppLoginRedirect';

export default function LoginPage() {
  return (
    <SubAppLoginRedirect
      storageKey="gmo_onair_user"
      appBasePath="/awards/"
      appLabel="表彰CG"
    />
  );
}
