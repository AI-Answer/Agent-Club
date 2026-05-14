ALTER TABLE issue ADD COLUMN goal_id UUID REFERENCES goal(id) ON DELETE SET NULL;

CREATE INDEX idx_issue_goal ON issue(goal_id);
