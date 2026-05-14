package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

const plannerDateLayout = "2006-01-02"

type PlannerMonthResponse struct {
	ID          string          `json:"id"`
	WorkspaceID string          `json:"workspace_id"`
	Year        int32           `json:"year"`
	Month       int32           `json:"month"`
	Title       string          `json:"title"`
	TabColor    *string         `json:"tab_color"`
	Objectives  []string        `json:"objectives"`
	Notes       []string        `json:"notes"`
	Settings    json.RawMessage `json:"settings"`
	CreatedAt   string          `json:"created_at"`
	UpdatedAt   string          `json:"updated_at"`
}

type PlannerEntryResponse struct {
	ID             string  `json:"id"`
	WorkspaceID    string  `json:"workspace_id"`
	PlannerMonthID string  `json:"planner_month_id"`
	EntryDate      string  `json:"entry_date"`
	Title          string  `json:"title"`
	Body           *string `json:"body"`
	Color          *string `json:"color"`
	Status         string  `json:"status"`
	Priority       string  `json:"priority"`
	Position       float64 `json:"position"`
	ProjectID      *string `json:"project_id"`
	GoalID         *string `json:"goal_id"`
	IssueID        *string `json:"issue_id"`
	AssigneeType   *string `json:"assignee_type"`
	AssigneeID     *string `json:"assignee_id"`
	CreatedByType  string  `json:"created_by_type"`
	CreatedByID    *string `json:"created_by_id"`
	CreatedAt      string  `json:"created_at"`
	UpdatedAt      string  `json:"updated_at"`
}

type PlannerDayMarkResponse struct {
	ID             string  `json:"id"`
	WorkspaceID    string  `json:"workspace_id"`
	PlannerMonthID string  `json:"planner_month_id"`
	MarkDate       string  `json:"mark_date"`
	Color          string  `json:"color"`
	Label          *string `json:"label"`
	CreatedByType  string  `json:"created_by_type"`
	CreatedByID    *string `json:"created_by_id"`
	CreatedAt      string  `json:"created_at"`
	UpdatedAt      string  `json:"updated_at"`
}

type PlannerMonthDetailResponse struct {
	Month    PlannerMonthResponse     `json:"month"`
	Entries  []PlannerEntryResponse   `json:"entries"`
	DayMarks []PlannerDayMarkResponse `json:"day_marks"`
}

type UpdatePlannerMonthRequest struct {
	Title      *string          `json:"title"`
	TabColor   *string          `json:"tab_color"`
	Objectives []string         `json:"objectives"`
	Notes      []string         `json:"notes"`
	Settings   *json.RawMessage `json:"settings"`
}

type CreatePlannerEntryRequest struct {
	EntryDate    string   `json:"entry_date"`
	Title        string   `json:"title"`
	Body         *string  `json:"body"`
	Color        *string  `json:"color"`
	Status       string   `json:"status"`
	Priority     string   `json:"priority"`
	Position     *float64 `json:"position"`
	ProjectID    *string  `json:"project_id"`
	GoalID       *string  `json:"goal_id"`
	IssueID      *string  `json:"issue_id"`
	AssigneeType *string  `json:"assignee_type"`
	AssigneeID   *string  `json:"assignee_id"`
}

type UpdatePlannerEntryRequest struct {
	EntryDate    *string  `json:"entry_date"`
	Title        *string  `json:"title"`
	Body         *string  `json:"body"`
	Color        *string  `json:"color"`
	Status       *string  `json:"status"`
	Priority     *string  `json:"priority"`
	Position     *float64 `json:"position"`
	ProjectID    *string  `json:"project_id"`
	GoalID       *string  `json:"goal_id"`
	IssueID      *string  `json:"issue_id"`
	AssigneeType *string  `json:"assignee_type"`
	AssigneeID   *string  `json:"assignee_id"`
}

type UpdatePlannerDayMarkRequest struct {
	Color string  `json:"color"`
	Label *string `json:"label"`
}

