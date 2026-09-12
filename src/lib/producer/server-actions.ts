import { getAppCoreServiceClient } from "@/lib/supabase/service";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type RuleInput = {
  playbookVersion: string;
  learningTrack: string;
  targetLesson: number;
  placement: "lesson" | "between";
  taskName: string;
  taskType: string;
  executionMode: string;
  assignee: string;
  teacherDescription: string;
  opsDescription: string;
  status: string;
};

type RulePatch = Partial<RuleInput>;

function asTaskType(value: string) {
  return ["In-Room Milestone", "Media Upload", "System Action", "Admin Task"].includes(value)
    ? value
    : "System Action";
}

function asStatus(value: string) {
  return ["Active", "Inactive", "Archived"].includes(value) ? value : "Active";
}

function asExecutionMode(value: string) {
  return ["Manual", "Automated"].includes(value) ? value : "Manual";
}

function asAssignee(value: string) {
  return ["Teacher", "Ops", "Both"].includes(value) ? value : "Both";
}

function asPlacement(value: string) {
  return value === "between" ? "between" : "lesson";
}

async function getOrgClient() {
  const client = getAppCoreServiceClient();
  if (!client) return null;
  const preferredSlug = process.env.NEXT_PUBLIC_PRODUCER_ORG_SLUG ?? "real-school";
  const org = await client.from("organizations").select("id").eq("slug", preferredSlug).maybeSingle();
  if (!org.error && org.data?.id) {
    return { client, organizationId: org.data.id };
  }
  const fallbackOrg = await client.from("organizations").select("id").limit(1);
  if (fallbackOrg.error || !fallbackOrg.data?.length) return null;
  return { client, organizationId: fallbackOrg.data[0].id };
}

function getLegacyClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = serviceKey ?? anonKey;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as SupabaseClient;
}

function isMissingTableError(message: string) {
  return message.includes("workflow_rules") || message.includes("ops_tasks");
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return fallback;
}

function toLegacyRulePatch(patch: RulePatch) {
  const next: Record<string, unknown> = {};
  if (patch.playbookVersion !== undefined) next.playbook_category = patch.playbookVersion || "Current";
  if (patch.learningTrack !== undefined) next.learning_track = patch.learningTrack || "All";
  if (patch.targetLesson !== undefined) next.target_lesson = Math.max(1, Number(patch.targetLesson) || 1);
  if (patch.taskName !== undefined) next.task_name = patch.taskName.trim();
  if (patch.taskType !== undefined) next.task_type = asTaskType(patch.taskType);
  if (patch.executionMode !== undefined) next.execution_mode = asExecutionMode(patch.executionMode);
  if (patch.assignee !== undefined) next.assignee = asAssignee(patch.assignee);
  if (patch.teacherDescription !== undefined) next.teacher_description = patch.teacherDescription;
  if (patch.opsDescription !== undefined) next.ops_description = patch.opsDescription;
  if (patch.status !== undefined) next.status = asStatus(patch.status);
  return next;
}

async function createRuleLegacy(input: RuleInput) {
  const client = getLegacyClient();
  if (!client) return { ok: false as const, status: 503, error: "Supabase client unavailable." };
  const { error } = await client.schema("public").from("crm_workflow_rules").insert({
    playbook_category: input.playbookVersion || "Current",
    learning_track: input.learningTrack || "All",
    target_lesson: Math.max(1, Number(input.targetLesson) || 1),
    task_name: input.taskName.trim(),
    task_type: asTaskType(input.taskType),
    execution_mode: asExecutionMode(input.executionMode),
    assignee: asAssignee(input.assignee),
    teacher_description: input.teacherDescription ?? "",
    ops_description: input.opsDescription ?? "",
    status: asStatus(input.status),
  });
  if (error) return { ok: false as const, status: 500, error: error.message };
  return { ok: true as const };
}

async function updateRuleLegacy(ruleId: string, patch: RulePatch) {
  const client = getLegacyClient();
  if (!client) return { ok: false as const, status: 503, error: "Supabase client unavailable." };
  const { error } = await client
    .schema("public")
    .from("crm_workflow_rules")
    .update(toLegacyRulePatch(patch))
    .eq("rule_id", ruleId);
  if (error) return { ok: false as const, status: 500, error: error.message };
  return { ok: true as const };
}

