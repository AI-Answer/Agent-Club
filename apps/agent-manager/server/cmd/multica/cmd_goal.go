package main

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/multica-ai/multica/server/internal/cli"
)

var goalCmd = &cobra.Command{
	Use:   "goal",
	Short: "Work with goals",
}

var goalListCmd = &cobra.Command{
	Use:   "list",
	Short: "List goals in the workspace",
	RunE:  runGoalList,
}

var goalGetCmd = &cobra.Command{
	Use:   "get <id>",
	Short: "Get goal details",
	Args:  exactArgs(1),
	RunE:  runGoalGet,
}

var goalCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a new goal",
	RunE:  runGoalCreate,
}

var goalUpdateCmd = &cobra.Command{
	Use:   "update <id>",
	Short: "Update a goal",
	Args:  exactArgs(1),
	RunE:  runGoalUpdate,
}

var goalDeleteCmd = &cobra.Command{
	Use:   "delete <id>",
	Short: "Delete a goal",
	Args:  exactArgs(1),
	RunE:  runGoalDelete,
}

var goalStatusCmd = &cobra.Command{
	Use:   "status <id> <status>",
	Short: "Change goal status",
	Args:  exactArgs(2),
	RunE:  runGoalStatus,
}

var validGoalStatuses = []string{
	"planned", "in_progress", "paused", "completed", "cancelled",
}

func init() {
	goalCmd.AddCommand(goalListCmd)
	goalCmd.AddCommand(goalGetCmd)
	goalCmd.AddCommand(goalCreateCmd)
	goalCmd.AddCommand(goalUpdateCmd)
	goalCmd.AddCommand(goalDeleteCmd)
	goalCmd.AddCommand(goalStatusCmd)

	goalListCmd.Flags().String("output", "table", "Output format: table or json")
	goalListCmd.Flags().Bool("full-id", false, "Show full UUIDs in table output")
	goalListCmd.Flags().String("project", "", "Filter by project ID")
	goalListCmd.Flags().String("status", "", "Filter by status")

	goalGetCmd.Flags().String("output", "json", "Output format: table or json")

	goalCreateCmd.Flags().String("project", "", "Project ID (required)")
	goalCreateCmd.Flags().String("title", "", "Goal title (required)")
	goalCreateCmd.Flags().String("description", "", "Goal description")
	goalCreateCmd.Flags().String("status", "", "Goal status")
	goalCreateCmd.Flags().String("planner", "", "Planner name (member, agent, or squad; fuzzy match)")
	goalCreateCmd.Flags().String("planner-id", "", "Planner UUID — member, agent, or squad (mutually exclusive with --planner)")
	goalCreateCmd.Flags().String("output", "json", "Output format: table or json")

	goalUpdateCmd.Flags().String("project", "", "New project ID")
	goalUpdateCmd.Flags().String("title", "", "New title")
	goalUpdateCmd.Flags().String("description", "", "New description")
	goalUpdateCmd.Flags().String("status", "", "New status")
	goalUpdateCmd.Flags().String("planner", "", "New planner name (member, agent, or squad; fuzzy match; use --planner \"\" to clear with --planner-id \"\")")
	goalUpdateCmd.Flags().String("planner-id", "", "New planner UUID — member, agent, or squad (mutually exclusive with --planner)")
	goalUpdateCmd.Flags().String("output", "json", "Output format: table or json")

	goalDeleteCmd.Flags().String("output", "json", "Output format: table or json")
	goalStatusCmd.Flags().String("output", "table", "Output format: table or json")
}

