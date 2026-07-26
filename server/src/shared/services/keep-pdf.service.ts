/**
 * 隔週キープの PDF (デザイン 29章 / 仕様書 §7.3)
 *
 * **配布は PDF だけ。** PowerPoint 出力は作らない
 * (投影は画面のまま、配布も PDF で足りるため。デザイン修正依頼3で合意済み)。
 *
 * 型は Ver.2.5 のまま。ここでやるのは「画面に出しているものを紙の形にする」だけで、
 * 内容の組み立ては `keep-deck.service` が持つ (2か所に置くとずれる)。
 */
import PDFDocument from 'pdfkit';
import { registerNotoFonts } from '../utils/pdf-fonts';

interface DeckLike {
  meeting_date: string;
  format_version: string;
  page_count: number;
  ai_filled: number;
  needs_human_count: number;
  answers: { moved?: string | null; stuck?: string | null; consult?: string | null };
  pages: Array<{ no: string; label: string; by: string; needs_human: boolean }>;
  agenda: Array<{ no: string; label: string; minutes: number }>;
  total_minutes: number;
  themes: Array<{ no: number; theme: string; owner: string; human_line: string | null; auto: string }>;
  facts: Array<{ label: string; value: string; src: string }>;
  checklist: Array<{ label: string; ok: boolean }>;
  diffs: Array<{ what: string; detail: string }>;
  next_meeting_date?: string | null;
}

const FOOTER = 'Strictly confidential for internal use only';

