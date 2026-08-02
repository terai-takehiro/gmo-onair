import { Router, Request, Response } from 'express';
import { queryOne } from '../../../shared/db/connection';

const router = Router();

interface MicAssignment {
  ch: number;
  person: string;
  micType: string;
  state: 'on' | 'off' | 'standby';
}

interface DocumentRow {
  id: string;
  title: string | null;
  data: unknown;
  deleted_at: Date | null;
}

interface DocData {
  meta?: { title?: string };
  blocks?: { id: string; type: string; label: string; width?: string | number }[];
  sections?: {
    label?: string;
    duration?: string;
    _break?: boolean;
    _pageBreak?: boolean;
    _vtr?: boolean;
    rows?: {
      duration?: string;
      label?: string;
      cells?: Record<string, unknown>;
    }[];
  }[];
  masters?: {
    persons?: string[];
    micTypes?: string[];
    micChannels?: { ch: number; label?: string }[];
  };
}

// ============================================================
// 音声サポート画面用 公開エンドポイント
// 認証なしで取得可能。マイク香盤 (audio_mic ブロック) と最低限のメタのみ返す。
// シナリオ本文・broadcast_date・episode_code 等は意図的に含めない。
// ============================================================
router.get('/documents/:id/public-audio', async (req: Request, res: Response) => {
  try {
    const row = await queryOne(
      `SELECT id, title, data, deleted_at FROM qsheet_documents WHERE id = $1`,
      [req.params.id],
    ) as DocumentRow | undefined;
    if (!row || row.deleted_at) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'ドキュメントが見つかりません' } });
      return;
    }

    const raw = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    const data: DocData = (raw && typeof raw === 'object') ? raw as DocData : {};

    const allBlocks = Array.isArray(data.blocks) ? data.blocks : [];
    const micBlocks = allBlocks.filter((b) => b && b.type === 'audio_mic');

    const sections = (Array.isArray(data.sections) ? data.sections : []).map((sec) => {
      const rows = (Array.isArray(sec?.rows) ? sec.rows : []).map((r) => {
        const cells: Record<string, { assignments: MicAssignment[] }> = {};
        for (const blk of micBlocks) {
          const c = r?.cells?.[blk.id] as { assignments?: MicAssignment[] } | undefined;
          if (c && Array.isArray(c.assignments)) {
            cells[blk.id] = { assignments: c.assignments };
          }
        }
        return {
          duration: typeof r?.duration === 'string' ? r.duration : '',
          label: typeof r?.label === 'string' ? r.label : '',
          cells,
        };
      });
      return {
        label: typeof sec?.label === 'string' ? sec.label : '',
        duration: typeof sec?.duration === 'string' ? sec.duration : '',
        _break: !!sec?._break,
        _pageBreak: !!sec?._pageBreak,
        _vtr: !!sec?._vtr,
        rows,
      };
    });

    const masters = data.masters || {};
    const payload = {
      id: row.id,
      meta: { title: data.meta?.title || row.title || '' },
      blocks: micBlocks.map((b) => ({ id: b.id, type: b.type, label: b.label })),
      sections,
      masters: {
        persons: Array.isArray(masters.persons) ? masters.persons : [],
        micTypes: Array.isArray(masters.micTypes) ? masters.micTypes : [],
        micChannels: Array.isArray(masters.micChannels) ? masters.micChannels : [],
      },
    };

    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: payload });
  } catch (err: unknown) {
    console.error('GET /documents/:id/public-audio error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'サーバー内部エラーが発生しました' } });
  }
});

export default router;