func runGoalList(cmd *cobra.Command, _ []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	params := url.Values{}
	params.Set("workspace_id", client.WorkspaceID)
	if v, _ := cmd.Flags().GetString("project"); v != "" {
		project, err := resolveProjectID(ctx, client, v)
		if err != nil {
			return fmt.Errorf("resolve project: %w", err)
		}
		params.Set("project_id", project.ID)
	}
	if v, _ := cmd.Flags().GetString("status"); v != "" {
		params.Set("status", v)
	}

	var result map[string]any
	path := "/api/goals"
	if len(params) > 0 {
		path += "?" + params.Encode()
	}
	if err := client.GetJSON(ctx, path, &result); err != nil {
		return fmt.Errorf("list goals: %w", err)
	}

	goalsRaw, _ := result["goals"].([]any)
	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, goalsRaw)
	}

	fullID, _ := cmd.Flags().GetBool("full-id")
	actors := loadActorDisplayLookup(ctx, client)
	headers := []string{"ID", "TITLE", "STATUS", "PROJECT", "PLANNER", "CREATED"}
	rows := make([][]string, 0, len(goalsRaw))
	for _, raw := range goalsRaw {
		goal, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		created := strVal(goal, "created_at")
		if len(created) >= 10 {
			created = created[:10]
		}
		rows = append(rows, []string{
			displayID(strVal(goal, "id"), fullID),
			strVal(goal, "title"),
			strVal(goal, "status"),
			displayID(strVal(goal, "project_id"), fullID),
			formatGoalPlanner(goal, actors),
			created,
		})
	}
	cli.PrintTable(os.Stdout, headers, rows)
	return nil
}

