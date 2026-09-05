import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { Loader2 } from "lucide-react";

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;
    const token = searchParams.get("token");
    if (!token) {
      navigate("/login?error=no_token", { replace: true });
      return;
    }
    loginWithToken(token)
      .then(() => navigate("/", { replace: true }))
      .catch(() => navigate("/login?error=auth_failed", { replace: true }));
    // 一度だけ実行 (searchParams は ref で保護)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">認証中…</p>
      </div>
    </div>
  );
}
