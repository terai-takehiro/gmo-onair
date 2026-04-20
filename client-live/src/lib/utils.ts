import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTimer(remainingMs: number): string {
  if (remainingMs === 0) return '00:00';
  const abs = Math.abs(remainingMs);
  const totalSec = Math.floor(abs / 1000);
  const mm = Math.floor(totalSec / 60).toString().padStart(2, '0');
  const ss = (totalSec % 60).toString().padStart(2, '0');
  return (remainingMs < 0 ? '+' : '') + `${mm}:${ss}`;
}

export function formatCount(n: number): string {
  if (n >= 10000) return Math.floor(n / 1000) + 'K';
  return n.toLocaleString('ja-JP');
}
