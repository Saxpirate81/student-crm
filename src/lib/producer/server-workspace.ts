import { getAppCoreServiceClient } from "@/lib/supabase/service";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ProducerMatrixRow, ProducerWorkspaceSnapshot } from "@/lib/producer/data-source";
import type { Assignee, ExecutionMode, RuleStatus } from "@/lib/producer/mock-playbook";
import type { PlaybookVersion, ProducerQueueTask, ProducerTaskType } from "@/lib/producer/mock-queue";

type AppCoreRuleRow = {
  id: string;
  playbook_version: string;
  learning_track: string;
  target_lesson: number;
  placement: "lesson" | "between";
  task_name: string;
  task_type: string;
  execution_mode: string;
  assignee: string;
  teacher_description: string | null;
  ops_description: string | null;
  status: string;
};

type AppCoreTaskRow = {
  id: string;
  student_person_id: string | null;
  student_name: string | null;
  age_years: number | null;
  instrument: string | null;
  trigger_lesson: number;
  task_name: string;
  task_type: string;
  ops_instructions: string | null;
  parent_name: string | null;
  parent_email: string | null;
  created_at: string;
  playbook_version: string | null;
};

type AppCoreRoleRow = {
  id: string;
  key: string;
};

type AppCorePersonRoleRow = {
  person_id: string;
  role_id: string;
  active: boolean;
};

type AppCorePersonRow = {
  id: string;
  display_name: string;
  metadata: unknown;
};

type AppCoreLessonRow = {
  student_person_id: string;
  lesson_date: string;
  instrument: string | null;
};

type LegacyRuleRow = {
  rule_id: string;
  playbook_category: string | null;
  learning_track: string;
  target_lesson: number;
  task_name: string;
  task_type: string;
  execution_mode: string | null;
  assignee: string | null;
  teacher_description: string | null;
  ops_description: string | null;
  status: string | null;
};

type LegacyTaskRow = {
  task_id: string;
  crm_id: string | null;
  trigger_lesson: number;
  task_name: string | null;
  task_type: string;
  ops_instructions: string | null;
  created_at: string;
};

type LegacyProfileRow = {
  crm_id: string;
  student_name: string;
  instrument: string;
  primary_name: string | null;
  primary_email: string | null;
  age_group: string | null;
};

type LegacyTrackerRow = {
  crm_id: string;
  current_lesson_count: number | null;
};

type RpcRow = Record<string, unknown>;

function getPublicServerClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = serviceKey ?? anonKey;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as SupabaseClient;
}

function normalizeTaskType(value: string | null | undefined): ProducerTaskType {
  if (value === "Media Upload" || value === "In-Room Milestone" || value === "System Action" || value === "Admin Task") {
    return value;
  }
  return "System Action";
}

function normalizeAssignee(value: string | null | undefined): Assignee {
  if (value === "Teacher" || value === "Ops" || value === "Both") return value;
  return "Both";
}

function normalizeExecutionMode(value: string | null | undefined): ExecutionMode {
  if (value === "Automated" || value === "Manual") return value;
  return "Manual";
}

function normalizeStatus(value: string | null | undefined): RuleStatus {
  if (value === "Active" || value === "Inactive" || value === "Archived") return value;
  return "Active";
}

function normalizeLearningTrack(value: string | null | undefined): string {
  if (!value) return "All";
  if (value === "True Beginner") return "Kids";
  return value;
}

function placementFromAssignee(value: Assignee): "lesson" | "between" {
  return value === "Ops" ? "between" : "lesson";
}

function ageFromAgeGroup(value: string | null | undefined) {
  if (value === "Kids") return 10;
  if (value === "Teens") return 15;
  if (value === "Adults") return 24;
  return 0;
}

function buildSnapshot(
  rules: ProducerWorkspaceSnapshot["rules"],
  tasks: ProducerQueueTask[],
  matrixRows: ProducerMatrixRow[],
): ProducerWorkspaceSnapshot {
  const defaultVersion = rules.find((rule) => rule.playbookVersion === "Current")?.playbookVersion ?? rules[0]?.playbookVersion;
  return {
    playbookVersion: defaultVersion ?? tasks[0]?.playbookVersion ?? "Current",
    rules,
    tasks,
    matrixRows,
  };
}

function clampPulseScore(value: number) {
  return Math.max(24, Math.min(96, value));
}

function pulseLabel(score: number) {
  if (score < 50) return "Critical";
  if (score < 70) return "At Risk";
  if (score < 85) return "Good";
  return "Excellent";
}