async function retireCurrentPlaybookLegacy(archiveName: string) {
  const client = getLegacyClient();
  if (!client) return { ok: false as const, status: 503, error: "Supabase client unavailable." };
  const { error } = await client
    .schema("public")
    .from("crm_workflow_rules")
    .update({ playbook_category: archiveName })
    .eq("playbook_category", "Current");
  if (error) return { ok: false as const, status: 500, error: error.message };
  return { ok: true as const };
}

async function completeTaskLegacy(taskId: string) {
  const client = getLegacyClient();
  if (!client) return { ok: false as const, status: 503, error: "Supabase client unavailable." };
  const { error } = await client
    .schema("public")
    .from("crm_ops_queue")
    .update({ status: "Completed", completed_at: new Date().toISOString() })
    .eq("task_id", taskId);
  if (error) return { ok: false as const, status: 500, error: error.message };
  return { ok: true as const };
}

async function syncQueueLegacy() {
  const client = getLegacyClient();
  if (!client) return { ok: false as const, status: 503, error: "Supabase client unavailable." };

  const [rulesRes, trackerRes, queueRes, profilesRes] = await Promise.all([
    client
      .schema("public")
      .from("crm_workflow_rules")
      .select("rule_id, learning_track, target_lesson, task_type, task_name, ops_description, email_template_id, execution_mode, assignee, status, playbook_category")
      .eq("status", "Active")
      .eq("playbook_category", "Current"),
    client.schema("public").from("crm_lesson_tracker").select("crm_id, current_lesson_count"),
    client.schema("public").from("crm_ops_queue").select("crm_id, trigger_lesson, task_name"),
    client.schema("public").from("crm_profiles").select("crm_id, learning_track"),
  ]);

  const firstError = rulesRes.error ?? trackerRes.error ?? queueRes.error ?? profilesRes.error;
  if (firstError) return { ok: false as const, status: 500, error: firstError.message };

  const profilesById = new Map((profilesRes.data ?? []).map((row) => [row.crm_id, row.learning_track ?? "Unknown"]));
  const existingKeys = new Set(
    (queueRes.data ?? []).map((row) => `${row.crm_id ?? ""}|${Number(row.trigger_lesson) || 0}|${row.task_name ?? ""}`),
  );

  const applicableRules = (rulesRes.data ?? []).filter(
    (rule) => rule.execution_mode === "Manual" && (rule.assignee === "Ops" || rule.assignee === "Both"),
  );
  const toInsert: Record<string, unknown>[] = [];

  for (const tracker of trackerRes.data ?? []) {
    const studentTrack = profilesById.get(tracker.crm_id) ?? "Unknown";
    for (const rule of applicableRules) {
      const lessonMatches = Number(tracker.current_lesson_count) === Number(rule.target_lesson);
      if (!lessonMatches) continue;

      const ruleTracks = String(rule.learning_track || "All")
        .split(",")
        .map((value) => value.trim());
      const trackMatches = ruleTracks.includes("All") || ruleTracks.includes(studentTrack);
      if (!trackMatches) continue;

      const key = `${tracker.crm_id}|${Number(rule.target_lesson)}|${rule.task_name ?? ""}`;
      if (existingKeys.has(key)) continue;

      toInsert.push({
        crm_id: tracker.crm_id,
        trigger_lesson: Number(rule.target_lesson),
        task_type: asTaskType(rule.task_type),
        task_name: rule.task_name,
        ops_instructions: rule.ops_description ?? "",
        email_template_id: rule.email_template_id ?? null,
        status: "Pending",
      });
      existingKeys.add(key);
    }
  }

  if (toInsert.length > 0) {
    const { error } = await client.schema("public").from("crm_ops_queue").insert(toInsert);
    if (error) return { ok: false as const, status: 500, error: error.message };
  }

  return { ok: true as const, inserted: toInsert.length };
}

export async function createRule(input: RuleInput) {
  const ctx = await getOrgClient();
  if (!ctx) return createRuleLegacy(input);
  const { client, organizationId } = ctx;

  try {
    const { error } = await client.from("workflow_rules").insert({
      organization_id: organizationId,
      playbook_version: input.playbookVersion || "Current",
      learning_track: input.learningTrack || "All",
      target_lesson: Math.max(1, Number(input.targetLesson) || 1),
      placement: asPlacement(input.placement),
      task_name: input.taskName.trim(),
      task_type: asTaskType(input.taskType),
      execution_mode: asExecutionMode(input.executionMode),
      assignee: asAssignee(input.assignee),
      teacher_description: input.teacherDescription ?? "",
      ops_description: input.opsDescription ?? "",
      status: asStatus(input.status),
    });
    if (error) throw error;
    return { ok: true as const };
  } catch (error) {
    const message = errorMessage(error, "Could not create rule.");
    if (isMissingTableError(message)) {
      return createRuleLegacy(input);
    }
    return { ok: false as const, status: 500, error: message };
  }
}

