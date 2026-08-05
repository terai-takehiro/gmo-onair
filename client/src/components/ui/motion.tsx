/**
 * **案件管理に残している部品** (shared に上げていない)。
 *
 * framer-motion は案件管理にしか入っていない重いパッケージで、しかも v4 は
 * hover を色・罫線だけに絞り `transform` を使わない / 画面遷移は CSS の
 * `animation: screenIn` と決めている (`docs/design/v4/_tokens.md`)。
 * **v4 が離れていく方向の部品**なので、日常業務・機材管理に framer-motion を
 * 背負わせてまで共通化しない。Phase 2 の画面作り直しで整理する。
 */
import { motion, type Variants } from "framer-motion";
import { type ReactNode } from "react";

// ページ全体のフェードイン + スライドアップ
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

// リストアイテムのスタッガーアニメーション用コンテナ
const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const staggerItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
};

export function StaggerList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={staggerItem} className={className}>
      {children}
    </motion.div>
  );
}

// カードのホバーリフト
export function LiftCard({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
      transition={{ duration: 0.15 }}
      className={className}
      onClick={onClick}
    >
      {children}
    </motion.div>
  );
}
