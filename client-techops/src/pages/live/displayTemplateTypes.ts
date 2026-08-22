import type { DisplayLayout } from '@gmo-onair/shared/src/client/live/displayLayout';

/** `GET /liveops/display-templates` の1行。`usage_count` は SQL の `COUNT(*)` なので
 *  pg ドライバの都合で文字列で返ることがある（`Number()` で必ず数値化してから使うこと）。 */
export interface TemplateRow {
  id: string;
  name: string;
  layout: DisplayLayout;
  usage_count: string | number;
  updated_at: string;
}
