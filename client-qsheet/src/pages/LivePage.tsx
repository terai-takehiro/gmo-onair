/**
 * LivePage — Qシート 本番 (§4.13 / デザイン 16b)
 *
 * OnAir・ランダウン・プロンプター・音声サポートは**同じ本番の役割切替**にする。
 * `/qsheet/live/:id?role=onair|rundown|prompter|audio` の1入口にまとめ、
 * 中身は既存の各画面をそのまま出す (本番中に使う画面なので作り替えない)。
 *
 * 配布は「役割ごとに別のURLを教える」のではなく、この1本 + `?role=` で配れる。
 * **音声サポートの公開URL (`/qsheet/audio/:id`) は認証なしのまま維持する** —
 * 外部の音声さんに渡すための経路で、壊してはいけないもの (§5.1)。
 */
import { useParams, useSearchParams } from "react-router-dom";
import OnAirPage from "./OnAirPage";
import RundownPage from "./RundownPage";
import PrompterPage from "./PrompterPage";
import AudioSupportPage from "./AudioSupportPage";

const ROLES = ["onair", "rundown", "prompter", "audio"] as const;
export type LiveRole = (typeof ROLES)[number];

export default function LivePage() {
  const { id } = useParams<{ id: string }>();
  const [sp] = useSearchParams();
  const role = (ROLES.includes(sp.get("role") as LiveRole) ? sp.get("role") : "onair") as LiveRole;

  // 各画面は自分で :id を useParams から読む。ここではルーティングだけを担う
  void id;

  if (role === "rundown") return <RundownPage />;
  if (role === "prompter") return <PrompterPage />;
  if (role === "audio") return <AudioSupportPage />;
  return <OnAirPage />;
}
