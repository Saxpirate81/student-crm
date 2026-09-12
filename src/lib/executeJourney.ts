import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { JOURNEY_RULES, buildJourneyRules, type JourneyQueryBuilder, type JourneyRuleDefinition } from "@/lib/journeyRules";

export type ExecuteJourneyOptions = {
  limit?: number;
  countOnly?: boolean;
  ruleDefinitions?: JourneyRuleDefinition[];
};

export type ExecuteJourneyResult = {
  rows: Record<string, unknown>[];
  totalCount: number;
};

function applySelectedRules(query: JourneyQueryBuilder, selectedRuleIds: string[], rules = JOURNEY_RULES) {
  let next = query;
  for (const selectedRuleId of selectedRuleIds) {
    const rule = rules.find((entry) => entry.id === selectedRuleId);
    if (!rule) continue;
    next = rule.applyFilter(next);
  }
  return next;
}

export async function executeJourney(selectedRuleIds: string[], options?: ExecuteJourneyOptions): Promise<ExecuteJourneyResult> {
  const supabase = getSupabaseBrowserClient();
  const sourceTable = process.env.NEXT_PUBLIC_JOURNEY_SOURCE_TABLE ?? "master_attendance_data";
  const runtimeRules = options?.ruleDefinitions?.length ? buildJourneyRules(options.ruleDefinitions) : JOURNEY_RULES;

  if (options?.countOnly) {
    const countQuery = applySelectedRules(
      supabase.from(sourceTable).select("*", { head: true, count: "exact" }) as JourneyQueryBuilder,
      selectedRuleIds,
      runtimeRules,
    );
    const { count, error } = await countQuery;
    if (error) throw error;
    return { rows: [], totalCount: count ?? 0 };
  }

  let query = applySelectedRules(
    supabase.from(sourceTable).select("*", { count: "planned" }) as JourneyQueryBuilder,
    selectedRuleIds,
    runtimeRules,
  );
  if (options?.limit && options.limit > 0) {
    query = query.limit(options.limit) as JourneyQueryBuilder;
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return {
    rows: (data ?? []) as Record<string, unknown>[],
    totalCount: count ?? ((data ?? []).length || 0),
  };
}
