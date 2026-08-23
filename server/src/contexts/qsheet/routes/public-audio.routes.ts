import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { queryOne } from '../../../shared/db/connection';
import { ACCEPT_LEGACY_AUDIO_ACCESS, resolvePublicToken } from '../services/audio-share.service';

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

// このルートは資料の data (JSONB 全体) を毎回読んで組み立てるので、URL が外に出た
// ときに DB 負荷が本番中に上がるのを避ける (総当たり対策ではない。トークンは192bit)。
const publicAudioLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'リクエスト回数が上限に達しました。しばらく待ってください。' } },
});

// ============================================================
// 音声サポート画面用 公開エンドポイント
// 認証なしで取得可能。マイク香盤 (audio_mic ブロック) と最低限のメタのみ返す。
// シナリオ本文・broadcast_date・episode_code 等は意図的に含めない。
//
// URL は今までどおり /qsheet/audio/<資料ID> (パスは1文字も変えない)。
// ?token= は「発行・失効の管理」のためだけに使う任意パラメータ:
//   - 無し (旧URL)        → 段階① 受け入れつつ記録するだけ (ACCEPT_LEGACY_AUDIO_ACCESS)
//   - あり・失効済み       → 410 Gone
//   - あり・存在しない/別資料 → 404 (「失効した」と外から区別させない)
//   - あり・有効           → 200、last_seen_at を更新
// ============================================================
router.get('/documents/:id/public-audio', publicAudioLimiter, async (req: Request, res: Response) => {
  try {
    const docId = req.params.id as string;
    const rawToken = req.query.token;
    const token = typeof rawToken === 'string' && rawToken.length > 0 ? rawToken : undefined;
    // 段階②(予告帯・実施済み): トークン無し(旧URL)でアクセスされたときだけ true。
    // ACCEPT_LEGACY_AUDIO_ACCESS が false になった段階③以降は、旧URLは下の
    // 410 分岐で弾かれるためこの帯まで到達しない(呼び出し元は死んだコードではなく
    // 「段階③を戻したときの受け皿」として残してある)。
    let isLegacyAccess = false;

    if (token) {
      const resolution = await resolvePublicToken(docId, token);
      if (resolution === 'not_found') {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'ドキュメントが見つかりません' } });
        return;
      }
      if (resolution === 'revoked') {
        res.status(410).json({ success: false, error: { code: 'GONE', message: 'この URL は使えなくなりました' } });
        return;
      }
      // 'valid' → 通常どおり続行
    } else if (!ACCEPT_LEGACY_AUDIO_ACCESS) {
      // 段階③（2026-08-23・ユーザー判断により実施）: 旧URL(トークン無し)を拒否する
      res.status(410).json({ success: false, error: { code: 'GONE', message: 'この URL は使えなくなりました' } });
      return;
    } else {
      // 段階① (この段): 旧URL (トークン無し) を受け入れつつ記録するだけ。
      // IP・UA は残さない — document_id と時刻だけ。表は作らずログのみ (§9-3 の決め)。
      console.log(`[qsheet] public-audio legacy access (no token) document_id=${docId} at=${new Date().toISOString()}`);
      isLegacyAccess = true;
    }

    const row = await queryOne(
      `SELECT id, title, data, deleted_at FROM qsheet_documents WHERE id = $1`,
      [docId],
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

    // 個人情報の絞り込み (実装設計 02 §6-1): masters.persons / micTypes は
    // 「その台本のマイク香盤に実際に出てくる名前だけ」に絞る。全社の人名簿ではなく
    // 資料ごとの手入力リストだが、絞れるものは絞る。micChannels は画面が使うので絞らない。
    const usedPersons = new Set<string>();
    const usedMicTypes = new Set<string>();
    for (const sec of sections) {
      for (const r of sec.rows) {
        for (const cell of Object.values(r.cells)) {
          for (const a of cell.assignments) {
            if (a.person) usedPersons.add(a.person);
            if (a.micType) usedMicTypes.add(a.micType);
          }
        }
      }
    }

    const masters = data.masters || {};
    const payload = {
      id: row.id,
      meta: { title: data.meta?.title || row.title || '' },
      blocks: micBlocks.map((b) => ({ id: b.id, type: b.type, label: b.label })),
      sections,
      masters: {
        persons: Array.isArray(masters.persons) ? masters.persons.filter((p) => usedPersons.has(p)) : [],
        micTypes: Array.isArray(masters.micTypes) ? masters.micTypes.filter((t) => usedMicTypes.has(t)) : [],
        micChannels: Array.isArray(masters.micChannels) ? masters.micChannels : [],
      },
      // 段階②(予告): 旧URL(トークン無し)で開かれたときだけ true。
      // トークンありの通常アクセスではフィールド自体を省略する(既存の応答構成を壊さない)。
      ...(isLegacyAccess ? { legacy: true as const } : {}),
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
