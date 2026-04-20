import { Router } from 'express';
import { queryAll as query, queryOne, execute } from '../../../shared/db/connection';
import { encrypt, decrypt, mask } from '../crypto';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const rows = await query(
      `SELECT p.id, p.name, p.project_id, p.youtube_urls, p.jstream_lpid,
              p.singular_mappings, p.created_at, p.updated_at,
              pr.name AS project_name, pr.gls_number
       FROM liveops_programs p
       LEFT JOIN projects pr ON p.project_id = pr.id
       WHERE p.deleted_at IS NULL
       ORDER BY p.updated_at DESC`,
      []
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

router.get('/:id', async (req, res) => {
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

router.post('/', async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const { name, projectId, youtubeUrls = [], jstreamLpid, singularAppToken } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'name required' });

    const id = uuidv4();
    await execute(
      `INSERT INTO liveops_programs
         (id, name, project_id, youtube_urls, jstream_lpid, singular_app_token_enc, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        id, name, projectId || null,
        JSON.stringify(youtubeUrls), jstreamLpid || null,
        singularAppToken ? encrypt(singularAppToken) : null,
        userId,
      ]
    );
    const row = await queryOne('SELECT * FROM liveops_programs WHERE id = $1', [id]);
    res.status(201).json({ success: true, data: row });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, projectId, youtubeUrls, jstreamLpid, singularAppToken, singularMappings } = req.body;
    const existing = await queryOne(
      'SELECT id, singular_app_token_enc FROM liveops_programs WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' });

    const newToken = singularAppToken !== undefined
      ? (singularAppToken === '' ? null : encrypt(singularAppToken))
      : existing.singular_app_token_enc;

    await execute(
      `UPDATE liveops_programs SET
         name = COALESCE($2, name),
         project_id = $3,
         youtube_urls = COALESCE($4, youtube_urls),
         jstream_lpid = $5,
         singular_app_token_enc = $6,
         singular_mappings = COALESCE($7, singular_mappings),
         updated_at = NOW()
       WHERE id = $1`,
      [
        req.params.id,
        name ?? null, projectId ?? null,
        youtubeUrls ? JSON.stringify(youtubeUrls) : null,
        jstreamLpid ?? null,
        newToken,
        singularMappings ? JSON.stringify(singularMappings) : null,
      ]
    );
    const row = await queryOne('SELECT * FROM liveops_programs WHERE id = $1', [req.params.id]);
    res.json({ success: true, data: row });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
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
