"use client";

import { use } from "react";
import { GoalDetail } from "@multica/views/goals/components";

export default function GoalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <GoalDetail goalId={id} />;
}
