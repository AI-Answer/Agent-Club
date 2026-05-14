CREATE TABLE planner_day_mark (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    planner_month_id UUID NOT NULL REFERENCES planner_month(id) ON DELETE CASCADE,
    mark_date DATE NOT NULL,
    color TEXT NOT NULL,
    label TEXT,
    created_by_type TEXT NOT NULL DEFAULT 'member'
        CHECK (created_by_type IN ('member', 'agent', 'system')),
    created_by_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(workspace_id, mark_date)
);

CREATE INDEX idx_planner_day_mark_month_date ON planner_day_mark(planner_month_id, mark_date);
CREATE INDEX idx_planner_day_mark_workspace_date ON planner_day_mark(workspace_id, mark_date);
