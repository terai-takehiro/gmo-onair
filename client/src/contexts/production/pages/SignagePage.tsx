import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import api from "@/lib/api";

interface SignageBooking {
  title: string;
  /** 予約種別。仮押さえ (hold) を本予約と読ませないために出す */
  booking_type?: string;
  /** confirmed / tentative */
  status?: string;
  occupant: string;
  usage_note: string;
  start_time: string;
  end_time: string;
}

/**
 * 「仮押さえ」と読める札を出すか。
 *
 * 題名から種別を外した (v3.1.2) ので、これが無いと表示機の前に立った人は
 * **まだ確定していない部屋を「使用中」と読む**。部屋つきの仮押さえは実際に作られる
 * (道のりのダイアログで部屋を答えると attachHoldRooms が仮押さえに部屋を足す)。
 */
function tentativeLabel(b: SignageBooking): string | null {
  if (b.booking_type === 'hold') return '仮押さえ';
  if (b.booking_type === 'consultation') return '相談';
  if (b.status === 'tentative') return '未確定';
  return null;
}

interface SignageData {
  room: { name: string; location_name: string; room_type: string };
  current: SignageBooking | null;
  upcoming: SignageBooking[];
}

function formatTime(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatTimeRange(start: string, end: string) {
  return `${formatTime(start)} - ${formatTime(end)}`;
}

export default function SignagePage() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [data, setData] = useState<SignageData | null>(null);
  const [clock, setClock] = useState(new Date());
  const [error, setError] = useState("");

  // 時計更新 (毎秒)
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // データ取得 (30秒ごと)
  useEffect(() => {
    if (!roomId) return;
    const fetchData = async () => {
      try {
        const res = await api.get(`/studios/rooms/${roomId}/signage`, { params: { token } });
        setData(res.data.data);
        setError("");
      } catch (err: any) {
        setError(err.response?.data?.error?.message || "データ取得に失敗しました");
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [roomId, token]);

  const dateStr = `${clock.getFullYear()}年${clock.getMonth() + 1}月${clock.getDate()}日`;
  const timeStr = `${clock.getHours()}:${String(clock.getMinutes()).padStart(2, "0")}`;

  if (error) {
    return (
      <div className="signage-container signage-idle">
        <p style={{ fontSize: "2rem", opacity: 0.7 }}>{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="signage-container signage-idle">
        <p style={{ fontSize: "2rem", opacity: 0.5 }}>読み込み中...</p>
      </div>
    );
  }

  const hasCurrent = !!data.current;

  return (
    <div className={`signage-container ${hasCurrent ? "signage-active" : "signage-idle"}`}>
      {/* ヘッダー: 部屋名 + 時計 */}
      <div className="signage-header">
        <div>
          <div className="signage-room-name">{data.room.name}</div>
          <div className="signage-location">{data.room.location_name}</div>
        </div>
        <div className="signage-clock">
          <div className="signage-time">{timeStr}</div>
          <div className="signage-date">{dateStr}</div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="signage-body">
        {hasCurrent ? (
          <>
            <div className="signage-label">ご利用中</div>
            {tentativeLabel(data.current!) && (
              <div className="signage-tentative">{tentativeLabel(data.current!)}</div>
            )}
            <div className="signage-title">{data.current!.title.replace(/^GLS-?\w+\s*/i, '')}</div>
            {data.current!.occupant && (
              <div className="signage-occupant">{data.current!.occupant}</div>
            )}
            {data.current!.usage_note && (
              <div className="signage-note">{data.current!.usage_note}</div>
            )}
            <div className="signage-time-range">
              {formatTimeRange(data.current!.start_time, data.current!.end_time)}
            </div>
          </>
        ) : (
          <>
            <div className="signage-label signage-label-free">空室</div>
            {data.upcoming.length > 0 ? (
              <div className="signage-upcoming">
                <div className="signage-upcoming-label">次のご利用</div>
                <div className="signage-title">
                  {tentativeLabel(data.upcoming[0]) && (
                    <span className="signage-tentative-inline">{tentativeLabel(data.upcoming[0])}</span>
                  )}
                  {data.upcoming[0].title.replace(/^GLS-?\w+\s*/i, '')}
                </div>
                {data.upcoming[0].occupant && (
                  <div className="signage-occupant">{data.upcoming[0].occupant}</div>
                )}
                <div className="signage-time-range">
                  {formatTimeRange(data.upcoming[0].start_time, data.upcoming[0].end_time)}
                </div>
              </div>
            ) : (
              <div className="signage-no-booking">本日のご予約はありません</div>
            )}
          </>
        )}
      </div>

      {/* フッター */}
      <div className="signage-footer">GMO SAMURAI STUDIO</div>
    </div>
  );
}