function asString(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

async function loadFromAppCore(): Promise<ProducerWorkspaceSnapshot | null> {
  const client = getAppCoreServiceClient();
  if (!client) return null;

  const preferredSlug = process.env.NEXT_PUBLIC_PRODUCER_ORG_SLUG ?? "real-school";
  let organizationId: string | null = null;
  const orgRes = await client.from("organizations").select("id").eq("slug", preferredSlug).maybeSingle();
  if (!orgRes.error && orgRes.data?.id) {
    organizationId = orgRes.data.id;
  } else {
    const orgFallback = await client.from("organizations").select("id").limit(1);
    if (orgFallback.error || !orgFallback.data?.length) return null;
    organizationId = orgFallback.data[0]?.id ?? null;
  }
  if (!organizationId) return null;

  const [rulesRes, tasksRes, rolesRes, personRolesRes, peopleRes, lessonsRes] = await Promise.all([
    client
      .from("workflow_rules")
      .select(
        "id, playbook_version, learning_track, target_lesson, placement, task_name, task_type, execution_mode, assignee, teacher_description, ops_description, status",
      )
      .eq("organization_id", organizationId)
      .order("target_lesson", { ascending: true }),
    client
      .from("ops_tasks")
      .select(
        "id, student_person_id, student_name, age_years, instrument, trigger_lesson, task_name, task_type, ops_instructions, parent_name, parent_email, created_at, playbook_version",
      )
      .eq("organization_id", organizationId)
      .in("status", ["Pending", "pending"])
      .order("created_at", { ascending: true }),
    client.from("roles").select("id, key"),
    client.from("person_roles").select("person_id, role_id, active").eq("organization_id", organizationId).eq("active", true),
    client.from("persons").select("id, display_name, metadata").eq("organization_id", organizationId),
    client
      .from("lessons")
      .select("student_person_id, lesson_date, instrument")
      .eq("organization_id", organizationId)
      .in("status", ["Complete", "Completed", "complete", "completed"]),
  ]);

  if (rulesRes.error || tasksRes.error || rolesRes.error || personRolesRes.error || peopleRes.error || lessonsRes.error) {
    return null;
  }

  const rules = ((rulesRes.data ?? []) as AppCoreRuleRow[]).map((rule) => ({
    ruleId: rule.id,
    playbookVersion: rule.playbook_version || "Current",
    learningTrack: normalizeLearningTrack(rule.learning_track),
    targetLesson: rule.target_lesson,
    placement: rule.placement ?? placementFromAssignee(normalizeAssignee(rule.assignee)),
    taskName: rule.task_name,
    taskType: normalizeTaskType(rule.task_type),
    executionMode: normalizeExecutionMode(rule.execution_mode),
    assignee: normalizeAssignee(rule.assignee),
    teacherDescription: rule.teacher_description ?? "",
    opsDescription: rule.ops_description ?? "",
    status: normalizeStatus(rule.status),
  }));

  const tasks = ((tasksRes.data ?? []) as AppCoreTaskRow[]).map((task) => ({
    taskId: task.id,
    studentName: task.student_name ?? "Unknown Student",
    age: task.age_years ?? 0,
    instrument: task.instrument ?? "Music",
    triggerLesson: task.trigger_lesson,
    taskName: task.task_name,
    taskType: normalizeTaskType(task.task_type),
    opsInstructions: task.ops_instructions ?? "",
    parentName: task.parent_name ?? "Parent/Guardian",
    parentEmail: task.parent_email ?? "",
    createdAt: task.created_at,
    playbookVersion: task.playbook_version ?? "Current",
  }));

  const roleKeyById = new Map((rolesRes.data as AppCoreRoleRow[] | null | undefined ?? []).map((row) => [row.id, row.key]));
  const studentIds = new Set(
    ((personRolesRes.data as AppCorePersonRoleRow[] | null | undefined) ?? [])
      .filter((row) => roleKeyById.get(row.role_id) === "student")
      .map((row) => row.person_id),
  );

  const people = ((peopleRes.data as AppCorePersonRow[] | null | undefined) ?? []).filter((row) => studentIds.has(row.id));

  const lessonCountByStudent = new Map<string, number>();
  const latestInstrumentByStudent = new Map<string, string>();
  const sortedLessons = [...((lessonsRes.data as AppCoreLessonRow[] | null | undefined) ?? [])].sort((a, b) =>
    b.lesson_date.localeCompare(a.lesson_date),
  );
  for (const lesson of sortedLessons) {
    if (!studentIds.has(lesson.student_person_id)) continue;
    lessonCountByStudent.set(lesson.student_person_id, (lessonCountByStudent.get(lesson.student_person_id) ?? 0) + 1);
    if (!latestInstrumentByStudent.has(lesson.student_person_id) && lesson.instrument) {
      latestInstrumentByStudent.set(lesson.student_person_id, lesson.instrument);
    }
  }

  const pendingCountByStudent = new Map<string, number>();
  for (const task of (tasksRes.data as AppCoreTaskRow[] | null | undefined) ?? []) {
    if (!task.student_person_id) continue;
    pendingCountByStudent.set(task.student_person_id, (pendingCountByStudent.get(task.student_person_id) ?? 0) + 1);
  }

  const matrixRows = people
    .map((person) => {
      const lessons = lessonCountByStudent.get(person.id) ?? 0;
      const pending = pendingCountByStudent.get(person.id) ?? 0;
      const instrument = latestInstrumentByStudent.get(person.id) ?? "Music";
      const learningTrack =
        typeof person.metadata === "object" && person.metadata && "learning_track" in person.metadata
          ? normalizeLearningTrack(String((person.metadata as Record<string, unknown>).learning_track ?? "Unknown"))
          : "Unknown";
      const penaltyFromVelocity = lessons === 0 ? 30 : lessons <= 4 ? 18 : lessons <= 10 ? 10 : lessons <= 20 ? 6 : 3;
      const score = clampPulseScore(94 - pending * 10 - penaltyFromVelocity);
      return {
        studentName: person.display_name,
        instrument,
        learningTrack,
        velocityLesson: lessons,
        pulseScore: score,
        pulseLabel: pulseLabel(score),
      };
    })
    .filter((row) => row.velocityLesson > 0 || row.pulseScore < 96)
    .sort((a, b) => a.pulseScore - b.pulseScore || a.studentName.localeCompare(b.studentName));

  return buildSnapshot(rules, tasks, matrixRows);
}

async function loadFromLegacyWithClient(client: SupabaseClient): Promise<ProducerWorkspaceSnapshot | null> {
  const [rulesRes, tasksRes, profilesRes, trackerRes] = await Promise.all([
    client
      .schema("public")
      .from("crm_workflow_rules")
      .select(
        "rule_id, playbook_category, learning_track, target_lesson, task_name, task_type, execution_mode, assignee, teacher_description, ops_description, status",
      )
      .order("target_lesson", { ascending: true }),
    client
      .schema("public")
      .from("crm_ops_queue")
      .select("task_id, crm_id, trigger_lesson, task_name, task_type, ops_instructions, created_at")
      .in("status", ["Pending", "pending"])
      .order("created_at", { ascending: true }),
    client
      .schema("public")
      .from("crm_profiles")
      .select("crm_id, student_name, instrument, primary_name, primary_email, age_group"),
    client.schema("public").from("crm_lesson_tracker").select("crm_id, current_lesson_count"),
  ]);

  if (rulesRes.error || tasksRes.error || profilesRes.error || trackerRes.error) return null;

  const legacyRules = (rulesRes.data ?? []) as LegacyRuleRow[];
  const rules = legacyRules.map((rule) => {
    const assignee = normalizeAssignee(rule.assignee);
    return {
      ruleId: rule.rule_id,
      playbookVersion: rule.playbook_category ?? "Current",
      learningTrack: normalizeLearningTrack(rule.learning_track),
      targetLesson: rule.target_lesson,
      placement: placementFromAssignee(assignee),
      taskName: rule.task_name,
      taskType: normalizeTaskType(rule.task_type),
      executionMode: normalizeExecutionMode(rule.execution_mode),
      assignee,
      teacherDescription: rule.teacher_description ?? "",
      opsDescription: rule.ops_description ?? "",
      status: normalizeStatus(rule.status),
    };
  });

  const profilesByCrmId = new Map(
    ((profilesRes.data ?? []) as LegacyProfileRow[]).map((row) => [row.crm_id, row]),
  );
  const versionByTaskKey = new Map<string, PlaybookVersion>();
  for (const rule of legacyRules) {
    versionByTaskKey.set(`${rule.task_name}::${rule.target_lesson}`, rule.playbook_category ?? "Current");
  }

  const tasks = ((tasksRes.data ?? []) as LegacyTaskRow[]).map((task) => {
    const profile = task.crm_id ? profilesByCrmId.get(task.crm_id) : undefined;
    return {
      taskId: task.task_id,
      studentName: profile?.student_name ?? "Unknown Student",
      age: ageFromAgeGroup(profile?.age_group),
      instrument: profile?.instrument ?? "Music",
      triggerLesson: task.trigger_lesson,
      taskName: task.task_name ?? "Producer Task",
      taskType: normalizeTaskType(task.task_type),
      opsInstructions: task.ops_instructions ?? "",
      parentName: profile?.primary_name ?? "Parent/Guardian",
      parentEmail: profile?.primary_email ?? "",
      createdAt: task.created_at,
      playbookVersion: versionByTaskKey.get(`${task.task_name ?? "Producer Task"}::${task.trigger_lesson}`) ?? "Current",
    };
  });

  const trackerByCrmId = new Map(
    ((trackerRes.data ?? []) as LegacyTrackerRow[]).map((row) => [row.crm_id, Number(row.current_lesson_count) || 0]),
  );
  const pendingByCrmId = new Map<string, number>();
  for (const task of (tasksRes.data ?? []) as LegacyTaskRow[]) {
    if (!task.crm_id) continue;
    pendingByCrmId.set(task.crm_id, (pendingByCrmId.get(task.crm_id) ?? 0) + 1);
  }

  const matrixRows: ProducerMatrixRow[] = [];
  for (const profile of (profilesRes.data ?? []) as LegacyProfileRow[]) {
    const lessons = trackerByCrmId.get(profile.crm_id) ?? 0;
    const pending = pendingByCrmId.get(profile.crm_id) ?? 0;
    if (lessons === 0 && pending === 0) continue;
    const penaltyFromVelocity = lessons === 0 ? 30 : lessons <= 4 ? 18 : lessons <= 10 ? 10 : lessons <= 20 ? 6 : 3;
    const score = clampPulseScore(94 - pending * 10 - penaltyFromVelocity);
    matrixRows.push({
      studentName: profile.student_name,
      instrument: profile.instrument ?? "Music",
      learningTrack: normalizeLearningTrack(profile.age_group ?? "Unknown"),
      velocityLesson: lessons,
      pulseScore: score,
      pulseLabel: pulseLabel(score),
    });
  }
  matrixRows.sort((a, b) => a.pulseScore - b.pulseScore || a.studentName.localeCompare(b.studentName));

  return buildSnapshot(rules, tasks, matrixRows);
}

async function loadFromRpc(client: SupabaseClient): Promise<ProducerWorkspaceSnapshot | null> {
  const [queueRes, rosterRes, rulesRes] = await Promise.all([
    client.rpc("crm_get_producer_queue"),
    client.rpc("crm_get_teacher_roster"),
    client.rpc("fetchPlaybookRules"),
  ]);

  const queueRows = (queueRes.data ?? []) as RpcRow[];
  const rosterRows = (rosterRes.data ?? []) as RpcRow[];
  const ruleRows = (rulesRes.data ?? []) as RpcRow[];
  if (!queueRows.length && !rosterRows.length && !ruleRows.length) return null;

  const rules = ruleRows.map((row) => {
    const assignee = normalizeAssignee(asString(row.assignee, "Both"));
    return {
      ruleId: asString(row.rule_id, asString(row.id, `rpc-rule-${Math.random().toString(36).slice(2, 8)}`)),
      playbookVersion: asString(row.playbook_category, asString(row.playbook_version, "Current")),
      learningTrack: normalizeLearningTrack(asString(row.learning_track, "All")),
      targetLesson: asNumber(row.target_lesson, asNumber(row.trigger_lesson, 1)),
      placement: (asString(row.placement, "") as "lesson" | "between") || placementFromAssignee(assignee),
      taskName: asString(row.task_name, "Producer Task"),
      taskType: normalizeTaskType(asString(row.task_type, "System Action")),
      executionMode: normalizeExecutionMode(asString(row.execution_mode, "Manual")),
      assignee,
      teacherDescription: asString(row.teacher_description, ""),
      opsDescription: asString(row.ops_description, asString(row.ops_instructions, "")),
      status: normalizeStatus(asString(row.status, "Active")),
    };
  });

  const tasks: ProducerQueueTask[] = queueRows.map((row, index) => {
    const lesson = asNumber(row.trigger_lesson, asNumber(row.target_lesson, asNumber(row.current_lesson_count, 1)));
    return {
      taskId: asString(row.task_id, asString(row.id, `rpc-task-${index}-${Date.now()}`)),
      sourceRuleId: asString(row.source_rule_id, "") || undefined,
      studentName: asString(row.student_name, asString(row.name, "Unknown Student")),
      age: asNumber(row.age_years, asNumber(row.age, ageFromAgeGroup(asString(row.age_group)))),
      instrument: asString(row.instrument, "Music"),
      triggerLesson: lesson,
      taskName: asString(row.task_name, asString(row.required_action, "Producer Task")),
      taskType: normalizeTaskType(asString(row.task_type, "System Action")),
      opsInstructions: asString(row.ops_instructions, asString(row.instructions, "")),
      parentName: asString(row.parent_name, asString(row.primary_name, "Parent/Guardian")),
      parentEmail: asString(row.parent_email, asString(row.primary_email, "")),
      createdAt: asString(row.created_at, new Date().toISOString()),
      playbookVersion: asString(row.playbook_version, asString(row.playbook_category, "Current")),
    };
  });

  const pendingByStudent = new Map<string, number>();
  for (const task of tasks) {
    pendingByStudent.set(task.studentName, (pendingByStudent.get(task.studentName) ?? 0) + 1);
  }

  const matrixRowsFromRoster: ProducerMatrixRow[] = rosterRows.map((row) => {
    const studentName = asString(row.student_name, asString(row.name, "Unknown Student"));
    const lessons = asNumber(row.current_lesson_count, asNumber(row.lesson_count, 0));
    const pending = pendingByStudent.get(studentName) ?? 0;
    const penaltyFromVelocity = lessons === 0 ? 30 : lessons <= 4 ? 18 : lessons <= 10 ? 10 : lessons <= 20 ? 6 : 3;
    const score = clampPulseScore(94 - pending * 10 - penaltyFromVelocity);
    return {
      studentName,
      instrument: asString(row.instrument, "Music"),
      learningTrack: normalizeLearningTrack(asString(row.learning_track, asString(row.age_group, "Unknown"))),
      velocityLesson: lessons,
      pulseScore: score,
      pulseLabel: pulseLabel(score),
    };
  });

  const matrixRows =
    matrixRowsFromRoster.length > 0
      ? matrixRowsFromRoster
      : [...new Map(tasks.map((task) => [task.studentName, task])).values()].map((task) => {
          const pending = pendingByStudent.get(task.studentName) ?? 0;
          const lessons = task.triggerLesson;
          const penaltyFromVelocity = lessons === 0 ? 30 : lessons <= 4 ? 18 : lessons <= 10 ? 10 : lessons <= 20 ? 6 : 3;
          const score = clampPulseScore(94 - pending * 10 - penaltyFromVelocity);
          return {
            studentName: task.studentName,
            instrument: task.instrument,
            learningTrack: "Unknown",
            velocityLesson: lessons,
            pulseScore: score,
            pulseLabel: pulseLabel(score),
          };
        });

  return buildSnapshot(rules, tasks, matrixRows);
}

async function loadFromLegacy(): Promise<ProducerWorkspaceSnapshot | null> {
  const appCoreClient = getAppCoreServiceClient();
  const publicClient = getPublicServerClient();
  const clients: SupabaseClient[] = [];
  if (appCoreClient) clients.push(appCoreClient);
  if (publicClient && publicClient !== appCoreClient) clients.push(publicClient);
  if (!clients.length) return null;

  for (const client of clients) {
    const snapshot = await loadFromLegacyWithClient(client);
    if (snapshot) return snapshot;
  }
  return null;
}

export async function getProducerWorkspaceSnapshot(): Promise<ProducerWorkspaceSnapshot> {
  const appCoreSnapshot = await loadFromAppCore();
  if (appCoreSnapshot && (appCoreSnapshot.rules.length > 0 || appCoreSnapshot.tasks.length > 0)) {
    return appCoreSnapshot;
  }

  const rpcClient = getPublicServerClient();
  if (rpcClient) {
    const rpcSnapshot = await loadFromRpc(rpcClient);
    if (rpcSnapshot && (rpcSnapshot.rules.length > 0 || rpcSnapshot.tasks.length > 0 || rpcSnapshot.matrixRows.length > 0)) {
      return rpcSnapshot;
    }
  }

  const legacySnapshot = await loadFromLegacy();
  if (legacySnapshot) return legacySnapshot;

  return {
    playbookVersion: "Current",
    rules: [],
    tasks: [],
    matrixRows: [],
  };
}
