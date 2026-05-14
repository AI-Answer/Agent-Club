-- name: ListGoals :many
SELECT * FROM goal
WHERE workspace_id = $1
  AND (sqlc.narg('project_id')::uuid IS NULL OR project_id = sqlc.narg('project_id'))
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
ORDER BY created_at DESC;

-- name: GetGoal :one
SELECT * FROM goal
WHERE id = $1;

-- name: GetGoalInWorkspace :one
SELECT * FROM goal
WHERE id = $1 AND workspace_id = $2;

-- name: CreateGoal :one
INSERT INTO goal (
    workspace_id,
    project_id,
    title,
    description,
    status,
    planner_type,
    planner_id,
    created_by_type,
    created_by_id
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9
) RETURNING *;

-- name: UpdateGoal :one
UPDATE goal SET
    project_id = COALESCE(sqlc.narg('project_id'), project_id),
    title = COALESCE(sqlc.narg('title'), title),
    description = sqlc.narg('description'),
    status = COALESCE(sqlc.narg('status'), status),
    planner_type = sqlc.narg('planner_type'),
    planner_id = sqlc.narg('planner_id'),
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeleteGoal :exec
DELETE FROM goal WHERE id = $1;
