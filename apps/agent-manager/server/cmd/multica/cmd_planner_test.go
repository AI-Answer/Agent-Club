package main

import "testing"

func TestPlannerDateValue(t *testing.T) {
	got, err := plannerDateValue("2026-05-14")
	if err != nil {
		t.Fatalf("plannerDateValue() error = %v", err)
	}
	if got != "2026-05-14" {
		t.Fatalf("plannerDateValue() = %q, want %q", got, "2026-05-14")
	}

	if _, err := plannerDateValue("05/14/2026"); err == nil {
		t.Fatal("plannerDateValue() accepted invalid date")
	}
}

func TestPlannerCleanTasks(t *testing.T) {
	got := plannerCleanTasks([]string{" first ", "", "second"})
	if len(got) != 2 || got[0] != "first" || got[1] != "second" {
		t.Fatalf("plannerCleanTasks() = %#v", got)
	}
}

func TestPlannerValidation(t *testing.T) {
	if !plannerValidStatus("planned") || plannerValidStatus("todo") {
		t.Fatal("plannerValidStatus validation mismatch")
	}
	if !plannerValidPriority("high") || plannerValidPriority("critical") {
		t.Fatal("plannerValidPriority validation mismatch")
	}
	if !plannerValidColor("#fde68a") || !plannerValidColor("#fff") || plannerValidColor("fde68a") || plannerValidColor("#ffzzzz") {
		t.Fatal("plannerValidColor validation mismatch")
	}
}
