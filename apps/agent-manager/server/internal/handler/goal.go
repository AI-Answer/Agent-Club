package handler

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

type GoalResponse struct {
	ID            string  `json:"id"`
	WorkspaceID   string  `json:"workspace_id"`
	ProjectID     string  `json:"project_id"`
	Title         string  `json:"title"`
	Description   *string `json:"description"`
	Status        string  `json:"status"`
	PlannerType   *string `json:"planner_type"`
	PlannerID     *string `json:"planner_id"`
	CreatedByType string  `json:"created_by_type"`
	CreatedByID   string  `json:"created_by_id"`
	CreatedAt     string  `json:"created_at"`
	UpdatedAt     string  `json:"updated_at"`
}

type CreateGoalRequest struct {
	ProjectID   string  `json:"project_id"`
	Title       string  `json:"title"`
	Description *string `json:"description"`
	Status      string  `json:"status"`
	PlannerType *string `json:"planner_type"`
	PlannerID   *string `json:"planner_id"`
}

type UpdateGoalRequest struct {
	ProjectID   *string `json:"project_id"`
	Title       *string `json:"title"`
	Description *string `json:"description"`
	Status      *string `json:"status"`
	PlannerType *string `json:"planner_type"`
	PlannerID   *string `json:"planner_id"`
}

type GoalReadinessActor struct {
	Type          string  `json:"type"`
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	AgentID       *string `json:"agent_id,omitempty"`
	RuntimeID     *string `json:"runtime_id,omitempty"`
	RuntimeStatus string  `json:"runtime_status,omitempty"`
	Enabled       bool    `json:"enabled"`
	Reason        *string `json:"reason,omitempty"`
}

type GoalReadinessRole struct {
	Role          string               `json:"role"`
	Label         string               `json:"label"`
	Required      bool                 `json:"required"`
	Status        string               `json:"status"`
	Actor         *GoalReadinessActor  `json:"actor,omitempty"`
	Candidates    []GoalReadinessActor `json:"candidates"`
	MissingReason *string              `json:"missing_reason,omitempty"`
}

type GoalReadinessResponse struct {
	GoalID string              `json:"goal_id"`
	Ready  bool                `json:"ready"`
	Roles  []GoalReadinessRole `json:"roles"`
}

type ExpandGoalRequest struct {
	PlannerType *string `json:"planner_type"`
	PlannerID   *string `json:"planner_id"`
	Prompt      *string `json:"prompt"`
}

type ExpandGoalResponse struct {
	TaskID    string                `json:"task_id"`
	Readiness GoalReadinessResponse `json:"readiness"`
}

func goalToResponse(g db.Goal) GoalResponse {
	return GoalResponse{
		ID:            uuidToString(g.ID),
		WorkspaceID:   uuidToString(g.WorkspaceID),
		ProjectID:     uuidToString(g.ProjectID),
		Title:         g.Title,
		Description:   textToPtr(g.Description),
		Status:        g.Status,
		PlannerType:   textToPtr(g.PlannerType),
		PlannerID:     uuidToPtr(g.PlannerID),
		CreatedByType: g.CreatedByType,
		CreatedByID:   uuidToString(g.CreatedByID),
		CreatedAt:     timestampToString(g.CreatedAt),
		UpdatedAt:     timestampToString(g.UpdatedAt),
	}
}

func validGoalStatus(status string) bool {
	switch status {
	case "planned", "in_progress", "paused", "completed", "cancelled":
		return true
	default:
		return false
	}
}

func validGoalPlannerType(plannerType string) bool {
	switch plannerType {
	case "member", "agent", "squad":
		return true
	default:
		return false
	}
}

func (h *Handler) ListGoals(w http.ResponseWriter, r *http.Request) {
	wsUUID, ok := parseUUIDOrBadRequest(w, h.resolveWorkspaceID(r), "workspace_id")
	if !ok {
		return
	}

	params := db.ListGoalsParams{WorkspaceID: wsUUID}
	if projectID := r.URL.Query().Get("project_id"); projectID != "" {
		projectUUID, ok := parseUUIDOrBadRequest(w, projectID, "project_id")
		if !ok {
			return
		}
		params.ProjectID = projectUUID
	}
	if status := strings.TrimSpace(r.URL.Query().Get("status")); status != "" {
		if !validGoalStatus(status) {
			writeError(w, http.StatusBadRequest, "invalid status")
			return
		}
		params.Status = pgtype.Text{String: status, Valid: true}
	}

	goals, err := h.Queries.ListGoals(r.Context(), params)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list goals")
		return
	}
	resp := make([]GoalResponse, len(goals))
	for i, goal := range goals {
		resp[i] = goalToResponse(goal)
	}
	writeJSON(w, http.StatusOK, map[string]any{"goals": resp, "total": len(resp)})
}

