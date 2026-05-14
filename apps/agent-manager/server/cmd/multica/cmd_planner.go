package main

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/multica-ai/multica/server/internal/cli"
)

var plannerCmd = &cobra.Command{
	Use:     "planner",
	Aliases: []string{"plan", "month-map"},
	Short:   "Work with the Month Map planner",
}

var plannerContextCmd = &cobra.Command{
	Use:   "context [date]",
	Short: "Show planner context for a day",
	Args:  cobra.MaximumNArgs(1),
	RunE:  runPlannerContext,
}

var plannerTodayCmd = &cobra.Command{
	Use:   "today",
	Short: "Show today's planner context",
	Args:  cobra.NoArgs,
	RunE:  runPlannerToday,
}

var plannerMonthCmd = &cobra.Command{
	Use:   "month [year] [month]",
	Short: "Show the current Month Map",
	Args:  cobra.MaximumNArgs(2),
	RunE:  runPlannerMonth,
}

var plannerAddCmd = &cobra.Command{
	Use:   "add",
	Short: "Add a task to the Month Map",
	Args:  cobra.NoArgs,
	RunE:  runPlannerAdd,
}

var plannerTop3Cmd = &cobra.Command{
	Use:   "top3",
	Short: "Set today's top tasks in the Month Map",
	Args:  cobra.NoArgs,
	RunE:  runPlannerTop3,
}

var plannerMarkCmd = &cobra.Command{
	Use:   "mark",
	Short: "Highlight a day on the Month Map",
	Args:  cobra.NoArgs,
	RunE:  runPlannerMark,
}

var plannerUnmarkCmd = &cobra.Command{
	Use:   "unmark [date]",
	Short: "Clear a day highlight",
	Args:  cobra.MaximumNArgs(1),
	RunE:  runPlannerUnmark,
}

var plannerDeleteCmd = &cobra.Command{
	Use:   "delete <entry-id>",
	Short: "Delete a planner task",
	Args:  exactArgs(1),
	RunE:  runPlannerDelete,
}

func init() {
	plannerCmd.AddCommand(plannerContextCmd)
	plannerCmd.AddCommand(plannerTodayCmd)
	plannerCmd.AddCommand(plannerMonthCmd)
	plannerCmd.AddCommand(plannerAddCmd)
	plannerCmd.AddCommand(plannerTop3Cmd)
	plannerCmd.AddCommand(plannerMarkCmd)
	plannerCmd.AddCommand(plannerUnmarkCmd)
	plannerCmd.AddCommand(plannerDeleteCmd)

	plannerContextCmd.Flags().String("date", "today", "Date to inspect (today, tomorrow, yesterday, or YYYY-MM-DD)")
	plannerContextCmd.Flags().String("output", "table", "Output format: table or json")

	plannerTodayCmd.Flags().String("output", "table", "Output format: table or json")

	plannerMonthCmd.Flags().Int("year", 0, "Year to inspect")
	plannerMonthCmd.Flags().Int("month", 0, "Month number to inspect")
	plannerMonthCmd.Flags().String("output", "table", "Output format: table or json")

	plannerAddCmd.Flags().String("date", "today", "Task date (today, tomorrow, yesterday, or YYYY-MM-DD)")
	plannerAddCmd.Flags().String("title", "", "Task title (required)")
	plannerAddCmd.Flags().String("body", "", "Task notes or prompt")
	plannerAddCmd.Flags().String("status", "planned", "Task status: planned, queued, working, done, blocked, or skipped")
	plannerAddCmd.Flags().String("priority", "high", "Task priority: urgent, high, medium, low, or none")
	plannerAddCmd.Flags().Float64("position", 0, "Task position within the day")
	plannerAddCmd.Flags().String("project-id", "", "Linked project ID")
	plannerAddCmd.Flags().String("goal-id", "", "Linked goal ID")
	plannerAddCmd.Flags().String("issue-id", "", "Linked issue ID")
	plannerAddCmd.Flags().String("output", "json", "Output format: table or json")

	plannerTop3Cmd.Flags().String("date", "today", "Task date (today, tomorrow, yesterday, or YYYY-MM-DD)")
	plannerTop3Cmd.Flags().StringArray("task", nil, "Top task title; repeat up to three times")
	plannerTop3Cmd.Flags().Bool("replace", false, "Delete existing tasks on the day before adding these tasks")
	plannerTop3Cmd.Flags().String("status", "planned", "Task status: planned, queued, working, done, blocked, or skipped")
	plannerTop3Cmd.Flags().String("priority", "high", "Task priority: urgent, high, medium, low, or none")
	plannerTop3Cmd.Flags().String("output", "json", "Output format: table or json")

	plannerMarkCmd.Flags().String("date", "today", "Date to highlight (today, tomorrow, yesterday, or YYYY-MM-DD)")
	plannerMarkCmd.Flags().String("color", "#fde68a", "Highlight color as #rgb or #rrggbb")
	plannerMarkCmd.Flags().String("label", "", "Optional highlight label")
	plannerMarkCmd.Flags().String("output", "json", "Output format: table or json")

	plannerUnmarkCmd.Flags().String("date", "today", "Date to clear (today, tomorrow, yesterday, or YYYY-MM-DD)")
	plannerUnmarkCmd.Flags().String("output", "json", "Output format: table or json")

	plannerDeleteCmd.Flags().String("output", "json", "Output format: table or json")
}

