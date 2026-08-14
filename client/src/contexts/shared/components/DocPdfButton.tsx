/**
 * 帳票（見積書・請求書・検収書）を発行するボタン
 *
 * ── なぜ部品にするか ────────────────────────────────────────
 *
 * 発行できる場所は4つあります（案件詳細の見積タブ・同 売上・請求ペイン・
 * ⑤ 見積・請求（全案件）・② 締め処理）。**同じ形のボタンを4回書くと、
 * 押した手応え・当たり判定・読み上げ名がすぐ食い違います** — とくに
 * 「行を押すと別の画面へ行く／選択が切り替わる」一覧の中に置くので、
 * `stopPropagation` を1か所でも書き忘れると**押すたびに画面が変わって
 * PDF が出ない**という追いにくい壊れ方をします。ここに1つだけ置きます。
 *
 * ── 決めごと ────────────────────────────────────────────────
 *
 * ・**アイコンだけ。** 置く先はどれも列幅の決まった一覧で、和文3字を足すと
 *   案件名の列が読めなくなる。何が出るかは `title` と `aria-label` が言う
 * ・**指では 44px、PC では 36px**（ボタンの段）。他の一覧の操作ボタンと同じ
 * ・**押している間は止める。** PDF は数百 ms かかることがあり、連打すると
 *   BOX に同じものが何度も上がる（版が無駄に増える）
 */
import { useState } from 'react';
import { FileText, ClipboardCheck, Loader2 } from 'lucide-react';
import { issueDocPdf, DOC_LABEL, type DocKind } from '@/lib/docPdf';

const ICON: Record<DocKind, typeof FileText> = {
  estimate: FileText,
  invoice: FileText,
  inspection: ClipboardCheck,
};

export interface DocPdfButtonProps {
  /** API のパス。売上なら `/revenues/:id/pdf`、見積なら `/projects/:pid/estimates/:id/pdf` */
  path: string;
  kind: DocKind;
  /** クエリ。売上からの発行は帳票の種類を渡す */
  params?: Record<string, string>;
}

export function DocPdfButton({ path, kind, params }: DocPdfButtonProps) {
  const [busy, setBusy] = useState(false);
  const Icon = ICON[kind];
  const label = DOC_LABEL[kind];

  return (
    <button
      type="button"
      disabled={busy}
      title={`${label} PDF を発行する（BOX にも保存されます）`}
      aria-label={`${label} PDF を発行する`}
      onClick={async (e) => {
        // 行そのものが押せる一覧に置くので、行の動作へ伝えない
        e.stopPropagation();
        setBusy(true);
        try { await issueDocPdf(path, kind, params); } finally { setBusy(false); }
      }}
      className="rounded-control flex min-h-tap w-11 shrink-0 items-center justify-center border border-border bg-card text-secondary-foreground hover:border-primary-border hover:text-primary disabled:opacity-50 lg:h-9 lg:min-h-0 lg:w-9"
    >
      {busy
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        : <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
    </button>
  );
}
