-- 016: Add missing indexes for FK columns and common query patterns

-- revenues: billing_key lookup
CREATE INDEX IF NOT EXISTS idx_revenues_billing_key ON revenues(billing_key) WHERE deleted_at IS NULL;

-- purchases: vendor_id FK, billing_key lookup
CREATE INDEX IF NOT EXISTS idx_purchases_vendor ON purchases(vendor_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_purchases_billing_key ON purchases(billing_key) WHERE deleted_at IS NULL;

-- sga_expenses: vendor_id FK, billing_key lookup
CREATE INDEX IF NOT EXISTS idx_sga_vendor ON sga_expenses(vendor_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sga_billing_key ON sga_expenses(billing_key) WHERE deleted_at IS NULL;

-- equipment: common filter patterns
CREATE INDEX IF NOT EXISTS idx_equipment_items_location ON equipment_items(location_id) WHERE deleted_at IS NULL;

-- equipment_lendings: overdue detection
CREATE INDEX IF NOT EXISTS idx_equipment_lendings_due_date ON equipment_lendings(due_date, status);

-- techsheet: common sort/filter
CREATE INDEX IF NOT EXISTS idx_techsheet_documents_updated_at ON techsheet_documents(updated_at);
CREATE INDEX IF NOT EXISTS idx_techsheet_documents_created_by ON techsheet_documents(created_by);

-- qsheet: updated_at sort
CREATE INDEX IF NOT EXISTS idx_qsheet_documents_updated_at ON documents(updated_at);
