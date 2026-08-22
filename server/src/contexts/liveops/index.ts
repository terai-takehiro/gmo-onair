import { Router } from 'express';
import settingsRoutes from './routes/settings.routes';
import programsRoutes from './routes/programs.routes';
import proxyRoutes from './routes/proxy.routes';
import snapshotsRoutes from './routes/snapshots.routes';
import timersRoutes from './routes/timers.routes';
import displayTemplatesRoutes from './routes/display-templates.routes';
import webhooksRoutes from './routes/webhooks.routes';
import measureRoutes from './routes/measure.routes';
import orgSettingsRoutes from './routes/org-settings.routes';
import { restoreSubscriptions, startSubscriptionRenewal } from './teams-subscription';
import { getTeamsToken } from './teams-token';
import { queryOne } from '../../shared/db/connection';
import { decrypt } from './crypto';
import { restoreMeasurements } from './measure.service';

export function createLiveopsRoutes(): Router {
  const router = Router();

  // webhooks: no auth — mount before guarded routes
  router.use('/liveops/webhooks', webhooksRoutes);

  router.use('/liveops/settings', settingsRoutes);
  router.use('/liveops/org-settings', orgSettingsRoutes);
  router.use('/liveops/programs', programsRoutes);
  router.use('/liveops/proxy', proxyRoutes);
  router.use('/liveops/snapshots', snapshotsRoutes);
  router.use('/liveops/timers', timersRoutes);
  router.use('/liveops/display-templates', displayTemplatesRoutes);
  router.use('/liveops/measure', measureRoutes);

  return router;
}

export async function initLiveopsServices(): Promise<void> {
  await restoreSubscriptions();

  startSubscriptionRenewal(async () => {
    try {
      const row = await queryOne(
        `SELECT teams_client_id_enc, teams_client_secret_enc, teams_tenant_id_enc
         FROM liveops_settings
         WHERE teams_client_id_enc IS NOT NULL
         ORDER BY updated_at DESC
         LIMIT 1`,
        []
      );
      if (!row) return null;
      const r = row as any;
      const clientId = r.teams_client_id_enc ? decrypt(r.teams_client_id_enc) : null;
      const clientSecret = r.teams_client_secret_enc ? decrypt(r.teams_client_secret_enc) : null;
      const tenantId = r.teams_tenant_id_enc ? decrypt(r.teams_tenant_id_enc) : null;
      if (!clientId || !clientSecret || !tenantId) return null;
      return getTeamsToken(tenantId, clientId, clientSecret);
    } catch {
      return null;
    }
  });

  // 視聴者計測の復元。⚠️ このメソッド自体は呼び出し側（server/src/index.ts）で
  // catch されているため、ここで投げると「計測が復元されない」ことに誰も気づけない。
  // 必ず自前で警告を出す。
  await restoreMeasurements().catch((e) =>
    console.warn('[liveops] restoreMeasurements failed:', (e as Error).message)
  );
}

export { initLiveopsSocketIO } from './socket';