type PlannerContextResponse struct {
	Date       string                  `json:"date"`
	Month      PlannerMonthResponse    `json:"month"`
	Entries    []PlannerEntryResponse  `json:"entries"`
	DayMark    *PlannerDayMarkResponse `json:"day_mark"`
	Objectives []string                `json:"objectives"`
	Notes      []string                `json:"notes"`
}

func monthTitle(year int32, month int32) string {
	if month < 1 || month > 12 {
		return strconv.Itoa(int(year))
	}
	return time.Month(month).String()
}

func decodeStringArray(raw []byte) []string {
	var out []string
	if len(raw) == 0 {
		return []string{}
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return []string{}
	}
	return out
}

func encodeStringArray(values []string) []byte {
	if values == nil {
		values = []string{}
	}
	raw, err := json.Marshal(values)
	if err != nil {
		return []byte("[]")
	}
	return raw
}

func defaultJSON(raw []byte, fallback string) json.RawMessage {
	if len(raw) == 0 {
		return json.RawMessage(fallback)
	}
	return json.RawMessage(raw)
}

func plannerMonthToResponse(m db.PlannerMonth) PlannerMonthResponse {
	return PlannerMonthResponse{
		ID:          uuidToString(m.ID),
		WorkspaceID: uuidToString(m.WorkspaceID),
		Year:        m.Year,
		Month:       m.Month,
		Title:       m.Title,
		TabColor:    textToPtr(m.TabColor),
		Objectives:  decodeStringArray(m.Objectives),
		Notes:       decodeStringArray(m.Notes),
		Settings:    defaultJSON(m.Settings, "{}"),
		CreatedAt:   timestampToString(m.CreatedAt),
		UpdatedAt:   timestampToString(m.UpdatedAt),
	}
}

func plannerEntryToResponse(e db.PlannerEntry) PlannerEntryResponse {
	return PlannerEntryResponse{
		ID:             uuidToString(e.ID),
		WorkspaceID:    uuidToString(e.WorkspaceID),
		PlannerMonthID: uuidToString(e.PlannerMonthID),
		EntryDate:      e.EntryDate.Time.Format(plannerDateLayout),
		Title:          e.Title,
		Body:           textToPtr(e.Body),
		Color:          textToPtr(e.Color),
		Status:         e.Status,
		Priority:       e.Priority,
		Position:       e.Position,
		ProjectID:      uuidToPtr(e.ProjectID),
		GoalID:         uuidToPtr(e.GoalID),
		IssueID:        uuidToPtr(e.IssueID),
		AssigneeType:   textToPtr(e.AssigneeType),
		AssigneeID:     uuidToPtr(e.AssigneeID),
		CreatedByType:  e.CreatedByType,
		CreatedByID:    uuidToPtr(e.CreatedByID),
		CreatedAt:      timestampToString(e.CreatedAt),
		UpdatedAt:      timestampToString(e.UpdatedAt),
	}
}

func plannerDayMarkToResponse(mark db.PlannerDayMark) PlannerDayMarkResponse {
	return PlannerDayMarkResponse{
		ID:             uuidToString(mark.ID),
		WorkspaceID:    uuidToString(mark.WorkspaceID),
		PlannerMonthID: uuidToString(mark.PlannerMonthID),
		MarkDate:       mark.MarkDate.Time.Format(plannerDateLayout),
		Color:          mark.Color,
		Label:          textToPtr(mark.Label),
		CreatedByType:  mark.CreatedByType,
		CreatedByID:    uuidToPtr(mark.CreatedByID),
		CreatedAt:      timestampToString(mark.CreatedAt),
		UpdatedAt:      timestampToString(mark.UpdatedAt),
	}
}

func plannerEntriesToResponse(entries []db.PlannerEntry) []PlannerEntryResponse {
	resp := make([]PlannerEntryResponse, len(entries))
	for i, entry := range entries {
		resp[i] = plannerEntryToResponse(entry)
	}
	return resp
}

