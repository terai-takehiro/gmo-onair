/**
 * 知らないURLに来たとき。中身は共通部品 (shared/src/client/states/NotFoundPanel)。
 *
 * v3.0.11 まで、このアプリはログイン済みのときの `path="*"` を持っていなかった。
 * その結果**未知のURLで何も描かれず、画面が真っ白になっていた** —
 * 壊れたのか読み込み中なのか区別が付かず、現場では本番中の事故に見える。
 *
 * 全体マップ (`/map`) は別バンドルなので読み込み直して開く。
 */
import { useLocation, useNavigate } from 'react-router-dom';
import { NotFoundPanel } from '@gmo-onair/shared/src/client/states';

export default function NotFoundRoute({ homeLabel }: { homeLabel: string }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <NotFoundPanel
      // basename の外側も含めた実際のURLを出す (利用者が押したものと一致させる)
      path={typeof window !== 'undefined' ? window.location.pathname : pathname}
      onOpenSiteMap={() => { window.location.href = '/map'; }}
      home={{ label: homeLabel, onGo: () => navigate('/') }}
    />
  );
}
