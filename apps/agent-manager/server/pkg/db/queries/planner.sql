-- name: ListPlannerMonths :many
SELECT * FROM planner_month
WHERE workspace_id = $1
  AND year = $2
ORDER BY month ASC;

-- name: GetPlannerMonth :one
SELECT * FROM planner_month
WHERE workspace_id = $1
  AND year = $2
  AND month = $3;

-- name: GetPlannerMonthByID :one
SELECT * FROM planner_month
WHERE id = $1
  AND workspace_id = $2;

-- name: UpsertPlannerMonth :one
INSERT INTO planner_month (
    workspace_id, year, month, title, tab_color, objectives, notes, settings
) VALUES (
    $1, $2, $3, $4, sqlc.narg('tab_color'), $5, $6, $7
)
ON CONFLICT (workspace_id, year, month) DO UPDATE SET
    title = EXCLUDED.title,
    updated_at = now()
RETURNING *;

-- name: UpdatePlannerMonth :one
UPDATE planner_month SET
    title = $3,
    tab_color = $4,
    objectives = $5,
    notes = $6,
    settings = $7,
    updated_at = now()
WHERE id = $1
  AND workspace_id = $2
RETURNING *;

-- name: ListPlannerEntriesForMonth :many
SELECT * FROM planner_entry
WHERE workspace_id = $1
  AND planner_month_id = $2
ORDER BY entry_date ASC, position ASC, created_at ASC;

-- name: ListPlannerEntriesForDate :many
SELECT * FROM planner_entry
WHERE workspace_id = $1
  AND entry_date = $2
ORDER BY position ASC, created_at ASC;

-- name: ListPlannerDayMarksForMonth :many
SELECT * FROM planner_day_mark
WHERE workspace_id = $1
  AND planner_month_id = $2
ORDER BY mark_date ASC;

-- name: GetPlannerDayMarkForDate :one
SELECT * FROM planner_day_mark
WHERE workspace_id = $1
  AND mark_date = $2;

-- name: GetPlannerEntryInWorkspace :one
SELECT * FROM planner_entry
WHERE id = $1
  AND workspace_id = $2;

-- name: CreatePlannerEntry :one
INSERT INTO planner_entry (
    workspace_id,
    planner_month_id,
    entry_date,
    title,
    body,
    color,
    status,
    priority,
    position,
    project_id,
    goal_id,
    issue_id,
    assignee_type,
    assignee_id,
    created_by_type,
    created_by_id
) VALUES (
    $1, $2, $3, $4, sqlc.narg('body'), sqlc.narg('color'), $5, $6, $7,
    sqlc.narg('project_id'), sqlc.narg('goal_id'), sqlc.narg('issue_id'),
    sqlc.narg('assignee_type'), sqlc.narg('assignee_id'), $8, sqlc.narg('created_by_id')
)
RETURNING *;

-- name: UpdatePlannerEntry :one
UPDATE planner_entry SET
    entry_date = COALESCE(sqlc.narg('entry_date'), entry_date),
    title = COALESCE(sqlc.narg('title'), title),
    body = sqlc.narg('body'),
    color = sqlc.narg('color'),
    status = COALESCE(sqlc.narg('status'), status),
    priority = COALESCE(sqlc.narg('priority'), priority),
    position = COALESCE(sqlc.narg('position'), position),
    project_id = COALESCE(sqlc.narg('project_id'), project_id),
    goal_id = COALESCE(sqlc.narg('goal_id'), goal_id),
    issue_id = COALESCE(sqlc.narg('issue_id'), issue_id),
    assignee_type = COALESCE(sqlc.narg('assignee_type'), assignee_type),
    assignee_id = COALESCE(sqlc.narg('assignee_id'), assignee_id),
    updated_at = now()
WHERE id = $1
  AND workspace_id = $2
RETURNING *;

-- name: DeletePlannerEntry :exec
DELETE FROM planner_entry
WHERE id = $1
  AND workspace_id = $2;

-- name: UpsertPlannerDayMark :one
INSERT INTO planner_day_mark (
    workspace_id,
    planner_month_id,
    mark_date,
    color,
    label,
    created_by_type,
    created_by_id
) VALUES (
    $1, $2, $3, $4, sqlc.narg('label'), $5, sqlc.narg('created_by_id')
)
ON CONFLICT (workspace_id, mark_date) DO UPDATE SET
    planner_month_id = EXCLUDED.planner_month_id,
    color = EXCLUDED.color,
    label = EXCLUDED.label,
    updated_at = now()
RETURNING *;

-- name: DeletePlannerDayMark :exec
DELETE FROM planner_day_mark
WHERE workspace_id = $1
  AND mark_date = $2;

-- name: MarkPlannerEntriesForIssueStatus :many
UPDATE planner_entry SET
    status = $2,
    updated_at = now()
WHERE issue_id = $1
  AND status <> $2
RETURNING *;
