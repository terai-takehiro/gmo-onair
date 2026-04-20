import { useNavigate } from "react-router-dom";
import { formatDate } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, ExternalLink, MapPin, Clock, Calendar } from "lucide-react";

interface BookingRoom {
  room_id: string;
  room_name: string;
  room_color: string;
  room_type?: string;
  location_id: string;
  occupant?: string;
  usage_note?: string;
}

interface StudioBooking {
  id: string;
  title: string;
  booking_type: string;
  project_id: string | null;
  episode_id: string | null;
  all_day: number;
  start_time: string;
  end_time: string;
  location_note: string | null;
  notes: string | null;
  project_name: string | null;
  gls_number: string | null;
  episode_code: string | null;
  status?: string;
  rooms: BookingRoom[];
}

const bookingTypeLabels: Record<string, string> = {
  performance: "本番",
  rehearsal: "リハーサル",
  hold: "仮押さえ",
  consultation: "相談",
  maintenance: "メンテナンス",
  tour: "内覧",
  internal: "社内利用",
  other: "その他",
};

const bookingTypeColors: Record<string, string> = {
  performance: "bg-rose-100 text-rose-700",
  rehearsal: "bg-amber-100 text-amber-700",
  hold: "bg-blue-100 text-blue-700",
  consultation: "bg-emerald-100 text-emerald-700",
  maintenance: "bg-red-100 text-red-700",
  tour: "bg-purple-100 text-purple-700",
  internal: "bg-cyan-100 text-cyan-700",
  other: "bg-gray-100 text-gray-700",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: StudioBooking | null;
  onEdit: (booking: StudioBooking) => void;
  onDelete: (id: string) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

function formatTimeRange(booking: StudioBooking): string {
  if (booking.all_day) {
    if (booking.start_time === booking.end_time) {
      return formatDate(booking.start_time) + " 終日";
    }
    return `${formatDate(booking.start_time)} ~ ${formatDate(booking.end_time)} 終日`;
  }
  const startDate = booking.start_time.split("T")[0];
  const startTime = booking.start_time.split("T")[1]?.slice(0, 5) || "";
  const endDate = booking.end_time.split("T")[0];
  const endTime = booking.end_time.split("T")[1]?.slice(0, 5) || "";

  if (startDate === endDate) {
    return `${formatDate(startDate)} ${startTime} ~ ${endTime}`;
  }
  return `${formatDate(startDate)} ${startTime} ~ ${formatDate(endDate)} ${endTime}`;
}

export default function StudioBookingDetailDialog({
  open,
  onOpenChange,
  booking,
  onEdit,
  onDelete,
  canEdit = true,
  canDelete = true,
}: Props) {
  const navigate = useNavigate();

  if (!booking) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <DialogTitle className="text-lg leading-tight pr-8">
              {booking.title}
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Type and status badges */}
          <div className="flex flex-wrap gap-1.5">
            <Badge className={bookingTypeColors[booking.booking_type] || "bg-gray-100 text-gray-700"}>
              {bookingTypeLabels[booking.booking_type] || booking.booking_type}
            </Badge>
            {booking.status === "tentative" ? (
              <Badge className="bg-gray-100 text-gray-500 italic">未確定</Badge>
            ) : (
              <Badge className="bg-blue-100 text-blue-700">確定</Badge>
            )}
          </div>

          {/* Date & Time */}
          <div className="flex items-start gap-2">
            {booking.all_day ? (
              <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
            ) : (
              <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
            )}
            <span className="text-sm">{formatTimeRange(booking)}</span>
          </div>

          {/* Rooms */}
          {booking.rooms.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">使用スタジオ</p>
              <div className="flex flex-wrap gap-1.5">
                {booking.rooms.map((r) => (
                  <span
                    key={r.room_id}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-white"
                    style={{ backgroundColor: r.room_color }}
                  >
                    {r.room_name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Greenroom occupant details */}
          {booking.rooms.some((r) => r.occupant || r.usage_note) && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">控室の利用者・用途</p>
              <div className="space-y-1.5 rounded-lg border p-2.5">
                {booking.rooms
                  .filter((r) => r.occupant || r.usage_note)
                  .map((r) => (
                    <div key={r.room_id} className="flex items-start gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0 mt-1"
                        style={{ backgroundColor: r.room_color }}
                      />
                      <div className="text-sm">
                        <span className="font-medium">{r.room_name}</span>
                        {r.occupant && <span className="ml-2">{r.occupant}</span>}
                        {r.usage_note && (
                          <span className="ml-1 text-muted-foreground">({r.usage_note})</span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* External location */}
          {booking.location_note && (
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
              <span className="text-sm">{booking.location_note}</span>
            </div>
          )}

          {/* Project link */}
          {booking.project_id && (
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground mb-1">紐付け案件</p>
              <button
                className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
                onClick={() => {
                  onOpenChange(false);
                  navigate(`/sales/projects/${booking.project_id}/episodes`);
                }}
              >
                <ExternalLink className="h-3 w-3" />
                {booking.gls_number && (
                  <span className="font-mono">{booking.gls_number}</span>
                )}
                {booking.project_name}
                {booking.episode_code && (
                  <span className="text-muted-foreground ml-1">
                    ({booking.episode_code})
                  </span>
                )}
              </button>
            </div>
          )}

          {/* Notes */}
          {booking.notes && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">メモ</p>
              <p className="text-sm">{booking.notes}</p>
            </div>
          )}

          {/* Actions */}
          {(canEdit || canDelete) && (
            <div className="flex justify-between pt-2 border-t">
              {canDelete ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onDelete(booking.id)}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  削除
                </Button>
              ) : <span />}
              {canEdit && (
                <Button
                  size="sm"
                  onClick={() => onEdit(booking)}
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  編集
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