func plannerDayMarksToResponse(marks []db.PlannerDayMark) []PlannerDayMarkResponse {
	resp := make([]PlannerDayMarkResponse, len(marks))
	for i, mark := range marks {
		resp[i] = plannerDayMarkToResponse(mark)
	}
	return resp
}

func validPlannerStatus(status string) bool {
	switch status {
	case "planned", "queued", "working", "done", "blocked", "skipped":
		return true
	default:
		return false
	}
}

func validPlannerPriority(priority string) bool {
	switch priority {
	case "urgent", "high", "medium", "low", "none":
		return true
	default:
		return false
	}
}

func validPlannerColor(color string) bool {
	if len(color) != 4 && len(color) != 7 {
		return false
	}
	if !strings.HasPrefix(color, "#") {
		return false
	}
	for _, ch := range color[1:] {
		if !((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F')) {
			return false
		}
	}
	return true
}

func parsePlannerDate(value string) (pgtype.Date, bool) {
	t, err := time.Parse(plannerDateLayout, strings.TrimSpace(value))
	if err != nil {
		return pgtype.Date{}, false
	}
	return pgtype.Date{Time: t, Valid: true}, true
}

func (h *Handler) ensurePlannerMonth(ctx context.Context, workspaceID pgtype.UUID, year int32, month int32) (db.PlannerMonth, error) {
	return h.Queries.UpsertPlannerMonth(ctx, db.UpsertPlannerMonthParams{
		WorkspaceID: workspaceID,
		Year:        year,
		Month:       month,
		Title:       monthTitle(year, month),
		TabColor:    pgtype.Text{},
		Objectives:  []byte("[]"),
		Notes:       []byte("[]"),
		Settings:    []byte("{}"),
	})
}

func parseYearMonth(w http.ResponseWriter, r *http.Request) (int32, int32, bool) {
	year64, err := strconv.ParseInt(chi.URLParam(r, "year"), 10, 32)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid year")
		return 0, 0, false
	}
	month64, err := strconv.ParseInt(chi.URLParam(r, "month"), 10, 32)
	if err != nil || month64 < 1 || month64 > 12 {
		writeError(w, http.StatusBadRequest, "invalid month")
		return 0, 0, false
	}
	return int32(year64), int32(month64), true
}

func textParam(value *string) pgtype.Text {
	if value == nil {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *value, Valid: true}
}

func trimmedTextParam(value *string) pgtype.Text {
	if value == nil {
		return pgtype.Text{}
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: trimmed, Valid: true}
}

func uuidParam(w http.ResponseWriter, value *string, field string) (pgtype.UUID, bool) {
	if value == nil || strings.TrimSpace(*value) == "" {
		return pgtype.UUID{}, true
	}
	return parseUUIDOrBadRequest(w, *value, field)
}

func positionValue(value *float64) float64 {
	if value == nil {
		return 0
	}
	return *value
}

func (h *Handler) validatePlannerLinks(ctx context.Context, w http.ResponseWriter, workspaceID pgtype.UUID, projectID, goalID, issueID pgtype.UUID) bool {
	if projectID.Valid {
		if _, err := h.Queries.GetProjectInWorkspace(ctx, db.GetProjectInWorkspaceParams{ID: projectID, WorkspaceID: workspaceID}); err != nil {
			writeError(w, http.StatusBadRequest, "project not found in this workspace")
			return false
		}
	}
	if goalID.Valid {
		goal, err := h.Queries.GetGoalInWorkspace(ctx, db.GetGoalInWorkspaceParams{ID: goalID, WorkspaceID: workspaceID})
		if err != nil {
			writeError(w, http.StatusBadRequest, "goal not found in this workspace")
			return false
		}
		if projectID.Valid && goal.ProjectID != projectID {
			writeError(w, http.StatusBadRequest, "goal does not belong to project_id")
			return false
		}
	}
	if issueID.Valid {
		issue, err := h.Queries.GetIssueInWorkspace(ctx, db.GetIssueInWorkspaceParams{ID: issueID, WorkspaceID: workspaceID})
		if err != nil {
			writeError(w, http.StatusBadRequest, "issue not found in this workspace")
			return false
		}
		if projectID.Valid && issue.ProjectID.Valid && issue.ProjectID != projectID {
			writeError(w, http.StatusBadRequest, "issue does not belong to project_id")
			return false
		}
		if goalID.Valid && issue.GoalID.Valid && issue.GoalID != goalID {
			writeError(w, http.StatusBadRequest, "issue does not belong to goal_id")
			return false
		}
	}
	return true
}

