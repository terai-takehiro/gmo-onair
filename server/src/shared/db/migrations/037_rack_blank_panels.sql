-- ラックのブランクパネル（機材ではないラック専用）
CREATE TABLE IF NOT EXISTS rack_blank_panels (
  id           TEXT PRIMARY KEY,
  location_id  TEXT NOT NULL REFERENCES equipment_locations(id),
  rack_position INTEGER NOT NULL,
  rack_height  INTEGER NOT NULL DEFAULT 1,
  rack_slot    TEXT NOT NULL DEFAULT 'full'
                CHECK (rack_slot IN ('full','left-1_2','right-1_2','left-1_3','mid-1_3','right-1_3')),
  rack_side    TEXT NOT NULL DEFAULT 'front'
                CHECK (rack_side IN ('front','back')),
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rack_blank_panels_location
  ON rack_blank_panels(location_id, rack_side, rack_position);