export async function updateRule(ruleId: string, patch: RulePatch) {
  const ctx = await getOrgClient();
  if (!ctx) return updateRuleLegacy(ruleId, patch);
  const { client, organizationId } = ctx;

  const updateData: Record<string, unknown> = {};
  if (patch.playbookVersion !== undefined) updateData.playbook_version = patch.playbookVersion || "Current";
  if (patch.learningTrack !== undefined) updateData.learning_track = patch.learningTrack || "All";
  if (patch.targetLesson !== undefined) updateData.target_lesson = Math.max(1, Number(patch.targetLesson) || 1);
  if (patch.placement !== undefined) updateData.placement = asPlacement(patch.placement);
  if (patch.taskName !== undefined) updateData.task_name = patch.taskName.trim();
  if (patch.taskType !== undefined) updateData.task_type = asTaskType(patch.taskType);
  if (patch.executionMode !== undefined) updateData.execution_mode = asExecutionMode(patch.executionMode);
  if (patch.assignee !== undefined) updateData.assignee = asAssignee(patch.assignee);
  if (patch.teacherDescription !== undefined) updateData.teacher_description = patch.teacherDescription;
  if (patch.opsDescription !== undefined) updateData.ops_description = patch.opsDescription;
  if (patch.status !== undefined) updateData.status = asStatus(patch.status);

  try {
    const { error } = await client
      .from("workflow_rules")
      .update(updateData)
      .eq("id", ruleId)
      .eq("organization_id", organizationId);
    if (error) throw error;
    return { ok: true as const };
  } catch (error) {
    const message = errorMessage(error, "Could not update rule.");
    if (isMissingTableError(message)) {
      return updateRuleLegacy(ruleId, patch);
    }
    return { ok: false as const, status: 500, error: message };
  }
}

export async function retireCurrentPlaybook(archiveName: string) {
  const ctx = await getOrgClient();
  if (!ctx) return retireCurrentPlaybookLegacy(archiveName);
  const { client, organizationId } = ctx;
  const nextArchive = archiveName.trim();
  if (!nextArchive || nextArchive === "Current" || nextArchive === "Master Library") {
    return { ok: false as const, status: 400, error: "Invalid archive name." };
  }

  try {
    const { error } = await client
      .from("workflow_rules")
      .update({ playbook_version: nextArchive })
      .eq("organization_id", organizationId)
      .eq("playbook_version", "Current");
    if (error) throw error;
    return { ok: true as const };
  } catch (error) {
    const message = errorMessage(error, "Could not retire playbook.");
    if (isMissingTableError(message)) {
      return retireCurrentPlaybookLegacy(nextArchive);
    }
    return { ok: false as const, status: 500, error: message };
  }
}

export async function completeTask(taskId: string) {
  const ctx = await getOrgClient();
  if (!ctx) return completeTaskLegacy(taskId);
  const { client, organizationId } = ctx;
  try {
    const { error } = await client
      .from("ops_tasks")
      .update({ status: "Completed", completed_at: new Date().toISOString() })
      .eq("id", taskId)
      .eq("organization_id", organizationId);
    if (error) throw error;
    return { ok: true as const };
  } catch (error) {
    const message = errorMessage(error, "Could not complete task.");
    if (isMissingTableError(message)) {
      return completeTaskLegacy(taskId);
    }
    return { ok: false as const, status: 500, error: message };
  }
}

function trackMatches(ruleTrack: string, studentTrack: string) {
  const tokens = ruleTrack
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!tokens.length) return true;
  if (tokens.includes("All")) return true;
  return tokens.includes(studentTrack);
}