func runPlannerContext(cmd *cobra.Command, args []string) error {
	rawDate, _ := cmd.Flags().GetString("date")
	if len(args) == 1 {
		rawDate = args[0]
	}
	return runPlannerContextForDate(cmd, rawDate)
}

func runPlannerToday(cmd *cobra.Command, _ []string) error {
	return runPlannerContextForDate(cmd, "today")
}

func runPlannerContextForDate(cmd *cobra.Command, rawDate string) error {
	date, err := plannerDateValue(rawDate)
	if err != nil {
		return err
	}
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	contextResp, err := getPlannerContext(ctx, client, date)
	if err != nil {
		return err
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, contextResp)
	}

	printPlannerContextTable(contextResp)
	return nil
}

func runPlannerMonth(cmd *cobra.Command, args []string) error {
	year, month, err := plannerYearMonth(cmd, args)
	if err != nil {
		return err
	}
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var result map[string]any
	path := fmt.Sprintf("/api/planner/months/%d/%d", year, month)
	if err := client.GetJSON(ctx, path, &result); err != nil {
		return fmt.Errorf("load planner month: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, result)
	}

	printPlannerMonthTable(result)
	return nil
}

func runPlannerAdd(cmd *cobra.Command, _ []string) error {
	date, err := plannerDateFlag(cmd)
	if err != nil {
		return err
	}
	title, _ := cmd.Flags().GetString("title")
	title = strings.TrimSpace(title)
	if title == "" {
		return fmt.Errorf("--title is required")
	}
	status, priority, err := plannerStatusPriority(cmd)
	if err != nil {
		return err
	}
	body, _ := cmd.Flags().GetString("body")
	request := map[string]any{
		"entry_date": date,
		"title":      title,
		"status":     status,
		"priority":   priority,
	}
	if strings.TrimSpace(body) != "" {
		request["body"] = body
	}
	if cmd.Flags().Changed("position") {
		position, _ := cmd.Flags().GetFloat64("position")
		request["position"] = position
	}
	plannerPutStringFlag(cmd, request, "project-id", "project_id")
	plannerPutStringFlag(cmd, request, "goal-id", "goal_id")
	plannerPutStringFlag(cmd, request, "issue-id", "issue_id")

	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var result map[string]any
	if err := client.PostJSON(ctx, "/api/planner/entries", request, &result); err != nil {
		return fmt.Errorf("add planner task: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "table" {
		printPlannerEntriesTable([]map[string]any{result})
		return nil
	}
	return cli.PrintJSON(os.Stdout, result)
}

func runPlannerTop3(cmd *cobra.Command, _ []string) error {
	date, err := plannerDateFlag(cmd)
	if err != nil {
		return err
	}
	tasks, _ := cmd.Flags().GetStringArray("task")
	tasks = plannerCleanTasks(tasks)
	if len(tasks) == 0 {
		return fmt.Errorf("at least one --task is required")
	}
	if len(tasks) > 3 {
		return fmt.Errorf("top3 accepts up to three --task values")
	}
	status, priority, err := plannerStatusPriority(cmd)
	if err != nil {
		return err
	}
	replace, _ := cmd.Flags().GetBool("replace")

	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	contextResp, err := getPlannerContext(ctx, client, date)
	if err != nil {
		return err
	}
	existingEntries := plannerEntriesFromAny(contextResp["entries"])
	if replace {
		for _, entry := range existingEntries {
			id := strVal(entry, "id")
			if id == "" {
				continue
			}
			if err := client.DeleteJSON(ctx, "/api/planner/entries/"+url.PathEscape(id)); err != nil {
				return fmt.Errorf("delete existing planner task %s: %w", id, err)
			}
		}
		existingEntries = nil
	}

	existingByTitle := make(map[string]map[string]any, len(existingEntries))
	for _, entry := range existingEntries {
		key := plannerTitleKey(strVal(entry, "title"))
		if key != "" {
			existingByTitle[key] = entry
		}
	}

	results := make([]map[string]any, 0, len(tasks))
	for i, title := range tasks {
		position := float64(i + 1)
		request := map[string]any{
			"entry_date": date,
			"title":      title,
			"status":     status,
			"priority":   priority,
			"position":   position,
		}

		var result map[string]any
		if existing, ok := existingByTitle[plannerTitleKey(title)]; ok {
			id := strVal(existing, "id")
			if id == "" {
				return fmt.Errorf("existing planner task %q has no id", title)
			}
			if err := client.PutJSON(ctx, "/api/planner/entries/"+url.PathEscape(id), request, &result); err != nil {
				return fmt.Errorf("update planner task %q: %w", title, err)
			}
		} else {
			if err := client.PostJSON(ctx, "/api/planner/entries", request, &result); err != nil {
				return fmt.Errorf("create planner task %q: %w", title, err)
			}
		}
		results = append(results, result)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "table" {
		printPlannerEntriesTable(results)
		return nil
	}
	return cli.PrintJSON(os.Stdout, map[string]any{
		"date":     date,
		"replace":  replace,
		"priority": priority,
		"status":   status,
		"entries":  results,
	})
}

func runPlannerMark(cmd *cobra.Command, _ []string) error {
	date, err := plannerDateFlag(cmd)
	if err != nil {
		return err
	}
	color, _ := cmd.Flags().GetString("color")
	color = strings.ToLower(strings.TrimSpace(color))
	if !plannerValidColor(color) {
		return fmt.Errorf("--color must be a #rgb or #rrggbb color")
	}
	label, _ := cmd.Flags().GetString("label")
	request := map[string]any{
		"color": color,
		"label": plannerOptionalString(label),
	}

	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var result map[string]any
	if err := client.PutJSON(ctx, "/api/planner/day-marks/"+url.PathEscape(date), request, &result); err != nil {
		return fmt.Errorf("highlight planner day: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "table" {
		printPlannerDayMarksTable([]map[string]any{result})
		return nil
	}
	return cli.PrintJSON(os.Stdout, result)
}

func runPlannerUnmark(cmd *cobra.Command, args []string) error {
	rawDate, _ := cmd.Flags().GetString("date")
	if len(args) == 1 {
		rawDate = args[0]
	}
	date, err := plannerDateValue(rawDate)
	if err != nil {
		return err
	}
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := client.DeleteJSON(ctx, "/api/planner/day-marks/"+url.PathEscape(date)); err != nil {
		return fmt.Errorf("clear planner day highlight: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	result := map[string]any{"date": date, "cleared": true}
	if output == "table" {
		cli.PrintTable(os.Stdout, []string{"DATE", "CLEARED"}, [][]string{{date, "true"}})
		return nil
	}
	return cli.PrintJSON(os.Stdout, result)
}

func runPlannerDelete(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	id := strings.TrimSpace(args[0])
	if err := client.DeleteJSON(ctx, "/api/planner/entries/"+url.PathEscape(id)); err != nil {
		return fmt.Errorf("delete planner task: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	result := map[string]any{"id": id, "deleted": true}
	if output == "table" {
		cli.PrintTable(os.Stdout, []string{"ID", "DELETED"}, [][]string{{id, "true"}})
		return nil
	}
	return cli.PrintJSON(os.Stdout, result)
}

func getPlannerContext(ctx context.Context, client *cli.APIClient, date string) (map[string]any, error) {
	params := url.Values{}
	params.Set("date", date)
	var result map[string]any
	if err := client.GetJSON(ctx, "/api/planner/context?"+params.Encode(), &result); err != nil {
		return nil, fmt.Errorf("load planner context: %w", err)
	}
	return result, nil
}

func plannerDateFlag(cmd *cobra.Command) (string, error) {
	rawDate, _ := cmd.Flags().GetString("date")
	return plannerDateValue(rawDate)
}

func plannerDateValue(raw string) (string, error) {
	value := strings.ToLower(strings.TrimSpace(raw))
	now := time.Now()
	switch value {
	case "", "today":
		return now.Format("2006-01-02"), nil
	case "tomorrow":
		return now.AddDate(0, 0, 1).Format("2006-01-02"), nil
	case "yesterday":
		return now.AddDate(0, 0, -1).Format("2006-01-02"), nil
	default:
		parsed, err := time.Parse("2006-01-02", strings.TrimSpace(raw))
		if err != nil {
			return "", fmt.Errorf("invalid date %q: use today, tomorrow, yesterday, or YYYY-MM-DD", raw)
		}
		return parsed.Format("2006-01-02"), nil
	}
}

func plannerYearMonth(cmd *cobra.Command, args []string) (int, int, error) {
	now := time.Now()
	year := now.Year()
	month := int(now.Month())
	if v, _ := cmd.Flags().GetInt("year"); v != 0 {
		year = v
	}
	if v, _ := cmd.Flags().GetInt("month"); v != 0 {
		month = v
	}
	if len(args) >= 1 {
		v, err := strconv.Atoi(args[0])
		if err != nil {
			return 0, 0, fmt.Errorf("invalid year %q", args[0])
		}
		year = v
	}
	if len(args) == 2 {
		v, err := strconv.Atoi(args[1])
		if err != nil {
			return 0, 0, fmt.Errorf("invalid month %q", args[1])
		}
		month = v
	}
	if year < 1900 || year > 2500 {
		return 0, 0, fmt.Errorf("year must be between 1900 and 2500")
	}
	if month < 1 || month > 12 {
		return 0, 0, fmt.Errorf("month must be between 1 and 12")
	}
	return year, month, nil
}

func plannerStatusPriority(cmd *cobra.Command) (string, string, error) {
	status, _ := cmd.Flags().GetString("status")
	status = strings.TrimSpace(status)
	if status == "" {
		status = "planned"
	}
	if !plannerValidStatus(status) {
		return "", "", fmt.Errorf("invalid status %q", status)
	}
	priority, _ := cmd.Flags().GetString("priority")
	priority = strings.TrimSpace(priority)
	if priority == "" {
		priority = "none"
	}
	if !plannerValidPriority(priority) {
		return "", "", fmt.Errorf("invalid priority %q", priority)
	}
	return status, priority, nil
}

func plannerValidStatus(status string) bool {
	switch status {
	case "planned", "queued", "working", "done", "blocked", "skipped":
		return true
	default:
		return false
	}
}

func plannerValidPriority(priority string) bool {
	switch priority {
	case "urgent", "high", "medium", "low", "none":
		return true
	default:
		return false
	}
}

func plannerValidColor(color string) bool {
	if len(color) != 4 && len(color) != 7 {
		return false
	}
	if !strings.HasPrefix(color, "#") {
		return false
	}
	for _, ch := range color[1:] {
		if !((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f')) {
			return false
		}
	}
	return true
}

func plannerCleanTasks(tasks []string) []string {
	out := make([]string, 0, len(tasks))
	for _, task := range tasks {
		trimmed := strings.TrimSpace(task)
		if trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func plannerTitleKey(title string) string {
	return strings.ToLower(strings.TrimSpace(title))
}

func plannerPutStringFlag(cmd *cobra.Command, body map[string]any, flagName string, jsonName string) {
	value, _ := cmd.Flags().GetString(flagName)
	value = strings.TrimSpace(value)
	if value != "" {
		body[jsonName] = value
	}
}

func plannerOptionalString(value string) any {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return trimmed
}

func plannerEntriesFromAny(raw any) []map[string]any {
	items, ok := raw.([]any)
	if !ok {
		return nil
	}
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		if mapped, ok := item.(map[string]any); ok {
			out = append(out, mapped)
		}
	}
	return out
}

func plannerDayMarksFromAny(raw any) []map[string]any {
	items, ok := raw.([]any)
	if !ok {
		return nil
	}
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		if mapped, ok := item.(map[string]any); ok {
			out = append(out, mapped)
		}
	}
	return out
}

func printPlannerContextTable(contextResp map[string]any) {
	date := strVal(contextResp, "date")
	month := plannerMap(contextResp["month"])
	dayMark := plannerMap(contextResp["day_mark"])
	mark := "none"
	if len(dayMark) > 0 {
		mark = strVal(dayMark, "color")
		if label := strVal(dayMark, "label"); label != "" {
			mark += " " + label
		}
	}
	cli.PrintTable(os.Stdout, []string{"DATE", "MONTH", "MARK"}, [][]string{{
		date,
		strVal(month, "title"),
		mark,
	}})

	objectives := plannerStrings(contextResp["objectives"])
	if len(objectives) > 0 {
		fmt.Fprintln(os.Stdout, "\nMAIN OBJECTIVES")
		for _, objective := range objectives {
			fmt.Fprintf(os.Stdout, "- %s\n", objective)
		}
	}
	notes := plannerStrings(contextResp["notes"])
	if len(notes) > 0 {
		fmt.Fprintln(os.Stdout, "\nNOTES")
		for _, note := range notes {
			fmt.Fprintf(os.Stdout, "- %s\n", note)
		}
	}
	entries := plannerEntriesFromAny(contextResp["entries"])
	if len(entries) > 0 {
		fmt.Fprintln(os.Stdout, "\nTASKS")
		printPlannerEntriesTable(entries)
		return
	}
	fmt.Fprintln(os.Stdout, "\nNo planner tasks for this day.")
}

func printPlannerMonthTable(result map[string]any) {
	month := plannerMap(result["month"])
	entries := plannerEntriesFromAny(result["entries"])
	dayMarks := plannerDayMarksFromAny(result["day_marks"])
	byDate := map[string][]map[string]any{}
	for _, entry := range entries {
		date := strVal(entry, "entry_date")
		byDate[date] = append(byDate[date], entry)
	}
	marksByDate := map[string]map[string]any{}
	for _, mark := range dayMarks {
		marksByDate[strVal(mark, "mark_date")] = mark
	}

	dates := make([]string, 0, len(byDate)+len(marksByDate))
	seen := map[string]bool{}
	for date := range byDate {
		if !seen[date] {
			dates = append(dates, date)
			seen[date] = true
		}
	}
	for date := range marksByDate {
		if !seen[date] {
			dates = append(dates, date)
			seen[date] = true
		}
	}
	sort.Strings(dates)

	title := strVal(month, "title")
	year := strVal(month, "year")
	if title != "" || year != "" {
		fmt.Fprintf(os.Stdout, "%s %s\n", title, year)
	}
	if len(dates) == 0 {
		fmt.Fprintln(os.Stdout, "No marked days or planner tasks.")
		return
	}

	rows := make([][]string, 0, len(dates))
	for _, date := range dates {
		mark := ""
		if m := marksByDate[date]; len(m) > 0 {
			mark = strVal(m, "color")
			if label := strVal(m, "label"); label != "" {
				mark += " " + label
			}
		}
		rows = append(rows, []string{
			date,
			mark,
			plannerEntryTitles(byDate[date]),
		})
	}
	cli.PrintTable(os.Stdout, []string{"DATE", "MARK", "TASKS"}, rows)
}

func printPlannerEntriesTable(entries []map[string]any) {
	rows := make([][]string, 0, len(entries))
	for _, entry := range entries {
		rows = append(rows, []string{
			strVal(entry, "entry_date"),
			strVal(entry, "position"),
			strVal(entry, "title"),
			strVal(entry, "status"),
			strVal(entry, "priority"),
			displayID(strVal(entry, "id"), false),
		})
	}
	cli.PrintTable(os.Stdout, []string{"DATE", "POS", "TITLE", "STATUS", "PRIORITY", "ID"}, rows)
}

func printPlannerDayMarksTable(marks []map[string]any) {
	rows := make([][]string, 0, len(marks))
	for _, mark := range marks {
		rows = append(rows, []string{
			strVal(mark, "mark_date"),
			strVal(mark, "color"),
			strVal(mark, "label"),
			displayID(strVal(mark, "id"), false),
		})
	}
	cli.PrintTable(os.Stdout, []string{"DATE", "COLOR", "LABEL", "ID"}, rows)
}

func plannerEntryTitles(entries []map[string]any) string {
	titles := make([]string, 0, len(entries))
	for _, entry := range entries {
		title := strVal(entry, "title")
		if title != "" {
			titles = append(titles, title)
		}
	}
	return strings.Join(titles, "; ")
}

func plannerMap(raw any) map[string]any {
	if raw == nil {
		return nil
	}
	if mapped, ok := raw.(map[string]any); ok {
		return mapped
	}
	return nil
}

func plannerStrings(raw any) []string {
	items, ok := raw.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(items))
	for _, item := range items {
		if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
			out = append(out, s)
		}
	}
	return out
}
