import type { ProducerWorkspaceDataSource, ProducerWorkspaceSnapshot } from "@/lib/producer/data-source";
import { createMockProducerWorkspaceDataSource } from "@/lib/producer/mock-data-source";
import type { ProducerPlaybookRule } from "@/lib/producer/mock-playbook";
import type { PlaybookVersion, ProducerQueueTask } from "@/lib/producer/mock-queue";

/**
 * API integration checklist for replacing mock producer data.
 *
 * Required endpoints:
 * - GET    /api/producer/workspace
 * - POST   /api/producer/queue/sync
 * - PATCH  /api/producer/queue/:taskId/complete
 * - GET    /api/producer/playbook/rules
 * - POST   /api/producer/playbook/rules
 * - PATCH  /api/producer/playbook/rules/:ruleId
 * - PATCH  /api/producer/playbook/rules/:ruleId/archive
 * - POST   /api/producer/playbook/retire-current
 * - GET    /api/producer/matrix
 */
export type ProducerWorkspaceApiClient = {
  getWorkspaceSnapshot: () => Promise<ProducerWorkspaceSnapshot>;
  listPlaybookVersions?: (
    rules: ProducerPlaybookRule[],
    tasks: ProducerQueueTask[],
  ) => Promise<PlaybookVersion[]> | PlaybookVersion[];
};

/**
 * Scaffold adapter:
 * - Keeps app stable by falling back to mock data today.
 * - Marks exact integration points for real API migration.
 */
export function createApiProducerWorkspaceDataSource(
  client?: ProducerWorkspaceApiClient,
): ProducerWorkspaceDataSource {
  const fallback = createMockProducerWorkspaceDataSource();
  const useMockFallback = process.env.NEXT_PUBLIC_ENABLE_PRODUCER_MOCK_FALLBACK === "true";
  const emptySnapshot: ProducerWorkspaceSnapshot = {
    playbookVersion: "Current",
    rules: [],
    tasks: [],
    matrixRows: [],
  };
  const apiClient: ProducerWorkspaceApiClient = client ?? {
    async getWorkspaceSnapshot() {
      const res = await fetch("/api/producer/workspace", {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`Workspace API failed (${res.status})`);
      }
      const payload = (await res.json()) as { snapshot?: ProducerWorkspaceSnapshot };
      if (!payload.snapshot) throw new Error("Workspace API returned no snapshot");
      return payload.snapshot;
    },
  };

  return {
    getInitialSnapshot: () => {
      return useMockFallback ? fallback.getInitialSnapshot() : emptySnapshot;
    },
    loadWorkspaceSnapshot: async () => {
      try {
        return await apiClient.getWorkspaceSnapshot();
      } catch {
        return useMockFallback ? fallback.getInitialSnapshot() : emptySnapshot;
      }
    },
    listPlaybookVersions: (rules, tasks) => {
      return fallback.listPlaybookVersions(rules, tasks);
    },
  };
}