func (h *Handler) GetGoal(w http.ResponseWriter, r *http.Request) {
	idUUID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "id"), "goal id")
	if !ok {
		return
	}
	wsUUID, ok := parseUUIDOrBadRequest(w, h.resolveWorkspaceID(r), "workspace_id")
	if !ok {
		return
	}
	goal, err := h.Queries.GetGoalInWorkspace(r.Context(), db.GetGoalInWorkspaceParams{
		ID:          idUUID,
		WorkspaceID: wsUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "goal not found")
		return
	}
	writeJSON(w, http.StatusOK, goalToResponse(goal))
}

func (h *Handler) CreateGoal(w http.ResponseWriter, r *http.Request) {
	var req CreateGoalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	title := strings.TrimSpace(req.Title)
	if title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}
	if strings.TrimSpace(req.ProjectID) == "" {
		writeError(w, http.StatusBadRequest, "project_id is required")
		return
	}

	wsUUID, ok := parseUUIDOrBadRequest(w, h.resolveWorkspaceID(r), "workspace_id")
	if !ok {
		return
	}
	projectUUID, ok := parseUUIDOrBadRequest(w, req.ProjectID, "project_id")
	if !ok {
		return
	}
	if _, err := h.Queries.GetProjectInWorkspace(r.Context(), db.GetProjectInWorkspaceParams{
		ID:          projectUUID,
		WorkspaceID: wsUUID,
	}); err != nil {
		writeError(w, http.StatusNotFound, "project not found")
		return
	}
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	creatorUUID, ok := parseUUIDOrBadRequest(w, userID, "user_id")
	if !ok {
		return
	}

	status := strings.TrimSpace(req.Status)
	if status == "" {
		status = "planned"
	}
	if !validGoalStatus(status) {
		writeError(w, http.StatusBadRequest, "invalid status")
		return
	}

	plannerType, plannerID, ok := parseGoalPlanner(w, req.PlannerType, req.PlannerID)
	if !ok {
		return
	}
	goal, err := h.Queries.CreateGoal(r.Context(), db.CreateGoalParams{
		WorkspaceID:   wsUUID,
		ProjectID:     projectUUID,
		Title:         title,
		Description:   ptrToText(req.Description),
		Status:        status,
		PlannerType:   plannerType,
		PlannerID:     plannerID,
		CreatedByType: "member",
		CreatedByID:   creatorUUID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create goal")
		return
	}
	writeJSON(w, http.StatusCreated, goalToResponse(goal))
}

func (h *Handler) UpdateGoal(w http.ResponseWriter, r *http.Request) {
	idUUID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "id"), "goal id")
	if !ok {
		return
	}
	wsUUID, ok := parseUUIDOrBadRequest(w, h.resolveWorkspaceID(r), "workspace_id")
	if !ok {
		return
	}
	prevGoal, err := h.Queries.GetGoalInWorkspace(r.Context(), db.GetGoalInWorkspaceParams{
		ID:          idUUID,
		WorkspaceID: wsUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "goal not found")
		return
	}

	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to read request body")
		return
	}
	var req UpdateGoalRequest
	if err := json.Unmarshal(bodyBytes, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	var rawFields map[string]json.RawMessage
	json.Unmarshal(bodyBytes, &rawFields)

	params := db.UpdateGoalParams{
		ID:          prevGoal.ID,
		Description: prevGoal.Description,
		PlannerType: prevGoal.PlannerType,
		PlannerID:   prevGoal.PlannerID,
	}
	if req.ProjectID != nil {
		projectUUID, ok := parseUUIDOrBadRequest(w, *req.ProjectID, "project_id")
		if !ok {
			return
		}
		if _, err := h.Queries.GetProjectInWorkspace(r.Context(), db.GetProjectInWorkspaceParams{
			ID:          projectUUID,
			WorkspaceID: wsUUID,
		}); err != nil {
			writeError(w, http.StatusNotFound, "project not found")
			return
		}
		params.ProjectID = projectUUID
	}
	if req.Title != nil {
		title := strings.TrimSpace(*req.Title)
		if title == "" {
			writeError(w, http.StatusBadRequest, "title is required")
			return
		}
		params.Title = pgtype.Text{String: title, Valid: true}
	}
	if req.Status != nil {
		status := strings.TrimSpace(*req.Status)
		if !validGoalStatus(status) {
			writeError(w, http.StatusBadRequest, "invalid status")
			return
		}
		params.Status = pgtype.Text{String: status, Valid: true}
	}
	if _, ok := rawFields["description"]; ok {
		params.Description = ptrToText(req.Description)
	}
	if _, ok := rawFields["planner_type"]; ok {
		if req.PlannerType != nil {
			plannerType := strings.TrimSpace(*req.PlannerType)
			if !validGoalPlannerType(plannerType) {
				writeError(w, http.StatusBadRequest, "invalid planner_type")
				return
			}
			params.PlannerType = pgtype.Text{String: plannerType, Valid: true}
		} else {
			params.PlannerType = pgtype.Text{Valid: false}
		}
	}
	if _, ok := rawFields["planner_id"]; ok {
		if req.PlannerID != nil {
			plannerUUID, ok := parseUUIDOrBadRequest(w, *req.PlannerID, "planner_id")
			if !ok {
				return
			}
			params.PlannerID = plannerUUID
		} else {
			params.PlannerID = pgtype.UUID{Valid: false}
		}
	}
	if params.PlannerType.Valid != params.PlannerID.Valid {
		writeError(w, http.StatusBadRequest, "planner_type and planner_id must be set together")
		return
	}

	goal, err := h.Queries.UpdateGoal(r.Context(), params)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update goal")
		return
	}
	writeJSON(w, http.StatusOK, goalToResponse(goal))
}

