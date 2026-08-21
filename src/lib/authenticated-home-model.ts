import type { LedgerRow, Project } from "@/lib/server/vetra";

export type ProjectLoadState =
  { status: "loading" } | { status: "error" } | { status: "ready"; projects: Project[] };

export type DashboardProjectFilter = "all" | "building" | "ready" | "online";

export type DashboardMetrics = {
  totalProjects: number;
  readyProjects: number;
  onlineProjects: number;
};

export type DashboardActivity =
  | {
      id: string;
      type: "project";
      title: string;
      detail: string;
      createdAt: string;
    }
  | {
      id: string;
      type: "credit";
      title: string;
      detail: string;
      credits: number;
      createdAt: string;
    };

export function shouldShowDemoProjects(state: ProjectLoadState): boolean {
  return state.status === "ready" && state.projects.length === 0;
}

export function dashboardMetrics(projects: readonly Project[]): DashboardMetrics {
  return {
    totalProjects: projects.length,
    readyProjects: projects.filter((project) => project.status === "ready").length,
    onlineProjects: projects.filter((project) => project.hosted).length,
  };
}

export function filterDashboardProjects(
  projects: readonly Project[],
  filter: DashboardProjectFilter,
  query: string,
): Project[] {
  const needle = query.trim().toLocaleLowerCase();
  return projects.filter((project) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "building" && project.status === "building") ||
      (filter === "ready" && project.status === "ready") ||
      (filter === "online" && project.hosted);
    if (!matchesFilter) return false;
    if (!needle) return true;
    return `${project.title} ${project.prompt}`.toLocaleLowerCase().includes(needle);
  });
}

export function dashboardActivity(
  projects: readonly Project[],
  ledger: readonly LedgerRow[],
  limit = 6,
): DashboardActivity[] {
  const projectActivity: DashboardActivity[] = projects.map((project) => ({
    id: `project:${project.id}`,
    type: "project",
    title: project.title,
    detail: project.status,
    createdAt: project.updated_at,
  }));
  const creditActivity: DashboardActivity[] = ledger.map((entry) => ({
    id: `credit:${entry.id}`,
    type: "credit",
    title: entry.note || entry.action,
    detail: entry.action,
    credits: entry.credits,
    createdAt: entry.created_at,
  }));

  return [...projectActivity, ...creditActivity]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, limit);
}
