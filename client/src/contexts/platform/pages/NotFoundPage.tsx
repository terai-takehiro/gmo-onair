/**
 * NotFoundPage — 知らないURLに来たとき (v3.1.0)
 *
 * v3.0.11 まで `path="*"` は `<Navigate to="/" replace />` だった。
 * つまり**壊れたリンクを押しても黙って「今日」に戻る**。押した人からは
 * 「このボタンは効かない」としか見えず、報告も上がりにくい
 * (実際に「案件の機材ボタン」と「今日のすべて見る」がこの形で死んでいて、
 *  どちらも長く残っていた)。
 *
 * 中身は共通部品。現場アプリ (計時LIVE・CG・日々の事務) も同じものを出すので、
 * 「アプリによって未知URLの扱いが違う」状態をここで終わらせる。
 */
import { useLocation, useNavigate } from "react-router-dom";
import { NotFoundPanel } from "@gmo-onair/shared/src/client/states";

export default function NotFoundPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <NotFoundPanel
      path={pathname}
      onOpenSiteMap={() => navigate("/map")}
      home={{ label: "今日にもどる", onGo: () => navigate("/today") }}
    />
  );
}