func (h *Handler) DeleteGoal(w http.ResponseWriter, r *http.Request) {
	idUUID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "id"), "goal id")
	if !ok {
		return
	}
	wsUUID, ok := parseUUIDOrBadRequest(w, h.resolveWorkspaceID(r), "workspace_id")
	if !ok {
		return
	}
	goal, err := h.Queries.GetGoalInWorkspace(r.Context(), db.GetGoalInWorkspaceParams{
		ID:          idUUID,
		WorkspaceID: wsUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "goal not found")
		return
	}
	if _, ok := requireUserID(w, r); !ok {
		return
	}
	if err := h.Queries.DeleteGoal(r.Context(), goal.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete goal")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) GetGoalReadiness(w http.ResponseWriter, r *http.Request) {
	goal, ok := h.loadGoalForRequest(w, r)
	if !ok {
		return
	}
	readiness, err := h.buildGoalReadiness(r.Context(), goal, nil, nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to check goal readiness")
		return
	}
	writeJSON(w, http.StatusOK, readiness)
}

func (h *Handler) ExpandGoal(w http.ResponseWriter, r *http.Request) {
	goal, ok := h.loadGoalForRequest(w, r)
	if !ok {
		return
	}
	var req ExpandGoalRequest
	if r.Body != nil {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil && err != io.EOF {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
	}
	requesterID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	requesterUUID, ok := parseUUIDOrBadRequest(w, requesterID, "user_id")
	if !ok {
		return
	}
	readiness, err := h.buildGoalReadiness(r.Context(), goal, req.PlannerType, req.PlannerID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to check goal readiness")
		return
	}
	planner := readiness.plannerActor()
	if !readiness.Ready || planner == nil {
		writeJSON(w, http.StatusConflict, map[string]any{
			"error":     "goal is missing required enabled agents",
			"readiness": readiness,
		})
		return
	}
	agentIDRaw := planner.ID
	squadUUID := pgtype.UUID{}
	if planner.Type == "squad" {
		if planner.AgentID == nil || *planner.AgentID == "" {
			writeError(w, http.StatusConflict, "selected squad has no enabled leader agent")
			return
		}
		agentIDRaw = *planner.AgentID
		parsedSquad, ok := parseUUIDOrBadRequest(w, planner.ID, "squad_id")
		if !ok {
			return
		}
		squadUUID = parsedSquad
	}
	agentUUID, ok := parseUUIDOrBadRequest(w, agentIDRaw, "agent_id")
	if !ok {
		return
	}
	prompt := ""
	if req.Prompt != nil {
		prompt = strings.TrimSpace(*req.Prompt)
	}
	task, err := h.TaskService.EnqueueGoalExpansionTask(r.Context(), goal.WorkspaceID, requesterUUID, goal, agentUUID, squadUUID, prompt)
	if err != nil {
		writeError(w, http.StatusConflict, err.Error())
		return
	}
	writeJSON(w, http.StatusAccepted, ExpandGoalResponse{
		TaskID:    uuidToString(task.ID),
		Readiness: readiness,
	})
}

func (h *Handler) loadGoalForRequest(w http.ResponseWriter, r *http.Request) (db.Goal, bool) {
	idUUID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "id"), "goal id")
	if !ok {
		return db.Goal{}, false
	}
	wsUUID, ok := parseUUIDOrBadRequest(w, h.resolveWorkspaceID(r), "workspace_id")
	if !ok {
		return db.Goal{}, false
	}
	goal, err := h.Queries.GetGoalInWorkspace(r.Context(), db.GetGoalInWorkspaceParams{
		ID:          idUUID,
		WorkspaceID: wsUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "goal not found")
		return db.Goal{}, false
	}
	return goal, true
}