export async function syncQueueFromRules() {
  const ctx = await getOrgClient();
  if (!ctx) return syncQueueLegacy();
  const { client, organizationId } = ctx;

  try {
    const [rulesRes, rolesRes, personRolesRes, lessonsRes, peopleRes, existingRes] = await Promise.all([
      client
        .from("workflow_rules")
        .select("id, playbook_version, learning_track, target_lesson, task_name, task_type, ops_description, assignee, execution_mode, status")
        .eq("organization_id", organizationId)
        .eq("status", "Active"),
      client.from("roles").select("id, key"),
      client.from("person_roles").select("person_id, role_id, active").eq("organization_id", organizationId).eq("active", true),
      client
        .from("lessons")
        .select("student_person_id, lesson_date, instrument, status")
        .eq("organization_id", organizationId)
        .eq("status", "Complete"),
      client.from("persons").select("id, display_name, metadata").eq("organization_id", organizationId).eq("profile_status", "active"),
      client
        .from("ops_tasks")
        .select("student_person_id, trigger_lesson, task_name, playbook_version, source_rule_id")
        .eq("organization_id", organizationId),
    ]);

    const firstError = rulesRes.error ?? rolesRes.error ?? personRolesRes.error ?? lessonsRes.error ?? peopleRes.error ?? existingRes.error;
    if (firstError) throw firstError;

    const roleKeyById = new Map((rolesRes.data ?? []).map((row) => [row.id, row.key]));
    const studentIds = new Set(
      (personRolesRes.data ?? []).filter((row) => roleKeyById.get(row.role_id) === "student").map((row) => row.person_id),
    );
    const peopleById = new Map(
      (peopleRes.data ?? [])
        .filter((row) => studentIds.has(row.id))
        .map((row) => [row.id, row]),
    );

    const lessonCountByStudent = new Map<string, number>();
    const latestInstrumentByStudent = new Map<string, string>();
    const sortedLessons = [...(lessonsRes.data ?? [])].sort((a, b) => b.lesson_date.localeCompare(a.lesson_date));
    for (const row of sortedLessons) {
      if (!studentIds.has(row.student_person_id)) continue;
      lessonCountByStudent.set(row.student_person_id, (lessonCountByStudent.get(row.student_person_id) ?? 0) + 1);
      if (!latestInstrumentByStudent.has(row.student_person_id) && row.instrument) {
        latestInstrumentByStudent.set(row.student_person_id, row.instrument);
      }
    }

    const existingKeys = new Set(
      (existingRes.data ?? []).map(
        (row) =>
          `${row.student_person_id ?? ""}|${row.trigger_lesson}|${row.source_rule_id ?? `legacy:${row.task_name ?? ""}`}|${row.playbook_version}`,
      ),
    );

    const candidateRules = (rulesRes.data ?? []).filter(
      (rule) => rule.execution_mode === "Manual" && (rule.assignee === "Ops" || rule.assignee === "Both"),
    );

    const inserts: Record<string, unknown>[] = [];
    for (const [studentId, lessonCount] of lessonCountByStudent.entries()) {
      const person = peopleById.get(studentId);
      if (!person) continue;
      const studentTrack =
        typeof person.metadata === "object" && person.metadata && "learning_track" in person.metadata
          ? String((person.metadata as Record<string, unknown>).learning_track ?? "Unknown")
          : "Unknown";

      for (const rule of candidateRules) {
        if ((rule.target_lesson ?? 0) !== lessonCount) continue;
        if (!trackMatches(rule.learning_track ?? "All", studentTrack)) continue;
        const key = `${studentId}|${lessonCount}|${rule.id}|${rule.playbook_version ?? "Current"}`;
        if (existingKeys.has(key)) continue;

        inserts.push({
          organization_id: organizationId,
          student_person_id: studentId,
          trigger_lesson: lessonCount,
          task_name: rule.task_name,
          task_type: asTaskType(rule.task_type),
          ops_instructions: rule.ops_description ?? "",
          status: "Pending",
          source_rule_id: rule.id,
          playbook_version: rule.playbook_version ?? "Current",
          student_name: person.display_name,
          instrument: latestInstrumentByStudent.get(studentId) ?? "Music",
          learning_track: studentTrack,
        });
        existingKeys.add(key);
      }
    }

    if (inserts.length > 0) {
      const { error } = await client.from("ops_tasks").insert(inserts);
      if (error) throw error;
    }

    return { ok: true as const, inserted: inserts.length };
  } catch (error) {
    const message = errorMessage(error, "Could not sync queue.");
    if (isMissingTableError(message)) {
      return syncQueueLegacy();
    }
    return { ok: false as const, status: 500, error: message };
  }
}