func (h *Handler) ListPlannerMonths(w http.ResponseWriter, r *http.Request) {
	wsUUID, ok := parseUUIDOrBadRequest(w, h.resolveWorkspaceID(r), "workspace_id")
	if !ok {
		return
	}
	year := int32(time.Now().Year())
	if raw := strings.TrimSpace(r.URL.Query().Get("year")); raw != "" {
		parsed, err := strconv.ParseInt(raw, 10, 32)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid year")
			return
		}
		year = int32(parsed)
	}
	months, err := h.Queries.ListPlannerMonths(r.Context(), db.ListPlannerMonthsParams{
		WorkspaceID: wsUUID,
		Year:        year,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list planner months")
		return
	}
	resp := make([]PlannerMonthResponse, len(months))
	for i, month := range months {
		resp[i] = plannerMonthToResponse(month)
	}
	writeJSON(w, http.StatusOK, map[string]any{"months": resp, "total": len(resp)})
}

func (h *Handler) GetPlannerMonth(w http.ResponseWriter, r *http.Request) {
	wsUUID, ok := parseUUIDOrBadRequest(w, h.resolveWorkspaceID(r), "workspace_id")
	if !ok {
		return
	}
	year, monthNumber, ok := parseYearMonth(w, r)
	if !ok {
		return
	}
	month, err := h.ensurePlannerMonth(r.Context(), wsUUID, year, monthNumber)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load planner month")
		return
	}
	entries, err := h.Queries.ListPlannerEntriesForMonth(r.Context(), db.ListPlannerEntriesForMonthParams{
		WorkspaceID:    wsUUID,
		PlannerMonthID: month.ID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list planner entries")
		return
	}
	dayMarks, err := h.Queries.ListPlannerDayMarksForMonth(r.Context(), db.ListPlannerDayMarksForMonthParams{
		WorkspaceID:    wsUUID,
		PlannerMonthID: month.ID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list planner day marks")
		return
	}
	writeJSON(w, http.StatusOK, PlannerMonthDetailResponse{
		Month:    plannerMonthToResponse(month),
		Entries:  plannerEntriesToResponse(entries),
		DayMarks: plannerDayMarksToResponse(dayMarks),
	})
}

func (h *Handler) UpdatePlannerMonth(w http.ResponseWriter, r *http.Request) {
	wsUUID, ok := parseUUIDOrBadRequest(w, h.resolveWorkspaceID(r), "workspace_id")
	if !ok {
		return
	}
	idUUID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "id"), "month id")
	if !ok {
		return
	}
	current, err := h.Queries.GetPlannerMonthByID(r.Context(), db.GetPlannerMonthByIDParams{
		ID:          idUUID,
		WorkspaceID: wsUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "planner month not found")
		return
	}
	var req UpdatePlannerMonthRequest
	raw, err := decodeJSONBodyWithRawFields(r.Body, &req)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	title := current.Title
	if req.Title != nil {
		title = strings.TrimSpace(*req.Title)
		if title == "" {
			writeError(w, http.StatusBadRequest, "title is required")
			return
		}
	}
	tabColor := current.TabColor
	if _, ok := raw["tab_color"]; ok {
		tabColor = textParam(req.TabColor)
	}
	objectives := current.Objectives
	if _, ok := raw["objectives"]; ok {
		objectives = encodeStringArray(req.Objectives)
	}
	notes := current.Notes
	if _, ok := raw["notes"]; ok {
		notes = encodeStringArray(req.Notes)
	}
	settings := current.Settings
	if req.Settings != nil {
		settings = append([]byte(nil), (*req.Settings)...)
	}
	updated, err := h.Queries.UpdatePlannerMonth(r.Context(), db.UpdatePlannerMonthParams{
		ID:          idUUID,
		WorkspaceID: wsUUID,
		Title:       title,
		TabColor:    tabColor,
		Objectives:  objectives,
		Notes:       notes,
		Settings:    settings,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update planner month")
		return
	}
	writeJSON(w, http.StatusOK, plannerMonthToResponse(updated))
}

