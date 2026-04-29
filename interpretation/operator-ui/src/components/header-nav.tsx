"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

export function HeaderNav() {
  const user = useAuth((s) => s.user);
  const isAdmin = user?.role === "admin";
  return (
    <nav className="flex items-center gap-4 text-sm text-stone-600">
      <Link href="/" className="hover:text-brand">
        セッション
      </Link>
      <Link href="/history" className="hover:text-brand">
        履歴
      </Link>
      <Link href="/glossaries" className="hover:text-brand">
        用語辞書
      </Link>
      {isAdmin && (
        <Link href="/admin" className="hover:text-brand">
          管理
        </Link>
      )}
    </nav>
  );
}
