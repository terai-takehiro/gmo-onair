/**
 * `/live/display/:timerId`（本番の会場モニター・OBS が読む無認証画面）の契約を固定する検査
 *
 * ── なぜ要るか ──────────────────────────────────────────────
 *
 * 09（計時・視聴者）でサーバー側の計測に切り替えたとき、書き手が
 * ブラウザからサーバーに変わるだけで、表示画面が読む API・URL・認証の有無は
 * 1文字も変えていない（実装設計 09-live-timer-impl.md §8）。
 * このページは本番の出力そのもの・配布済みの URL なので、
 * うっかり認証を足す／エンドポイントを変えるとその場で本番が壊れる。
 * ここでは「口約束」ではなく文字列で固定する。
 *
 * ── 何を見るか ──────────────────────────────────────────────
 *
 * ① App.tsx が `/live/display/` を見て認証を迂回していること
 * ② TimerDisplayPage.tsx が読む2本の API パスが変わっていないこと
 * ③ サーバー側の `/:id/display` `/:programId/display` ルートが
 *   `requireAuth` / `requirePermission` を通していないこと
 *   （素朴な文字列チェック。ルートの直前に `...canRead` が並んでいないことを見る）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

describe('/live/display/:timerId の契約', () => {
  it('client-live/src/App.tsx が /live/display/ を認証なしで分岐している', () => {
    const source = readFileSync(join(ROOT, 'client-live/src/App.tsx'), 'utf8');
    expect(source).toContain("'/live/display/'");
  });

  it('TimerDisplayPage.tsx が読む2本の内部 API パスが変わっていない', () => {
    const source = readFileSync(join(ROOT, 'client-live/src/pages/TimerDisplayPage.tsx'), 'utf8');
    expect(source).toContain('/api/v1/internal/liveops/timers/');
    expect(source).toContain('/api/v1/internal/liveops/snapshots/');
  });

  it('timers.routes.ts の /:id/display は認証を通していない', () => {
    const source = readFileSync(
      join(ROOT, 'server/src/contexts/liveops/routes/timers.routes.ts'),
      'utf8',
    );
    const line = source.split('\n').find((l) => l.includes("'/:id/display'"));
    expect(line, '/:id/display ルートが見つからない').toBeTruthy();
    expect(line).not.toContain('canRead');
    expect(line).not.toContain('requireAuth');
  });

  it('snapshots.routes.ts の /:programId/display は認証を通していない', () => {
    const source = readFileSync(
      join(ROOT, 'server/src/contexts/liveops/routes/snapshots.routes.ts'),
      'utf8',
    );
    const line = source.split('\n').find((l) => l.includes("'/:programId/display'"));
    expect(line, '/:programId/display ルートが見つからない').toBeTruthy();
    expect(line).not.toContain('canRead');
    expect(line).not.toContain('requireAuth');
  });

  it('liveops_snapshots への INSERT が total_count / captured_at を書いていない（GENERATED / DEFAULT 列）', () => {
    const source = readFileSync(
      join(ROOT, 'server/src/contexts/liveops/measure.service.ts'),
      'utf8',
    );
    const insert = source.match(/INSERT INTO liveops_snapshots[\s\S]*?\)/)?.[0] ?? '';
    expect(insert).not.toMatch(/total_count/);
    expect(insert).not.toMatch(/captured_at/);
  });
});