export function generateKeepDeckPdf(deck: DeckLike): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      // 投影に合わせて横向き A4 (画面と同じ比率で読める)
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const { regular: R, bold: B } = registerNotoFonts(doc, { regular: 'R', bold: 'B' });
      const W = 842, H = 595, ML = 40, PW = W - ML * 2;

      const txt = (s: string, x: number, y: number,
        o: { sz?: number; f?: string; c?: string; w?: number; align?: string } = {}) => {
        doc.font(o.f ?? R).fontSize(o.sz ?? 10).fillColor(o.c ?? '#1a1d24')
          .text(s, x, y, { width: o.w, align: o.align, lineBreak: true } as any);
      };

      /** ページの枠 (ヘッダーとフッターは Ver.2.5 の決まり) */
      let pageNo = 0;
      const frame = (title: string, badge?: string) => {
        if (pageNo > 0) doc.addPage({ size: 'A4', layout: 'landscape', margin: 0 });
        pageNo++;
        doc.rect(0, 0, W, H).fill('#ffffff');
        // 上辺
        txt(`GMO流会議フォーマット ${deck.format_version}`, ML, 22, { sz: 8, c: '#5d6470' });
        txt(String(pageNo), W - ML - 30, 22, { sz: 8, c: '#5d6470', w: 30, align: 'right' });
        doc.moveTo(ML, 40).lineTo(W - ML, 40).lineWidth(0.5).stroke('#e6e9ed');
        txt(title, ML, 52, { sz: 17, f: B });
        if (badge) txt(badge, ML, 76, { sz: 9, c: '#5d6470' });
        // 下辺
        txt(FOOTER, ML, H - 26, { sz: 7, c: '#8b929c' });
      };

      /** 2列の表を描く */
      const rows = (
        startY: number,
        cols: Array<{ label: string; w: number }>,
        data: string[][],
      ) => {
        let y = startY;
        let x = ML;
        cols.forEach((c) => { txt(c.label, x, y, { sz: 8, f: B, c: '#5d6470', w: c.w }); x += c.w; });
        y += 16;
        doc.moveTo(ML, y - 4).lineTo(W - ML, y - 4).lineWidth(0.5).stroke('#e6e9ed');
        for (const r of data) {
          if (y > H - 60) break; // 1ページに収まらない分は落とす (紙は増やさない)
          x = ML;
          r.forEach((cellText, i) => {
            txt(cellText, x, y, { sz: 9, w: cols[i].w - 8 });
            x += cols[i].w;
          });
          y += 18;
          doc.moveTo(ML, y - 4).lineTo(W - ML, y - 4).lineWidth(0.3).stroke('#f4f6f8');
        }
        return y;
      };

      // ── 表紙 ──────────────────────────────────────────
      frame('隔週キープ', `${deck.meeting_date} ・ 全 ${deck.page_count}ページ ・ AIが埋めた ${deck.ai_filled}ページ`);
      txt('①数値報告・営業進捗 ／ ②案件実施報告 ／ ③重点取組課題 を毎回。④以降は議題があるときだけ。',
        ML, 120, { sz: 10, c: '#3c424c', w: PW });
      txt(`本編の時間配分：合計 ${deck.total_minutes}分`, ML, 150, { sz: 10, f: B });
      rows(180, [{ label: '順', w: 50 }, { label: '議題', w: 380 }, { label: '時間', w: 80 }],
        deck.agenda.map((a) => [a.no, a.label, `${a.minutes}分`]));
      if (deck.next_meeting_date) {
        txt(`次回開催日：${deck.next_meeting_date}`, ML, H - 60, { sz: 10, f: B });
      }

      // ── 0. 利用方法チェックリスト ──────────────────────
      frame('0. 利用方法チェックリスト', `${deck.format_version} の11項目。落ちている項目だけ赤で出します`);
      let y = 110;
      for (const c of deck.checklist) {
        txt(c.ok ? '✓' : '×', ML, y, { sz: 10, f: B, c: c.ok ? '#197a4b' : '#b91c1c' });
        txt(c.label, ML + 20, y, { sz: 10, c: c.ok ? '#1a1d24' : '#b91c1c' });
        y += 20;
      }

      // ── 前回からの変更 (赤字) ──────────────────────────
      frame('前回からの変更', '変わった箇所だけ赤字で出します（人が塗り直しません）');
      if (deck.diffs.length === 0) {
        txt('前回からの変更はありません。', ML, 110, { sz: 10, c: '#5d6470' });
      } else {
        rows(110, [{ label: 'どこが', w: 240 }, { label: '何が変わったか', w: 480 }],
          deck.diffs.map((d) => [d.what, d.detail]));
      }

      // ── ①数値報告 (人が書く3行) ────────────────────────
      frame('① 数値報告・営業進捗', '報告｜3×3｜5分　数字はお金の画面から。理由だけ人が書きます');
      y = 110;
      const qa: Array<[string, string | null | undefined]> = [
        ['この2週間で何が動きましたか', deck.answers.moved],
        ['うまくいっていないことは何ですか', deck.answers.stuck],
        ['社長に相談したいことはありますか', deck.answers.consult],
      ];
      for (const [q, a] of qa) {
        txt(q, ML, y, { sz: 9, f: B, c: '#5d6470' });
        txt(a && a.trim() ? a : '（書かないという判断も記録として残ります）',
          ML, y + 14, { sz: 11, c: a && a.trim() ? '#1a1d24' : '#8b929c', w: PW });
        y += 56;
      }
      txt('AIが集めた事実（ここは直さなくて済みます）', ML, y, { sz: 9, f: B, c: '#5d6470' });
      rows(y + 18, [{ label: '項目', w: 260 }, { label: '値', w: 160 }, { label: 'どこから', w: 300 }],
        deck.facts.map((f) => [f.label, f.value, f.src]));

      // ── ③重点取組課題 ─────────────────────────────────
      frame('③ 重点取組課題 進捗', '6テーマ。テーマと担当は固定。進捗は自動、打ち手だけ人が1行');
      rows(110,
        [{ label: '#', w: 24 }, { label: 'テーマ ／ 推進担当', w: 210 },
         { label: '人が書く1行', w: 260 }, { label: 'AIが入れる進捗', w: 268 }],
        deck.themes.map((t) => [
          String(t.no), `${t.theme} ／ ${t.owner}`,
          t.human_line && t.human_line.trim() ? t.human_line : '（未記入）',
          t.auto,
        ]));

      // ── ページの担い手一覧 ─────────────────────────────
      frame('ページごとの担い手', `AIが埋めた ${deck.ai_filled}ページ ／ 人が書くところ ${deck.needs_human_count}件`);
      const byLabel: Record<string, string> = {
        ai: 'AI', fixed: '固定', ai_human: 'AI＋人', human: '人',
      };
      rows(110,
        [{ label: 'ページ', w: 60 }, { label: '名前', w: 320 },
         { label: '担い手', w: 120 }, { label: '状態', w: 260 }],
        deck.pages.map((p) => [
          p.no, p.label, byLabel[p.by] ?? p.by,
          p.needs_human ? '人が書くところが残っています' : '揃っています',
        ]));

      doc.end();
    } catch (e) {
      reject(e as Error);
    }
  });
}
