// shared/src/client/states/Skeleton.tsx — 読み込み中
//
// 決めごと (§2.4):
//   ・前の内容を消さない (react-query の placeholderData と併用する)
//   ・1秒未満はスピナーを出さない → Delayed で遅らせる
//   ・全画面ローディングは作らない (画面の骨格は出したまま中身だけ骨組みにする)

import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '../utils';

const BAR = 'animate-pulse rounded bg-secondary';

/**
 * 指定ミリ秒 (既定 1000ms) を超えて読み込みが続くときだけ children を出す。
 * 一瞬で返ってくる取得でスケルトンが点滅するのを防ぐ。
 */
export function Delayed({ delayMs = 1000, children }: { delayMs?: number; children: ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);
  if (!show) return null;
  return <>{children}</>;
}

export interface SkeletonRowsProps {
  rows?: number;
  /** 各行の高さ (px) */
  rowHeight?: number;
  className?: string;
}

/** 一覧・表の骨組み */
export function SkeletonRows({ rows = 5, rowHeight = 56, className }: SkeletonRowsProps) {
  return (
    <div className={cn('space-y-2', className)} role="status" aria-label="読み込み中">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border border-border bg-card px-4"
          style={{ height: rowHeight }}
        >
          <div className={cn(BAR, 'h-8 w-8 shrink-0 rounded-full')} />
          <div className="min-w-0 flex-1 space-y-2">
            <div className={cn(BAR, 'h-3.5')} style={{ width: `${58 - (i % 3) * 9}%` }} />
            <div className={cn(BAR, 'h-3 opacity-70')} style={{ width: `${34 + (i % 2) * 12}%` }} />
          </div>
          <div className={cn(BAR, 'hidden h-3.5 w-20 shrink-0 sm:block')} />
        </div>
      ))}
    </div>
  );
}

export interface SkeletonCardProps {
  /** 見出しの下に置く行数 */
  lines?: number;
  className?: string;
}

/** カード1枚の骨組み */
export function SkeletonCard({ lines = 3, className }: SkeletonCardProps) {
  return (
    <div
      className={cn('space-y-3 rounded-lg border border-border bg-card p-5', className)}
      role="status"
      aria-label="読み込み中"
    >
      <div className={cn(BAR, 'h-4 w-1/3')} />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={cn(BAR, 'h-3 opacity-70')} style={{ width: `${88 - i * 14}%` }} />
      ))}
    </div>
  );
}

/** 数字カード (KPI) の骨組み */
export function SkeletonKpi({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-4', className)} role="status" aria-label="読み込み中">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2.5 rounded-lg border border-border bg-card p-4">
          <div className={cn(BAR, 'h-3 w-20 opacity-70')} />
          <div className={cn(BAR, 'h-7 w-28')} />
        </div>
      ))}
    </div>
  );
}
