import { PageTransition } from "@/components/ui/motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BLOCK_APPS } from "@/contexts/platform/AuthContext";

export default function SettingsPage() {
  return (
    <PageTransition>
      <div className="space-y-4 p-3 lg:space-y-6 lg:p-6">
        <h1 className="text-lg lg:text-2xl font-bold">システム設定</h1>

        {/* アプリ情報 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base lg:text-lg">アプリ情報</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">アプリ名</dt>
              <dd className="font-medium">GMO ONAiR</dd>
              <dt className="text-muted-foreground">バージョン</dt>
              <dd className="font-medium">v0.7.0</dd>
            </dl>
          </CardContent>
        </Card>

        {/* ブロックアプリ一覧 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base lg:text-lg">ブロックアプリ一覧</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">アプリ名</th>
                    <th className="pb-2 pr-4 font-medium">ステータス</th>
                    <th className="pb-2 font-medium">ベースパス</th>
                  </tr>
                </thead>
                <tbody>
                  {BLOCK_APPS.map((app) => (
                    <tr key={app.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{app.label}</td>
                      <td className="py-2 pr-4">
                        {app.status === "active" ? (
                          <Badge className="bg-green-500 text-white">有効</Badge>
                        ) : (
                          <Badge variant="secondary">準備中</Badge>
                        )}
                      </td>
                      <td className="py-2 font-mono text-xs text-muted-foreground">
                        {app.basePath}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* 将来の設定項目 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base lg:text-lg">将来の設定項目</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              通知設定、メール配信、バックアップ等の設定は今後追加予定です
            </p>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
