import type { PostgrestFilterBuilder } from "@supabase/postgrest-js";

type JourneyRow = Record<string, unknown>;
type JourneySchema = {
  Tables: Record<string, never>;
  Views: Record<string, never>;
  Functions: Record<string, never>;
};

export type JourneyQueryBuilder = PostgrestFilterBuilder<
  JourneySchema,
  JourneyRow,
  JourneyRow[],
  "student_computed_traits",
  unknown
>;

export type JourneyRuleOperator = "eq" | "is_null" | "is_empty" | "contains_text";
export type JourneyRuleOperatorExtended = JourneyRuleOperator | "in" | "gt" | "gte" | "lt" | "lte";
export type JourneyRuleMatchMode = "all" | "any";
export type JourneyValueType = "text" | "number" | "currency" | "date" | "time" | "month";

// Single source of truth for explicit field typing.
// Keys should be lowercase column names.
export const JOURNEY_FIELD_TYPE_OVERRIDES: Record<string, JourneyValueType> = {
  birthday: "month",
  start: "time",
  end: "time",
  revenue_per_visit: "currency",
};

export interface JourneyCondition {
  field: string;
  operator: JourneyRuleOperatorExtended;
  value?: string;
  values?: string[];
  valueType?: JourneyValueType;
}

export function resolveJourneyFieldValueType(field: string, sample: unknown): JourneyValueType {
  const lower = field.toLowerCase();
  const override = JOURNEY_FIELD_TYPE_OVERRIDES[lower];
  if (override) return override;
  if (lower === "date") return "date";
  if (lower === "start" || lower === "end" || lower.includes("time")) return "time";
  if (lower === "birthday") return "month";
  if (lower.includes("revenue") || lower.includes("price") || lower.includes("amount")) return "currency";
  const text = sample === null || sample === undefined ? "" : String(sample).trim();
  if (!text) return "text";
  if (/^\$?-?\d{1,3}(,\d{3})*(\.\d+)?$/.test(text)) return lower.includes("revenue") ? "currency" : "number";
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return "date";
  if (/^\d{1,2}:\d{2}\s*(am|pm)$/i.test(text) || /^\d{1,2}:\d{2}$/.test(text)) return "time";
  if (/^\d{1,2}\/\d{4}$/.test(text)) return "month";
  return "text";
}

export interface JourneyRuleDefinition {
  id: string;
  label: string;
  matchMode: JourneyRuleMatchMode;
  conditions: JourneyCondition[];
}

export interface JourneyRule {
  id: string;
  label: string;
  applyFilter: (query: JourneyQueryBuilder) => JourneyQueryBuilder;
}

export const DEFAULT_JOURNEY_RULE_DEFINITIONS: JourneyRuleDefinition[] = [
  {
    id: "current-student",
    label: "Current Student",
    matchMode: "all",
    conditions: [{ field: "status", operator: "eq", value: "Active" }],
  },
  {
    id: "first-lesson",
    label: "First Lesson",
    matchMode: "all",
    conditions: [{ field: "completed_lesson", operator: "is_empty" }],
  },
  {
    id: "missing-phone-number",
    label: "Missing Phone Number",
    matchMode: "all",
    conditions: [{ field: "phone_numbers", operator: "is_empty" }],
  },
];

function isNumericToken(value: string) {
  return /^-?\d+(\.\d+)?$/.test(value.trim());
}

function quoteForOr(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "\"\"";
  if (isNumericToken(trimmed)) return trimmed;
  return `"${trimmed.replace(/"/g, "\\\"")}"`;
}

function applyCondition(query: JourneyQueryBuilder, condition: JourneyCondition) {
  const field = condition.field.trim();
  if (!field) return query;
  const values = (condition.values ?? []).map((entry) => entry.trim()).filter(Boolean);
  const fallbackValue = condition.value?.trim() ?? "";
  const normalize = (value: string) => {
    if (condition.valueType === "currency") return value.replace(/[$,]/g, "");
    return value;
  };
  switch (condition.operator) {
    case "eq":
      return query.eq(field, normalize(values[0] ?? fallbackValue));
    case "in":
      return values.length ? query.in(field, values.map(normalize)) : query;
    case "gt":
      return query.gt(field, normalize(values[0] ?? fallbackValue));
    case "gte":
      return query.gte(field, normalize(values[0] ?? fallbackValue));
    case "lt":
      return query.lt(field, normalize(values[0] ?? fallbackValue));
    case "lte":
      return query.lte(field, normalize(values[0] ?? fallbackValue));
    case "is_null":
      return query.is(field, null);
    case "is_empty":
      return query.or(`${field}.is.null,${field}.eq.`);
    case "contains_text":
      return query.ilike(field, `%${values[0] ?? fallbackValue}%`);
    default:
      return query;
  }
}

function conditionToOrTokens(condition: JourneyCondition): string[] {
  const field = condition.field.trim();
  if (!field) return [];
  const values = (condition.values ?? []).map((entry) => entry.trim()).filter(Boolean);
  const fallbackValue = condition.value?.trim() ?? "";
  const normalize = (value: string) => {
    if (condition.valueType === "currency") return value.replace(/[$,]/g, "");
    return value;
  };
  switch (condition.operator) {
    case "eq": {
      const value = normalize(values[0] ?? fallbackValue);
      if (!value) return [];
      return [`${field}.eq.${quoteForOr(value)}`];
    }
    case "in":
      return values.length ? [`${field}.in.(${values.map(normalize).map(quoteForOr).join(",")})`] : [];
    case "gt": {
      const value = normalize(values[0] ?? fallbackValue);
      if (!value) return [];
      return [`${field}.gt.${quoteForOr(value)}`];
    }
    case "gte": {
      const value = normalize(values[0] ?? fallbackValue);
      if (!value) return [];
      return [`${field}.gte.${quoteForOr(value)}`];
    }
    case "lt": {
      const value = normalize(values[0] ?? fallbackValue);
      if (!value) return [];
      return [`${field}.lt.${quoteForOr(value)}`];
    }
    case "lte": {
      const value = normalize(values[0] ?? fallbackValue);
      if (!value) return [];
      return [`${field}.lte.${quoteForOr(value)}`];
    }
    case "is_null":
      return [`${field}.is.null`];
    case "is_empty":
      return [`${field}.is.null`, `${field}.eq.""`];
    case "contains_text": {
      const value = values[0] ?? fallbackValue;
      if (!value) return [];
      return [`${field}.ilike.*${value.replace(/\*/g, "")}*`];
    }
    default:
      return [];
  }
}

export function buildJourneyRules(definitions: JourneyRuleDefinition[]): JourneyRule[] {
  return definitions.map((definition) => ({
    id: definition.id,
    label: definition.label,
    applyFilter: (query) => {
      const conditions = definition.conditions ?? [];
      if (!conditions.length) return query;
      if (definition.matchMode === "any") {
        const tokens = conditions.flatMap(conditionToOrTokens);
        return tokens.length ? query.or(tokens.join(",")) : query;
      }
      let next = query;
      for (const condition of conditions) {
        next = applyCondition(next, condition);
      }
      return next;
    },
  }));
}

export const JOURNEY_RULES: JourneyRule[] = buildJourneyRules(DEFAULT_JOURNEY_RULE_DEFINITIONS);