func runGoalGet(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	goalRef, err := resolveGoalID(ctx, client, args[0])
	if err != nil {
		return fmt.Errorf("resolve goal: %w", err)
	}
	var goal map[string]any
	if err := client.GetJSON(ctx, "/api/goals/"+goalRef.ID, &goal); err != nil {
		return fmt.Errorf("get goal: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "table" {
		actors := loadActorDisplayLookup(ctx, client)
		headers := []string{"ID", "TITLE", "STATUS", "PROJECT", "PLANNER", "DESCRIPTION"}
		rows := [][]string{{
			strVal(goal, "id"),
			strVal(goal, "title"),
			strVal(goal, "status"),
			strVal(goal, "project_id"),
			formatGoalPlanner(goal, actors),
			strVal(goal, "description"),
		}}
		cli.PrintTable(os.Stdout, headers, rows)
		return nil
	}
	return cli.PrintJSON(os.Stdout, goal)
}

func runGoalCreate(cmd *cobra.Command, _ []string) error {
	title, _ := cmd.Flags().GetString("title")
	if strings.TrimSpace(title) == "" {
		return fmt.Errorf("--title is required")
	}
	projectRaw, _ := cmd.Flags().GetString("project")
	if strings.TrimSpace(projectRaw) == "" {
		return fmt.Errorf("--project is required")
	}

	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	project, err := resolveProjectID(ctx, client, projectRaw)
	if err != nil {
		return fmt.Errorf("resolve project: %w", err)
	}
	body := map[string]any{"title": title, "project_id": project.ID}
	if v, _ := cmd.Flags().GetString("description"); v != "" {
		body["description"] = v
	}
	if v, _ := cmd.Flags().GetString("status"); v != "" {
		body["status"] = v
	}
	if typ, id, hasPlanner, err := pickAssigneeFromFlags(ctx, client, cmd, "planner", "planner-id", issueAssigneeKinds); err != nil {
		return fmt.Errorf("resolve planner: %w", err)
	} else if hasPlanner {
		body["planner_type"] = typ
		body["planner_id"] = id
	}

	var result map[string]any
	if err := client.PostJSON(ctx, "/api/goals", body, &result); err != nil {
		return fmt.Errorf("create goal: %w", err)
	}
	return printGoalMutationResult(cmd, result)
}

func runGoalUpdate(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	goalRef, err := resolveGoalID(ctx, client, args[0])
	if err != nil {
		return fmt.Errorf("resolve goal: %w", err)
	}

	body := map[string]any{}
	if cmd.Flags().Changed("project") {
		v, _ := cmd.Flags().GetString("project")
		project, err := resolveProjectID(ctx, client, v)
		if err != nil {
			return fmt.Errorf("resolve project: %w", err)
		}
		body["project_id"] = project.ID
	}
	if cmd.Flags().Changed("title") {
		v, _ := cmd.Flags().GetString("title")
		body["title"] = v
	}
	if cmd.Flags().Changed("description") {
		v, _ := cmd.Flags().GetString("description")
		body["description"] = v
	}
	if cmd.Flags().Changed("status") {
		v, _ := cmd.Flags().GetString("status")
		body["status"] = v
	}
	if cmd.Flags().Changed("planner") || cmd.Flags().Changed("planner-id") {
		v, _ := cmd.Flags().GetString("planner")
		id, _ := cmd.Flags().GetString("planner-id")
		if strings.TrimSpace(v) == "" && strings.TrimSpace(id) == "" {
			body["planner_type"] = nil
			body["planner_id"] = nil
		} else {
			typ, plannerID, hasPlanner, err := pickAssigneeFromFlags(ctx, client, cmd, "planner", "planner-id", issueAssigneeKinds)
			if err != nil {
				return fmt.Errorf("resolve planner: %w", err)
			}
			if hasPlanner {
				body["planner_type"] = typ
				body["planner_id"] = plannerID
			}
		}
	}
	if len(body) == 0 {
		return fmt.Errorf("no fields to update; use flags like --title, --status, --project, --planner")
	}

	var result map[string]any
	if err := client.PutJSON(ctx, "/api/goals/"+goalRef.ID, body, &result); err != nil {
		return fmt.Errorf("update goal: %w", err)
	}
	return printGoalMutationResult(cmd, result)
}

func runGoalDelete(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	goalRef, err := resolveGoalID(ctx, client, args[0])
	if err != nil {
		return fmt.Errorf("resolve goal: %w", err)
	}
	if err := client.DeleteJSON(ctx, "/api/goals/"+goalRef.ID); err != nil {
		return fmt.Errorf("delete goal: %w", err)
	}
	fmt.Fprintf(os.Stderr, "Goal %s deleted.\n", goalRef.Display)
	return nil
}

func runGoalStatus(cmd *cobra.Command, args []string) error {
	status := args[1]
	valid := false
	for _, s := range validGoalStatuses {
		if s == status {
			valid = true
			break
		}
	}
	if !valid {
		return fmt.Errorf("invalid status %q; valid values: %s", status, strings.Join(validGoalStatuses, ", "))
	}

	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	goalRef, err := resolveGoalID(ctx, client, args[0])
	if err != nil {
		return fmt.Errorf("resolve goal: %w", err)
	}
	var result map[string]any
	if err := client.PutJSON(ctx, "/api/goals/"+goalRef.ID, map[string]any{"status": status}, &result); err != nil {
		return fmt.Errorf("update status: %w", err)
	}
	fmt.Fprintf(os.Stderr, "Goal %s status changed to %s.\n", strVal(result, "title"), status)
	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, result)
	}
	return nil
}

func printGoalMutationResult(cmd *cobra.Command, result map[string]any) error {
	output, _ := cmd.Flags().GetString("output")
	if output == "table" {
		headers := []string{"ID", "TITLE", "STATUS", "PROJECT"}
		rows := [][]string{{
			strVal(result, "id"),
			strVal(result, "title"),
			strVal(result, "status"),
			strVal(result, "project_id"),
		}}
		cli.PrintTable(os.Stdout, headers, rows)
		return nil
	}
	return cli.PrintJSON(os.Stdout, result)
}

func formatGoalPlanner(goal map[string]any, actors actorDisplayLookup) string {
	pType := strVal(goal, "planner_type")
	pID := strVal(goal, "planner_id")
	if pType == "" || pID == "" {
		return "-"
	}
	return actors.actor(pType, pID)
}
