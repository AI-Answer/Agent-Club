import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { GoalDetail } from "@multica/views/goals/components";
import { useWorkspaceId } from "@multica/core/hooks";
import { goalDetailOptions } from "@multica/core/goals/queries";
import { useDocumentTitle } from "@/hooks/use-document-title";

export function GoalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const wsId = useWorkspaceId();
  const { data: goal } = useQuery(goalDetailOptions(wsId, id!));

  useDocumentTitle(goal ? `Goal ${goal.title}` : "Goal");

  if (!id) return null;
  return <GoalDetail goalId={id} />;
}
