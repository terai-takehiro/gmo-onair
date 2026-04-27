import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/contexts/platform/AuthContext";
import { PageTransition } from "@/components/ui/motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@gmo-onair/shared/src/client/dashboard";
import {
  HardDrive, Copy, Check, AlertTriangle, Loader2, Database, Clock,
} from "lucide-react";

interface BackupFile {
  id: string;
  name: string;
  size: number | string;
  created_at: string;
}

interface EnvBackups {
  env: 'prod' | 'dev';
  files: BackupFile[];
}

interface BackupsResponse {
  configured: boolean;
  environments: EnvBackups[];
}

function formatSize(bytes: number | string): string {
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes} 分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 時間前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 日前`;
  return formatDate(iso);
}

export default function DbBackupsPage() {
  const { currentUser } = useAuth();
  const isSystemAdmin = currentUser?.role === "system_admin";
  const [copiedFile, setCopiedFile] = useState<string | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["db-backups"],
    queryFn: async () => {
      const res = await api.get("/data-viewer/db-backups");
      return res.data.data as BackupsResponse;
    },
    enabled: isSystemAdmin,
    staleTime: 60 * 1000,
  });

  const copyCommand = (env: 'prod' | 'dev', filename: string) => {
    const container = `gmo-onair-app_${env}-1`;
    const cmd = `docker exec -it ${container} node /app/server/scripts/restore-db-from-box.mjs ${filename}`;
    navigator.clipboard.writeText(cmd).then(() => {
      setCopiedFile(filename);
      setTimeout(() => setCopiedFile(null), 2500);
    });
  };

  if (!isSystemAdmin) {
    return (
      <PageTransition>
        <div className="p-6">
          <EmptyState
            title="アクセス権限がありません"
            description="DB バックアップ管理は system_admin ロールのみ閲覧できます。"
          />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-6 p-3 lg:p-6 max-w-5xl">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <HardDrive className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl lg:text-2xl font-bold">DB バックアップ管理</h1>
            <p className="text-xs text-muted-foreground">
              BOX の社内限り/00_DB_Backup/ に保管されている自動バックアップ一覧。3 時間ごとに 30 日分が保持されています。
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "再読込"}
          </Button>
        </div>

        {/* Warning banner */}
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm space-y-2">
          <div className="flex items-center gap-2 font-semibold text-red-700">
            <AlertTriangle className="h-4 w-4" />
            復元は破壊的操作です
          </div>
          <ul className="list-disc list-inside text-red-700/90 text-xs space-y-1">
            <li>復元コマンドを実行すると、対象 DB の<strong>全テーブルが上書き</strong>されます (取り消し不可)</li>
            <li>UI からは実行できません。<strong>VPS に SSH してコマンドを直接実行</strong>する必要があります</li>
            <li>本番ファイルは本番環境でのみ、検証ファイルは検証環境でのみ復元可能 (クロス禁止)</li>
            <li>復元前に現在の DB は <code className="text-[10px]">/tmp/before-restore_*.sql.gz</code> へ自動退避されます</li>
          </ul>
        </div>

        {/* Loading / error / empty states */}
        {isLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {error && (
          <EmptyState
            title="バックアップ一覧の取得に失敗しました"
            description={(error as Error).message}
          />
        )}

        {data && !data.configured && (
          <EmptyState
            title="BOX 連携が未設定"
            description="BOX_CONFIG_JSON および BOX_PROJECT_PARENT_FOLDER_ID_INTERNAL を .env に設定してコンテナを再起動してください。"
          />
        )}

        {data && data.configured && data.environments.length === 0 && (
          <EmptyState
            title="バックアップが見つかりません"
            description="まだバックアップが取得されていないか、cron が動作していない可能性があります。"
          />
        )}

        {/* Backup tables per environment */}
        {data?.environments.map((envBackup) => (
          <BackupTable
            key={envBackup.env}
            env={envBackup.env}
            files={envBackup.files}
            onCopy={copyCommand}
            copiedFile={copiedFile}
          />
        ))}

        {/* CLI doc */}
        <div className="rounded-xl border bg-muted/30 p-4 text-xs space-y-2">
          <div className="flex items-center gap-2 font-semibold">
            <Database className="h-4 w-4" />
            VPS での実行手順
          </div>
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
            <li>VPS に SSH 接続: <code className="font-mono">ssh root@133.117.74.239</code></li>
            <li>上のテーブルから「コマンドをコピー」ボタンを押す</li>
            <li>VPS のターミナルで貼り付けて実行 (確認プロンプトで <code>yes</code> と入力)</li>
            <li>復元中の出力で進行状況を確認 (4 ステップ・通常 1〜数分)</li>
          </ol>
          <p className="text-[11px] text-muted-foreground/80 pt-1">
            一覧表示のみのコマンド: <code className="font-mono">docker exec gmo-onair-app_prod-1 node /app/server/scripts/restore-db-from-box.mjs --list</code>
          </p>
        </div>
      </div>
    </PageTransition>
  );
}

function BackupTable({
  env,
  files,
  onCopy,
  copiedFile,
}: {
  env: 'prod' | 'dev';
  files: BackupFile[];
  onCopy: (env: 'prod' | 'dev', name: string) => void;
  copiedFile: string | null;
}) {
  const envLabel = env === 'prod' ? '本番 (onair_prod)' : '検証 (onair_dev)';
  const envColor = env === 'prod' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700';

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-3 bg-muted/30">
        <div className="flex items-center gap-2">
          <Badge className={envColor + " font-mono text-xs"}>{env.toUpperCase()}</Badge>
          <span className="font-semibold">{envLabel}</span>
        </div>
        <span className="text-xs text-muted-foreground">{files.length} 件</span>
      </div>

      {files.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          バックアップがありません
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ファイル名</TableHead>
                <TableHead className="w-24 text-right">サイズ</TableHead>
                <TableHead className="w-44">作成日時</TableHead>
                <TableHead className="w-32 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-mono text-xs">{f.name}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{formatSize(f.size)}</TableCell>
                  <TableCell className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <div>
                        <div>{formatDate(f.created_at)}</div>
                        <div className="text-[10px] text-muted-foreground">{relativeTime(f.created_at)}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onCopy(env, f.name)}
                      className="gap-1.5 h-8"
                    >
                      {copiedFile === f.name ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-emerald-700">コピー完了</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>コマンドをコピー</span>
                        </>
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