func (h *Handler) CreatePlannerEntry(w http.ResponseWriter, r *http.Request) {
	wsUUID, ok := parseUUIDOrBadRequest(w, h.resolveWorkspaceID(r), "workspace_id")
	if !ok {
		return
	}
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	var req CreatePlannerEntryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	date, valid := parsePlannerDate(req.EntryDate)
	if !valid {
		writeError(w, http.StatusBadRequest, "invalid entry_date")
		return
	}
	title := strings.TrimSpace(req.Title)
	if title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}
	status := strings.TrimSpace(req.Status)
	if status == "" {
		status = "planned"
	}
	if !validPlannerStatus(status) {
		writeError(w, http.StatusBadRequest, "invalid status")
		return
	}
	priority := strings.TrimSpace(req.Priority)
	if priority == "" {
		priority = "none"
	}
	if !validPlannerPriority(priority) {
		writeError(w, http.StatusBadRequest, "invalid priority")
		return
	}
	projectID, ok := uuidParam(w, req.ProjectID, "project_id")
	if !ok {
		return
	}
	goalID, ok := uuidParam(w, req.GoalID, "goal_id")
	if !ok {
		return
	}
	issueID, ok := uuidParam(w, req.IssueID, "issue_id")
	if !ok {
		return
	}
	assigneeID, ok := uuidParam(w, req.AssigneeID, "assignee_id")
	if !ok {
		return
	}
	if !h.validatePlannerLinks(r.Context(), w, wsUUID, projectID, goalID, issueID) {
		return
	}
	month, err := h.ensurePlannerMonth(r.Context(), wsUUID, int32(date.Time.Year()), int32(date.Time.Month()))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load planner month")
		return
	}
	creatorType, creatorID := h.resolveActor(r, userID, uuidToString(wsUUID))
	entry, err := h.Queries.CreatePlannerEntry(r.Context(), db.CreatePlannerEntryParams{
		WorkspaceID:    wsUUID,
		PlannerMonthID: month.ID,
		EntryDate:      date,
		Title:          title,
		Body:           textParam(req.Body),
		Color:          textParam(req.Color),
		Status:         status,
		Priority:       priority,
		Position:       positionValue(req.Position),
		ProjectID:      projectID,
		GoalID:         goalID,
		IssueID:        issueID,
		AssigneeType:   textParam(req.AssigneeType),
		AssigneeID:     assigneeID,
		CreatedByType:  creatorType,
		CreatedByID:    parseUUID(creatorID),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create planner entry")
		return
	}
	writeJSON(w, http.StatusCreated, plannerEntryToResponse(entry))
}

