import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Printer } from "lucide-react";

interface CameraRow {
  id: string; number: string; model: string; lens: string;
  operator: string; position: string; cable: string;
}

interface AudioRow {
  id: string; item: string; detail: string; notes: string;
}

interface AudioSection {
  id: string; label: string; rows: AudioRow[];
}

interface SheetData {
  id: string; type: string; label: string; enabled: boolean;
  rows?: CameraRow[]; sections?: AudioSection[];
}

interface DocumentData {
  header: {
    programName: string; broadcastType: string; productionFormat: string;
    studio: string; circuits: string; vtr: string; performers: string;
  };
  staff: {
    td: string; sw: string; d: string[]; p: string; ve: string;
    cam: string[]; mix: string; aa: string[]; ca: string[];
    vtrOp: string; aux: string; ld: string; cg: string;
  };
  sheets: SheetData[];
  notes: string;
}

interface TechsheetDoc {
  id: string; title: string; production_date: string | null;
  venue: string | null; version: string; data: DocumentData;
  gls_number?: string; project_name?: string;
}

export default function PrintPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: doc, isLoading } = useQuery({
    queryKey: ["techsheet-document", id],
    queryFn: async () => {
      const res = await api.get(`/techsheet/documents/${id}`);
      const d = res.data.data;
      if (typeof d.data === "string") d.data = JSON.parse(d.data);
      return d as TechsheetDoc;
    },
    enabled: !!id,
    refetchOnWindowFocus: false,
  });

  if (isLoading || !doc) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const { header: h, staff: s, sheets, notes } = doc.data;
  const enabledSheets = sheets.filter((sh) => sh.enabled);

  const staffPairs = [
    ["TD", s.td], ["SW", s.sw], ["P", s.p], ["VE", s.ve],
    ["MIX", s.mix], ["VTR", s.vtrOp], ["LD", s.ld], ["CG", s.cg], ["AUX", s.aux],
  ].filter(([, v]) => v);

  const staffArrays = [
    ["D", s.d], ["CAM", s.cam], ["AA", s.aa], ["CA", s.ca],
  ].filter(([, arr]) => (arr as string[]).some((v) => v));

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Control bar (no-print) */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-2 bg-white border-b px-4 py-2 shadow-sm">
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate(`/techsheet/editor/${id}`)}>
          <ArrowLeft className="h-4 w-4" />
          エディターに戻る
        </Button>
        <Button size="sm" className="gap-1" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          印刷
        </Button>
      </div>

      {/* ============== Page 1: 基本情報・スタッフ ============== */}
      <div className="print-page bg-white max-w-[210mm] mx-auto my-4 p-6 shadow-md" style={{ minHeight: "297mm" }}>
        {/* Title header */}
        <div className="border-2 border-black mb-4">
          <div className="bg-black text-white px-3 py-1.5 text-lg font-bold tracking-wide">
            番組概要
          </div>
          <div className="p-3 space-y-2">
            <div className="grid grid-cols-[100px_1fr] gap-x-2 text-sm">
              <span className="font-bold text-xs bg-slate-100 px-1 py-0.5">番組名</span>
              <span className="font-semibold">{h.programName || doc.title}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              {doc.gls_number && (
                <div><span className="font-bold bg-slate-100 px-1 py-0.5">コード</span> {doc.gls_number}</div>
              )}
              {doc.production_date && (
                <div><span className="font-bold bg-slate-100 px-1 py-0.5">制作日</span> {doc.production_date}</div>
              )}
              {h.broadcastType && (
                <div><span className="font-bold bg-slate-100 px-1 py-0.5">放送/配信</span> {h.broadcastType}</div>
              )}
              {h.productionFormat && (
                <div><span className="font-bold bg-slate-100 px-1 py-0.5">制作方式</span> {h.productionFormat}</div>
              )}
              {h.studio && (
                <div><span className="font-bold bg-slate-100 px-1 py-0.5">スタジオ</span> {h.studio}</div>
              )}
            </div>
            {doc.version && (
              <div className="text-right text-[10px] text-gray-500">{doc.version}</div>
            )}
          </div>
        </div>

        {/* Staff grid */}
        <div className="border border-black mb-4">
          <div className="bg-slate-800 text-white px-2 py-1 text-xs font-bold">スタッフ</div>
          <div className="grid grid-cols-4 gap-px bg-gray-300 text-xs">
            {staffPairs.map(([label, value]) => (
              <div key={label} className="bg-white px-2 py-1.5">
                <span className="font-bold text-[10px] text-gray-500 block">{label}</span>
                <span>{value}</span>
              </div>
            ))}
          </div>
          {staffArrays.length > 0 && (
            <div className="border-t border-gray-300 text-xs">
              {staffArrays.map(([label, arr]) => (
                <div key={label as string} className="flex items-center gap-2 px-2 py-1 border-b border-gray-200 last:border-b-0">
                  <span className="font-bold text-[10px] text-gray-500 w-12 shrink-0">{label}</span>
                  <span>{(arr as string[]).filter(Boolean).join("、")}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Header details */}
        {[
          ["回線", h.circuits],
          ["VTR", h.vtr],
          ["出演者", h.performers],
        ].filter(([, v]) => v).map(([label, value]) => (
          <div key={label} className="border border-gray-300 mb-2 text-xs">
            <div className="bg-slate-100 px-2 py-0.5 font-bold text-[10px]">{label}</div>
            <div className="px-2 py-1 whitespace-pre-wrap">{value}</div>
          </div>
        ))}

        {notes && (
          <div className="border border-gray-300 mt-4 text-xs">
            <div className="bg-yellow-50 px-2 py-0.5 font-bold text-[10px]">備考</div>
            <div className="px-2 py-1 whitespace-pre-wrap">{notes}</div>
          </div>
        )}
      </div>

      {/* ============== Sheet pages ============== */}
      {enabledSheets.map((sheet) => (
        <div key={sheet.id} className="print-page bg-white max-w-[210mm] mx-auto my-4 p-6 shadow-md" style={{ minHeight: "297mm" }}>
          <div className="border-2 border-black mb-4">
            <div className="bg-black text-white px-3 py-1.5 text-base font-bold">
              {sheet.label}
            </div>
            <div className="text-right px-2 py-0.5 text-[10px] text-gray-400">
              {h.programName || doc.title} {doc.version && `— ${doc.version}`}
            </div>
          </div>

          {/* Camera sheet */}
          {sheet.type === "camera" && (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100">
                  {["No.", "カメラ機種", "レンズ", "担当者", "設置場所", "ケーブル/備考"].map((h) => (
                    <th key={h} className="border border-gray-300 px-2 py-1.5 text-left font-bold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {((sheet.rows || []) as CameraRow[]).map((row) => (
                  <tr key={row.id}>
                    <td className="border border-gray-300 px-2 py-1 font-bold w-12">{row.number}</td>
                    <td className="border border-gray-300 px-2 py-1">{row.model}</td>
                    <td className="border border-gray-300 px-2 py-1">{row.lens}</td>
                    <td className="border border-gray-300 px-2 py-1">{row.operator}</td>
                    <td className="border border-gray-300 px-2 py-1">{row.position}</td>
                    <td className="border border-gray-300 px-2 py-1">{row.cable}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Sectioned sheets (audio, video, comms) */}
          {(sheet.type === "audio" || sheet.type === "video" || sheet.type === "comms") && (
            <div className="space-y-4">
              {((sheet.sections || []) as AudioSection[]).map((sec) => (
                <div key={sec.id}>
                  <div className="bg-slate-800 text-white px-2 py-1 text-xs font-bold mb-0.5">
                    {sec.label}
                  </div>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="border border-gray-300 px-2 py-1 text-left font-bold w-[120px]">項目</th>
                        <th className="border border-gray-300 px-2 py-1 text-left font-bold">詳細</th>
                        <th className="border border-gray-300 px-2 py-1 text-left font-bold w-[150px]">備考</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sec.rows.map((row) => (
                        <tr key={row.id}>
                          <td className="border border-gray-300 px-2 py-1 font-medium">{row.item}</td>
                          <td className="border border-gray-300 px-2 py-1 whitespace-pre-wrap">{row.detail}</td>
                          <td className="border border-gray-300 px-2 py-1">{row.notes}</td>
                        </tr>
                      ))}
                      {sec.rows.length === 0 && (
                        <tr>
                          <td colSpan={3} className="border border-gray-300 px-2 py-2 text-center text-gray-400">
                            データなし
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
