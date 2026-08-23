// shared/src/client/AppHeader.tsx — 各ブロックアプリ共通のヘッダー配線
// SharedHeader + 利用マニュアル / バージョン履歴 / MCPコネクタ の3モーダルを1コンポーネントに集約。
// 各アプリの Header は useAuth 等の設定を渡してこれを呼ぶだけでよい
// (従来は7アプリで同一のモーダル state + 配線をコピペしていた)。
import { useState, type ReactNode } from "react";
import SharedHeader, { type SharedHeaderUser } from "./SharedHeader";
import ManualModal from "./manual/ManualModal";
import VersionHistoryModal from "./versionHistory/VersionHistoryModal";
import McpInfoModal from "./mcpInfo/McpInfoModal";
import type { ManualContent } from "./manual/types";

interface AppHeaderProps {
  currentApp: string;
  appLabel: string;
  subLabel?: string;
  currentUser: SharedHeaderUser | null;
  onLogout: () => void;
  onSwitchUser?: () => void;
  onToggleSidebar?: () => void;
  centerContent?: ReactNode;
  /** 渡すと利用マニュアルボタン + モーダルを有効化する */
  manualContent?: ManualContent;
  /** バージョン履歴モーダルの製品ラベル (既定 "GMO ONAiR") */
  productLabel?: string;
}

export default function AppHeader({
  currentApp,
  appLabel,
  subLabel,
  currentUser,
  onLogout,
  onSwitchUser,
  onToggleSidebar,
  centerContent,
  manualContent,
  productLabel = "GMO ONAiR",
}: AppHeaderProps) {
  const [manualOpen, setManualOpen] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [mcpInfoOpen, setMcpInfoOpen] = useState(false);
  return (
    <>
      <SharedHeader
        currentApp={currentApp}
        appLabel={appLabel}
        subLabel={subLabel}
        currentUser={currentUser}
        onLogout={onLogout}
        onSwitchUser={onSwitchUser}
        onToggleSidebar={onToggleSidebar}
        centerContent={centerContent}
        onOpenManual={manualContent ? () => setManualOpen(true) : undefined}
        onOpenVersionHistory={() => setVersionHistoryOpen(true)}
        onOpenMcpInfo={() => setMcpInfoOpen(true)}
      />
      {manualContent && (
        <ManualModal open={manualOpen} onOpenChange={setManualOpen} content={manualContent} />
      )}
      <VersionHistoryModal open={versionHistoryOpen} onOpenChange={setVersionHistoryOpen} productLabel={productLabel} />
      <McpInfoModal open={mcpInfoOpen} onOpenChange={setMcpInfoOpen} />
    </>
  );
}