func (h *Handler) buildGoalReadiness(ctx context.Context, goal db.Goal, overrideType, overrideID *string) (GoalReadinessResponse, error) {
	actors, err := h.goalReadinessActors(ctx, goal.WorkspaceID)
	if err != nil {
		return GoalReadinessResponse{}, err
	}
	enabled := make([]GoalReadinessActor, 0, len(actors))
	for _, actor := range actors {
		if actor.Enabled {
			enabled = append(enabled, actor)
		}
	}

	plannerType, plannerID := textToPtr(goal.PlannerType), uuidToPtr(goal.PlannerID)
	if overrideType != nil || overrideID != nil {
		plannerType, plannerID = overrideType, overrideID
	}
	planner, plannerReason := selectGoalPlanner(actors, enabled, plannerType, plannerID)
	workerCandidates := enabled
	reviewerCandidates := enabled
	if planner != nil {
		reviewerCandidates = enabledExcept(enabled, *planner)
	}

	plannerRole := GoalReadinessRole{
		Role:       "planner",
		Label:      "Planner",
		Required:   true,
		Status:     "ready",
		Actor:      planner,
		Candidates: enabled,
	}
	if planner == nil {
		plannerRole.Status = "missing"
		plannerRole.MissingReason = plannerReason
	}

	workerRole := GoalReadinessRole{
		Role:       "worker",
		Label:      "Workers",
		Required:   true,
		Status:     "ready",
		Candidates: workerCandidates,
	}
	if len(workerCandidates) == 0 {
		workerRole.Status = "missing"
		workerRole.MissingReason = strPtr("No enabled local agent or squad can receive goal work.")
	}

	reviewerRole := GoalReadinessRole{
		Role:       "reviewer",
		Label:      "Reviewer",
		Required:   true,
		Status:     "ready",
		Candidates: reviewerCandidates,
	}
	if len(reviewerCandidates) == 0 {
		reviewerRole.Status = "missing"
		reviewerRole.MissingReason = strPtr("Add or enable a second local agent or squad so review is separate from planning.")
	}

	resp := GoalReadinessResponse{
		GoalID: uuidToString(goal.ID),
		Roles:  []GoalReadinessRole{plannerRole, workerRole, reviewerRole},
	}
	resp.Ready = plannerRole.Status == "ready" && workerRole.Status == "ready" && reviewerRole.Status == "ready"
	return resp, nil
}

func (r GoalReadinessResponse) plannerActor() *GoalReadinessActor {
	for i := range r.Roles {
		if r.Roles[i].Role == "planner" {
			return r.Roles[i].Actor
		}
	}
	return nil
}

