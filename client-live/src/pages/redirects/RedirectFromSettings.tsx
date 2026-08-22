import type { RedirectTarget } from './RedirectStatus';
import { RedirectView } from './RedirectStatus';

/**
 * 旧URL `/live/settings` → 新URL `/qsheet/live-org-settings`（組織の鍵設定）。
 * project_id の解決は不要（案件に紐づかない組織全体の設定のため）— API 呼び出し無しで
 * 即座に行き先が決まる。
 */
const TARGET: RedirectTarget = { status: 'redirect', to: '/qsheet/live-org-settings' };

export default function RedirectFromSettings() {
  return <RedirectView target={TARGET} />;
}
