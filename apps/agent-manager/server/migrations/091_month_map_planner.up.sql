CREATE TABLE planner_month (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    year INT NOT NULL CHECK (year >= 1970 AND year <= 3000),
    month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
    title TEXT NOT NULL,
    tab_color TEXT,
    objectives JSONB NOT NULL DEFAULT '[]',
    notes JSONB NOT NULL DEFAULT '[]',
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(workspace_id, year, month)
);

CREATE TABLE planner_entry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    planner_month_id UUID NOT NULL REFERENCES planner_month(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    color TEXT,
    status TEXT NOT NULL DEFAULT 'planned'
        CHECK (status IN ('planned', 'queued', 'working', 'done', 'blocked', 'skipped')),
    priority TEXT NOT NULL DEFAULT 'none'
        CHECK (priority IN ('urgent', 'high', 'medium', 'low', 'none')),
    position FLOAT NOT NULL DEFAULT 0,
    project_id UUID REFERENCES project(id) ON DELETE SET NULL,
    goal_id UUID REFERENCES goal(id) ON DELETE SET NULL,
    issue_id UUID REFERENCES issue(id) ON DELETE SET NULL,
    assignee_type TEXT CHECK (assignee_type IN ('member', 'agent', 'squad')),
    assignee_id UUID,
    created_by_type TEXT NOT NULL DEFAULT 'member'
        CHECK (created_by_type IN ('member', 'agent', 'system')),
    created_by_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_planner_month_workspace_year ON planner_month(workspace_id, year, month);
CREATE INDEX idx_planner_entry_month_date ON planner_entry(planner_month_id, entry_date, position);
CREATE INDEX idx_planner_entry_workspace_date ON planner_entry(workspace_id, entry_date);
CREATE INDEX idx_planner_entry_issue ON planner_entry(issue_id) WHERE issue_id IS NOT NULL;
CREATE INDEX idx_planner_entry_goal ON planner_entry(goal_id) WHERE goal_id IS NOT NULL;
CREATE INDEX idx_planner_entry_project ON planner_entry(project_id) WHERE project_id IS NOT NULL;
