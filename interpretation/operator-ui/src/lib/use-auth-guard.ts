"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isExpired, useAuth } from "@/lib/auth";

/** Redirect to /login if no valid session is present. */
export function useAuthGuard(): boolean {
  const router = useRouter();
  const pathname = usePathname();
  const token = useAuth((s) => s.token);
  const expiresAt = useAuth((s) => s.expiresAt);

  const ok = !!token && !isExpired(expiresAt);

  useEffect(() => {
    if (!ok) {
      const next = encodeURIComponent(pathname || "/");
      router.replace(`/login?next=${next}`);
    }
  }, [ok, pathname, router]);

  return ok;
}
