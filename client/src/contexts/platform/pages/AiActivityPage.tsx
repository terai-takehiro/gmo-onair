/**
 * AI の活動（`/settings/ai-activity`・Phase 2 ②）
 *
 * ── なぜこの画面が要るのか ──────────────────────────────────
 *
 * AI の成績（digest）はこれまで MCP 経由でしか読めず、
 * **「AI が今日何をして、どれだけ直されたか」を人が見る場所が無かった**。
 * 会社方針「AIを使い捨てにしない」の5条件のうち「レビュー頻度と担当を決める」は、
 * 見る画面が無いと運用に載らない。ここがそのループの人間側の窓口:
 * ① 直近の活動（1件ずつの採用/修正/却下）② 成績（kind ごとの集計）
 * ③ 月次レビュー（毎月の下書きに manager が「確認した」を打刻）。
 *
 * ── URL は変えない ──────────────────────────────────────────
 *
 * 月次レビューの社内通知（sales_ai_review_draft）の link が
 * `/settings/ai-activity` を指す — **サーバーと対**なので動かさない。
 *
 * ── 営業系の数字だけが出る ──────────────────────────────────
 *
 * API（/ai-activity/*）が営業系 kind しか受けない（台本の断片が混ざる
 * qsheet 系の修正例を営業の画面に出さないための構造的な秘匿）。
 * 制作側の成績は制作の月次レビュー（ops_reports）で見る。
 */
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { useAuth } from '@/contexts/platform/AuthContext';
import { RecentSection } from './aiActivity/RecentSection';
import { DigestSection } from './aiActivity/DigestSection';
import { ReviewSection } from './aiActivity/ReviewSection';

export default function AiActivityPage() {
  const { hasPermission } = useAuth();
  // 「確認した」ボタンの出し分け。サーバー（POST /reviews/:id/reviewed）も
  // sales:manager で守っている — 押せるのに 403 を作らない
  const canReview = hasPermission('sales', 'manager');

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="AI の活動"
        sub="AI が何をして、どれだけ直されたか。直した記録は AI の次の出力を良くする材料になります"
      />
      <RecentSection />
      <DigestSection />
      <ReviewSection canReview={canReview} />
    </div>
  );
}