func (h *Handler) UpdatePlannerEntry(w http.ResponseWriter, r *http.Request) {
	wsUUID, ok := parseUUIDOrBadRequest(w, h.resolveWorkspaceID(r), "workspace_id")
	if !ok {
		return
	}
	idUUID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "id"), "entry id")
	if !ok {
		return
	}
	current, err := h.Queries.GetPlannerEntryInWorkspace(r.Context(), db.GetPlannerEntryInWorkspaceParams{
		ID:          idUUID,
		WorkspaceID: wsUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "planner entry not found")
		return
	}
	var req UpdatePlannerEntryRequest
	raw, err := decodeJSONBodyWithRawFields(r.Body, &req)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	entryDate := current.EntryDate
	if _, ok := raw["entry_date"]; ok {
		if req.EntryDate == nil {
			writeError(w, http.StatusBadRequest, "entry_date is required")
			return
		}
		parsed, valid := parsePlannerDate(*req.EntryDate)
		if !valid {
			writeError(w, http.StatusBadRequest, "invalid entry_date")
			return
		}
		entryDate = parsed
	}
	title := current.Title
	if req.Title != nil {
		title = strings.TrimSpace(*req.Title)
		if title == "" {
			writeError(w, http.StatusBadRequest, "title is required")
			return
		}
	}
	body := current.Body
	if _, ok := raw["body"]; ok {
		body = textParam(req.Body)
	}
	color := current.Color
	if _, ok := raw["color"]; ok {
		color = textParam(req.Color)
	}
	status := current.Status
	if req.Status != nil {
		status = strings.TrimSpace(*req.Status)
		if !validPlannerStatus(status) {
			writeError(w, http.StatusBadRequest, "invalid status")
			return
		}
	}
	priority := current.Priority
	if req.Priority != nil {
		priority = strings.TrimSpace(*req.Priority)
		if !validPlannerPriority(priority) {
			writeError(w, http.StatusBadRequest, "invalid priority")
			return
		}
	}
	position := current.Position
	if req.Position != nil {
		position = *req.Position
	}
	projectID := current.ProjectID
	if _, ok := raw["project_id"]; ok {
		projectID, ok = uuidParam(w, req.ProjectID, "project_id")
		if !ok {
			return
		}
	}
	goalID := current.GoalID
	if _, ok := raw["goal_id"]; ok {
		goalID, ok = uuidParam(w, req.GoalID, "goal_id")
		if !ok {
			return
		}
	}
	issueID := current.IssueID
	if _, ok := raw["issue_id"]; ok {
		issueID, ok = uuidParam(w, req.IssueID, "issue_id")
		if !ok {
			return
		}
	}
	assigneeType := current.AssigneeType
	if _, ok := raw["assignee_type"]; ok {
		assigneeType = textParam(req.AssigneeType)
	}
	assigneeID := current.AssigneeID
	if _, ok := raw["assignee_id"]; ok {
		assigneeID, ok = uuidParam(w, req.AssigneeID, "assignee_id")
		if !ok {
			return
		}
	}
	if !h.validatePlannerLinks(r.Context(), w, wsUUID, projectID, goalID, issueID) {
		return
	}
	updated, err := h.Queries.UpdatePlannerEntry(r.Context(), db.UpdatePlannerEntryParams{
		ID:           idUUID,
		WorkspaceID:  wsUUID,
		EntryDate:    entryDate,
		Title:        pgtype.Text{String: title, Valid: true},
		Body:         body,
		Color:        color,
		Status:       pgtype.Text{String: status, Valid: true},
		Priority:     pgtype.Text{String: priority, Valid: true},
		Position:     pgtype.Float8{Float64: position, Valid: true},
		ProjectID:    projectID,
		GoalID:       goalID,
		IssueID:      issueID,
		AssigneeType: assigneeType,
		AssigneeID:   assigneeID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update planner entry")
		return
	}
	writeJSON(w, http.StatusOK, plannerEntryToResponse(updated))
}

