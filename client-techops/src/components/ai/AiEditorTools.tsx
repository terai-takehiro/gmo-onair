// 編集画面用 AI 生成のまとめ部品（段8・04-ai.md §8-2）。
//
// 3つのボタン（骨格・セリフ・壁打ち）と、それぞれのダイアログの開閉状態を
// **この1部品に閉じ込める**。`EditorPage.tsx` は既に400行の上限を超えている
// グランドファーザー化ファイルなので、そこへ状態・ボタン・ダイアログを
// バラバラに足すと `check-file-size.mjs` の「超過ファイルを増やさない」検査に引っかかる。
//
// ⚠️ 本番3画面（OnAir/Rundown/Prompter）と公開音声はこの部品を import しない
// （`shared/tests/qsheetAiProductionGuard.test.ts` が機械で見張る）。
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, MessageSquare } from "lucide-react";
import { toolbarMenuItemClass } from "@/components/editor/ToolbarOverflowMenu";
import AiOutlineDialog from "./AiOutlineDialog";
import AiLinesDialog from "./AiLinesDialog";
import AiChatSheet from "./AiChatSheet";

interface Props {
  documentId: string;
  projectId?: string;
  updateData: (updater: (data: any) => any) => void;
  /**
   * `menu` にすると、ヘッダーの「…」（`ToolbarOverflowMenu`）の中に並べる
   * 1行の形で描く。ダイアログの持ち主はどちらでもこの部品のまま
   * （呼び出し側へ state を持ち上げない）。
   */
  variant?: "toolbar" | "menu";
}

export default function AiEditorTools({ documentId, projectId, updateData, variant = "toolbar" }: Props) {
  const [showOutline, setShowOutline] = useState(false);
  const [showLines, setShowLines] = useState(false);
  const [showChat, setShowChat] = useState(false);

  return (
    <>
      {variant === "menu" ? (
        <>
          <button type="button" className={toolbarMenuItemClass} onClick={() => setShowOutline(true)}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden />AIで骨格を作る
          </button>
          <button type="button" className={toolbarMenuItemClass} onClick={() => setShowLines(true)}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden />AIでセリフを作る
          </button>
          <button type="button" className={toolbarMenuItemClass} onClick={() => setShowChat(true)}>
            <MessageSquare className="h-3.5 w-3.5" aria-hidden />AIと壁打ちする
          </button>
        </>
      ) : (
        <>
          <Button variant="ghost" size="sm" className="hidden md:flex h-8 gap-1 text-xs" onClick={() => setShowOutline(true)} title="AIで骨格を作る">
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">AI骨格</span>
          </Button>
          <Button variant="ghost" size="sm" className="hidden md:flex h-8 gap-1 text-xs" onClick={() => setShowLines(true)} title="AIでセリフを作る">
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">AIセリフ</span>
          </Button>
          <Button variant="ghost" size="sm" className="hidden md:flex h-8 gap-1 text-xs" onClick={() => setShowChat(true)} title="AIと壁打ちする（あなただけに見えます）">
            <MessageSquare className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">壁打ち</span>
          </Button>
        </>
      )}

      {/* data には直接触らない。取り込みは updateData 経由（applyProposalOps・§3-1） */}
      <AiOutlineDialog open={showOutline} onOpenChange={setShowOutline} documentId={documentId} updateData={updateData} />
      <AiLinesDialog open={showLines} onOpenChange={setShowLines} documentId={documentId} updateData={updateData} />
      <AiChatSheet open={showChat} onOpenChange={setShowChat} documentId={documentId} projectId={projectId} />
    </>
  );
}
