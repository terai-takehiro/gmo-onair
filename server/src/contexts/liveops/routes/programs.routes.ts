import { Router } from 'express';
import { queryAll as query, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { encrypt, decrypt, mask } from '../crypto';
import { v4 as uuidv4 } from 'uuid';
import { getTeamsToken } from '../teams-token';
import { subscribeToMeeting } from '../teams-subscription';

const router = Router();
const canRead  = [requireAuth, requirePermission('liveops', 'reader')] as const;
const canWrite = [requireAuth, requirePermission('liveops', 'manager')] as const;

async function trySubscribeTeams(programId: string, meetingUrl: string, req: any): Promise<void> {
  try {
    const { queryOne: qOne } = await import('../../../shared/db/connection');
    const userId = req.user?.id;
    const settingsRow = await qOne(
      `SELECT teams_client_id_enc, teams_client_secret_enc, teams_tenant_id_enc
       FROM liveops_settings
       WHERE user_id = $1
         OR teams_client_id_enc IS NOT NULL
       ORDER BY (user_id = $1) DESC, updated_at DESC
       LIMIT 1`,
      [userId]
    );
    if (!settingsRow) return;
    const s = settingsRow as any;
    const clientId = s.teams_client_id_enc ? decrypt(s.teams_client_id_enc) : null;
    const clientSecret = s.teams_client_secret_enc ? decrypt(s.teams_client_secret_enc) : null;
    const tenantId = s.teams_tenant_id_enc ? decrypt(s.teams_tenant_id_enc) : null;
    if (!clientId || !clientSecret || !tenantId) return;

    const token = await getTeamsToken(tenantId, clientId, clientSecret);
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const baseUrl = `${protocol}://${host}/api/v1/internal`;
    await subscribeToMeeting(programId, meetingUrl, token, baseUrl);
  } catch (e) {
    console.warn('[programs] teams subscribe failed:', (e as Error).message);
  }
}

router.get('/', ...canRead, async (req, res) => {
  try {
    const { project_id } = req.query;
    const params: string[] = [];
    const filter = project_id ? (params.push(String(project_id)), `AND p.project_id = $${params.length}`) : '';
    const rows = await query(
      `SELECT p.id, p.name, p.project_id, p.youtube_urls, p.jstream_lpid,
              p.zoom_meeting_id, p.zoom_webinar_id, p.teams_meeting_url,
              p.singular_mappings, p.created_at, p.updated_at,
              pr.name AS project_name, pr.gls_number
       FROM liveops_programs p
       LEFT JOIN projects pr ON p.project_id = pr.id
       WHERE p.deleted_at IS NULL ${filter}
       ORDER BY p.updated_at DESC`,
      params
    );
    const data = rows.map((r: any) => ({
      ...r,
      singularAppTokenMasked: mask(decrypt(r.singular_app_token_enc)),
      hasSingularToken: !!r.singular_app_token_enc,
    }));
    res.json({ success: true, data });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/:id', ...canRead, async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT p.*, pr.name AS project_name, pr.gls_number
       FROM liveops_programs p
       LEFT JOIN projects pr ON p.project_id = pr.id
       WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({
      success: true,
      data: {
        ...row,
        singularAppTokenMasked: mask(decrypt((row as any).singular_app_token_enc)),
        hasSingularToken: !!(row as any).singular_app_token_enc,
      },
    });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/', ...canWrite, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const {
      name, projectId, youtubeUrls = [], jstreamLpid, singularAppToken,
      zoomMeetingId, zoomWebinarId, teamsMeetingUrl,
    } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'name required' });

    const id = uuidv4();
    await execute(
      `INSERT INTO liveops_programs
         (id, name, project_id, youtube_urls, jstream_lpid, singular_app_token_enc, created_by,
          zoom_meeting_id, zoom_webinar_id, teams_meeting_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        id, name, projectId || null,
        JSON.stringify(youtubeUrls), jstreamLpid || null,
        singularAppToken ? encrypt(singularAppToken) : null,
        userId,
        zoomMeetingId || null, zoomWebinarId || null, teamsMeetingUrl || null,
      ]
    );

    if (teamsMeetingUrl) {
      trySubscribeTeams(id, teamsMeetingUrl, req as any);
    }

    const row = await queryOne('SELECT * FROM liveops_programs WHERE id = $1', [id]);
    res.status(201).json({ success: true, data: row });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 制作技術支援 v4.1 段1（12-live-timer-decision.md §3-4）: 案件 → liveops_programs の
// 「取得または作成」をアトミックに行う。DBスキーマは1バイトも変えない — 既存の一意インデックス
// （migration 221 `liveops_programs_project_key`）に `ON CONFLICT DO NOTHING` を乗せるだけ。
// 呼び出し元は client-live 側の橋渡し画面（/live/open?project=:id・OpenByProjectPage.tsx）。
router.post('/resolve-by-project/:projectId', ...canWrite, async (req, res) => {
  try {
    const { projectId } = req.params;

    const existing = await queryOne(
      'SELECT id FROM liveops_programs WHERE project_id = $1 AND deleted_at IS NULL',
      [projectId]
    );
    if (existing) {
      return res.json({ success: true, data: { id: (existing as any).id } });
    }

    const project = await queryOne('SELECT name FROM projects WHERE id = $1', [projectId]);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const id = uuidv4();
    const userId = (req as any).user?.id;
    const inserted = await queryOne(
      `INSERT INTO liveops_programs (id, name, project_id, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id) WHERE project_id IS NOT NULL AND deleted_at IS NULL DO NOTHING
       RETURNING id`,
      [id, (project as any).name, projectId, userId]
    );
    if (inserted) {
      return res.status(201).json({ success: true, data: { id: (inserted as any).id } });
    }

    // 同時実行で他のリクエストが先に作った（一意インデックスに ON CONFLICT が乗ったため
    // DO NOTHING で行が返らなかった）。もう一度 SELECT すれば必ず1件だけ見つかる。
    const row = await queryOne(
      'SELECT id FROM liveops_programs WHERE project_id = $1 AND deleted_at IS NULL',
      [projectId]
    );
    if (!row) {
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
    res.json({ success: true, data: { id: (row as any).id } });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.put('/:id', ...canWrite, async (req, res) => {
  try {
    const {
      name, projectId, youtubeUrls, jstreamLpid, singularAppToken, singularMappings,
      zoomMeetingId, zoomWebinarId, teamsMeetingUrl, mainTimerId,
    } = req.body;
    const existing = await queryOne(
      'SELECT id, project_id, singular_app_token_enc, teams_meeting_url FROM liveops_programs WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' });

    // 主タイマー（main_timer_id）は同じ案件のタイマーだけを紐付けられる。
    // 他案件のタイマーIDを渡されても紐付けない（実装設計 09-live-timer-impl.md §3-2 ②）。
    if (mainTimerId !== undefined && mainTimerId !== null && mainTimerId !== '') {
      const timerRow = await queryOne(
        'SELECT id, program_id, project_id FROM liveops_timers WHERE id = $1 AND deleted_at IS NULL',
        [mainTimerId]
      );
      if (!timerRow) {
        return res.status(400).json({ success: false, message: '指定されたタイマーが見つかりません' });
      }
      const programProjectId = (existing as any).project_id;
      const belongsToProgram = (timerRow as any).program_id === req.params.id;
      const belongsToProject = programProjectId != null && (timerRow as any).project_id === programProjectId;
      if (!belongsToProgram && !belongsToProject) {
        return res.status(400).json({ success: false, message: '他の案件のタイマーは主タイマーに設定できません' });
      }
    }

    const newToken = singularAppToken !== undefined
      ? (singularAppToken === '' ? null : encrypt(singularAppToken))
      : (existing as any).singular_app_token_enc;

    const sets: string[] = [
      'name = COALESCE($2, name)',
      'youtube_urls = COALESCE($3, youtube_urls)',
      'jstream_lpid = $4',
      'singular_app_token_enc = $5',
      'singular_mappings = COALESCE($6, singular_mappings)',
      'updated_at = NOW()',
    ];
    const params: unknown[] = [
      req.params.id,
      name ?? null,
      youtubeUrls ? JSON.stringify(youtubeUrls) : null,
      jstreamLpid ?? null,
      newToken,
      singularMappings ? JSON.stringify(singularMappings) : null,
    ];
    // ⚠️ project_id は COALESCE ではなく「渡されたときだけ」更新する。
    //   常に上書きすると（旧実装のように）「projectId を送らない PUT」で
    //   案件との紐付けが黙って外れてしまう（ProgramsPage.tsx の保存も projectId を送っていない）。
    if (projectId !== undefined) {
      sets.splice(-1, 0, `project_id = $${params.length + 1}`);
      params.push(projectId || null);
    }
    if (zoomMeetingId !== undefined) {
      sets.splice(-1, 0, `zoom_meeting_id = $${params.length + 1}`);
      params.push(zoomMeetingId || null);
    }
    if (zoomWebinarId !== undefined) {
      sets.splice(-1, 0, `zoom_webinar_id = $${params.length + 1}`);
      params.push(zoomWebinarId || null);
    }
    if (teamsMeetingUrl !== undefined) {
      sets.splice(-1, 0, `teams_meeting_url = $${params.length + 1}`);
      params.push(teamsMeetingUrl || null);
    }
    if (mainTimerId !== undefined) {
      sets.splice(-1, 0, `main_timer_id = $${params.length + 1}`);
      params.push(mainTimerId || null);
    }
    await execute(
      `UPDATE liveops_programs SET ${sets.join(', ')} WHERE id = $1`,
      params
    );

    // If Teams meeting URL changed, set up new subscription
    const oldUrl = (existing as any).teams_meeting_url;
    const newUrl = teamsMeetingUrl !== undefined ? (teamsMeetingUrl || null) : oldUrl;
    if (newUrl && newUrl !== oldUrl) {
      trySubscribeTeams(String(req.params.id), newUrl, req as any);
    }

    const row = await queryOne('SELECT * FROM liveops_programs WHERE id = $1', [req.params.id]);
    res.json({ success: true, data: row });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.delete('/:id', ...canWrite, async (req, res) => {
  try {
    await execute(
      'UPDATE liveops_programs SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