func (h *Handler) DeletePlannerEntry(w http.ResponseWriter, r *http.Request) {
	wsUUID, ok := parseUUIDOrBadRequest(w, h.resolveWorkspaceID(r), "workspace_id")
	if !ok {
		return
	}
	idUUID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "id"), "entry id")
	if !ok {
		return
	}
	if err := h.Queries.DeletePlannerEntry(r.Context(), db.DeletePlannerEntryParams{
		ID:          idUUID,
		WorkspaceID: wsUUID,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete planner entry")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) UpdatePlannerDayMark(w http.ResponseWriter, r *http.Request) {
	wsUUID, ok := parseUUIDOrBadRequest(w, h.resolveWorkspaceID(r), "workspace_id")
	if !ok {
		return
	}
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	date, valid := parsePlannerDate(chi.URLParam(r, "date"))
	if !valid {
		writeError(w, http.StatusBadRequest, "invalid date")
		return
	}
	var req UpdatePlannerDayMarkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	color := strings.ToLower(strings.TrimSpace(req.Color))
	if !validPlannerColor(color) {
		writeError(w, http.StatusBadRequest, "invalid color")
		return
	}
	month, err := h.ensurePlannerMonth(r.Context(), wsUUID, int32(date.Time.Year()), int32(date.Time.Month()))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load planner month")
		return
	}
	creatorType, creatorID := h.resolveActor(r, userID, uuidToString(wsUUID))
	updated, err := h.Queries.UpsertPlannerDayMark(r.Context(), db.UpsertPlannerDayMarkParams{
		WorkspaceID:    wsUUID,
		PlannerMonthID: month.ID,
		MarkDate:       date,
		Color:          color,
		Label:          trimmedTextParam(req.Label),
		CreatedByType:  creatorType,
		CreatedByID:    parseUUID(creatorID),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update planner day mark")
		return
	}
	writeJSON(w, http.StatusOK, plannerDayMarkToResponse(updated))
}

func (h *Handler) DeletePlannerDayMark(w http.ResponseWriter, r *http.Request) {
	wsUUID, ok := parseUUIDOrBadRequest(w, h.resolveWorkspaceID(r), "workspace_id")
	if !ok {
		return
	}
	date, valid := parsePlannerDate(chi.URLParam(r, "date"))
	if !valid {
		writeError(w, http.StatusBadRequest, "invalid date")
		return
	}
	if err := h.Queries.DeletePlannerDayMark(r.Context(), db.DeletePlannerDayMarkParams{
		WorkspaceID: wsUUID,
		MarkDate:    date,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to clear planner day mark")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) GetPlannerContext(w http.ResponseWriter, r *http.Request) {
	wsUUID, ok := parseUUIDOrBadRequest(w, h.resolveWorkspaceID(r), "workspace_id")
	if !ok {
		return
	}
	rawDate := strings.TrimSpace(r.URL.Query().Get("date"))
	if rawDate == "" {
		rawDate = time.Now().Format(plannerDateLayout)
	}
	date, valid := parsePlannerDate(rawDate)
	if !valid {
		writeError(w, http.StatusBadRequest, "invalid date")
		return
	}
	month, err := h.ensurePlannerMonth(r.Context(), wsUUID, int32(date.Time.Year()), int32(date.Time.Month()))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load planner context")
		return
	}
	entries, err := h.Queries.ListPlannerEntriesForDate(r.Context(), db.ListPlannerEntriesForDateParams{
		WorkspaceID: wsUUID,
		EntryDate:   date,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load planner context")
		return
	}
	var dayMark *PlannerDayMarkResponse
	mark, err := h.Queries.GetPlannerDayMarkForDate(r.Context(), db.GetPlannerDayMarkForDateParams{
		WorkspaceID: wsUUID,
		MarkDate:    date,
	})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusInternalServerError, "failed to load planner context")
		return
	}
	if err == nil {
		resp := plannerDayMarkToResponse(mark)
		dayMark = &resp
	}
	monthResp := plannerMonthToResponse(month)
	writeJSON(w, http.StatusOK, PlannerContextResponse{
		Date:       rawDate,
		Month:      monthResp,
		Entries:    plannerEntriesToResponse(entries),
		DayMark:    dayMark,
		Objectives: monthResp.Objectives,
		Notes:      monthResp.Notes,
	})
}