func (h *Handler) goalReadinessActors(ctx context.Context, workspaceID pgtype.UUID) ([]GoalReadinessActor, error) {
	agents, err := h.Queries.ListAgents(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	actors := make([]GoalReadinessActor, 0, len(agents))
	agentByID := make(map[string]db.Agent, len(agents))
	agentActorByID := make(map[string]GoalReadinessActor, len(agents))
	for _, agent := range agents {
		actor := h.goalReadinessActorForAgent(ctx, agent)
		actors = append(actors, actor)
		id := uuidToString(agent.ID)
		agentByID[id] = agent
		agentActorByID[id] = actor
	}

	squads, err := h.Queries.ListSquads(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	for _, squad := range squads {
		leaderID := uuidToString(squad.LeaderID)
		leaderActor, ok := agentActorByID[leaderID]
		if !ok {
			if leader, found := agentByID[leaderID]; found {
				leaderActor = h.goalReadinessActorForAgent(ctx, leader)
			} else {
				leaderActor = GoalReadinessActor{
					Type:    "agent",
					ID:      leaderID,
					Name:    "Unknown squad leader",
					Enabled: false,
					Reason:  strPtr("Squad leader agent is missing or archived."),
				}
			}
		}
		actor := GoalReadinessActor{
			Type:          "squad",
			ID:            uuidToString(squad.ID),
			Name:          squad.Name,
			AgentID:       strPtr(leaderID),
			RuntimeID:     leaderActor.RuntimeID,
			RuntimeStatus: leaderActor.RuntimeStatus,
			Enabled:       leaderActor.Enabled,
			Reason:        leaderActor.Reason,
		}
		if !actor.Enabled && actor.Reason == nil {
			actor.Reason = strPtr("Squad leader is not ready.")
		}
		actors = append(actors, actor)
	}
	return actors, nil
}

func (h *Handler) goalReadinessActorForAgent(ctx context.Context, agent db.Agent) GoalReadinessActor {
	actor := GoalReadinessActor{
		Type:    "agent",
		ID:      uuidToString(agent.ID),
		Name:    agent.Name,
		Enabled: true,
	}
	if agent.ArchivedAt.Valid {
		actor.Enabled = false
		actor.Reason = strPtr("Agent is archived.")
		return actor
	}
	if !agent.RuntimeID.Valid {
		actor.Enabled = false
		actor.Reason = strPtr("Agent has no local runtime.")
		return actor
	}
	runtimeID := uuidToString(agent.RuntimeID)
	actor.RuntimeID = strPtr(runtimeID)
	runtime, err := h.Queries.GetAgentRuntimeForWorkspace(ctx, db.GetAgentRuntimeForWorkspaceParams{
		ID:          agent.RuntimeID,
		WorkspaceID: agent.WorkspaceID,
	})
	if err != nil {
		actor.Enabled = false
		actor.Reason = strPtr("Agent runtime could not be found.")
		return actor
	}
	actor.RuntimeStatus = runtime.Status
	if runtime.Status != "online" {
		actor.Enabled = false
		actor.Reason = strPtr("Agent runtime is offline.")
	}
	return actor
}

func selectGoalPlanner(all, enabled []GoalReadinessActor, plannerType, plannerID *string) (*GoalReadinessActor, *string) {
	if plannerType != nil && plannerID != nil && strings.TrimSpace(*plannerType) != "" && strings.TrimSpace(*plannerID) != "" {
		if *plannerType == "member" {
			if actor := firstEnabledActor(enabled); actor != nil {
				return actor, nil
			}
			return nil, strPtr("Goal planner is a member, but no enabled local agent or squad is available to run expansion.")
		}
		for _, actor := range all {
			if actor.Type == *plannerType && actor.ID == *plannerID {
				if actor.Enabled {
					a := actor
					return &a, nil
				}
				if actor.Reason != nil {
					return nil, actor.Reason
				}
				return nil, strPtr("Selected planner is not enabled.")
			}
		}
		return nil, strPtr("Selected planner agent or squad was not found.")
	}
	if actor := firstEnabledActor(enabled); actor != nil {
		return actor, nil
	}
	return nil, strPtr("No enabled local agent or squad can run goal expansion.")
}

func firstEnabledActor(enabled []GoalReadinessActor) *GoalReadinessActor {
	for _, actor := range enabled {
		if actor.Type == "agent" {
			a := actor
			return &a
		}
	}
	if len(enabled) > 0 {
		a := enabled[0]
		return &a
	}
	return nil
}

func enabledExcept(enabled []GoalReadinessActor, selected GoalReadinessActor) []GoalReadinessActor {
	out := make([]GoalReadinessActor, 0, len(enabled))
	for _, actor := range enabled {
		if actor.Type == selected.Type && actor.ID == selected.ID {
			continue
		}
		out = append(out, actor)
	}
	return out
}

func strPtr(s string) *string { return &s }

func parseGoalPlanner(w http.ResponseWriter, plannerTypePtr, plannerIDPtr *string) (pgtype.Text, pgtype.UUID, bool) {
	if plannerTypePtr == nil && plannerIDPtr == nil {
		return pgtype.Text{}, pgtype.UUID{}, true
	}
	if plannerTypePtr == nil || plannerIDPtr == nil {
		writeError(w, http.StatusBadRequest, "planner_type and planner_id must be set together")
		return pgtype.Text{}, pgtype.UUID{}, false
	}
	plannerType := strings.TrimSpace(*plannerTypePtr)
	if !validGoalPlannerType(plannerType) {
		writeError(w, http.StatusBadRequest, "invalid planner_type")
		return pgtype.Text{}, pgtype.UUID{}, false
	}
	plannerID, ok := parseUUIDOrBadRequest(w, *plannerIDPtr, "planner_id")
	if !ok {
		return pgtype.Text{}, pgtype.UUID{}, false
	}
	return pgtype.Text{String: plannerType, Valid: true}, plannerID, true
}
