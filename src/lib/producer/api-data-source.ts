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
  void client;
  const fallback = createMockProducerWorkspaceDataSource();

  return {
    getInitialSnapshot: () => {
      // TODO(api): replace this fallback with an async bootstrap path once
      // useProducerWorkspace supports async initialization.
      return fallback.getInitialSnapshot();
    },
    listPlaybookVersions: (rules, tasks) => {
      // TODO(api): optionally resolve versions from server (if version catalog
      // is not derivable client-side).
      return fallback.listPlaybookVersions(rules, tasks);
    },
  };
}
