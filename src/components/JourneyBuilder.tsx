"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_JOURNEY_RULE_DEFINITIONS,
  buildJourneyRules,
  resolveJourneyFieldValueType,
  type JourneyCondition,
  type JourneyRuleDefinition,
  type JourneyRuleMatchMode,
  type JourneyRuleOperatorExtended,
  type JourneyValueType,
} from "@/lib/journeyRules";
import { executeJourney } from "@/lib/executeJourney";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type SavedJourneySegment = {
  id: string;
  name: string;
  ruleIds: string[];
  updatedAt: string;
};

type ColumnValueMap = Record<string, string[]>;
type FieldValueMeta = Record<string, { scannedRows: number; truncated: boolean; offset: number }>;
type FieldValueSearchMap = Record<string, string>;
type FieldTypeMap = Record<string, JourneyValueType>;

const SEGMENT_STORAGE_KEY = "journey-builder-saved-segments-v1";
const DICTIONARY_STORAGE_KEY = "journey-builder-dictionary-v1";
const DRAFT_STORAGE_KEY = "journey-builder-draft-rule-v1";
const FIELD_VALUE_SCAN_LIMIT = 5000;
const FIELD_VALUE_BATCH_SIZE = 2000;

const OPERATOR_OPTIONS: Array<{ id: JourneyRuleOperatorExtended; label: string }> = [
  { id: "eq", label: "Equals" },
  { id: "gt", label: "Greater Than (>)" },
  { id: "gte", label: "Greater or Equal (>=)" },
  { id: "lt", label: "Less Than (<)" },
  { id: "lte", label: "Less or Equal (<=)" },
  { id: "in", label: "In (multi-select)" },
  { id: "is_null", label: "Is Null" },
  { id: "is_empty", label: "Is Empty (null or empty string)" },
  { id: "contains_text", label: "Contains Text" },
];

const OPERATOR_OPTIONS_BY_TYPE: Record<JourneyValueType, JourneyRuleOperatorExtended[]> = {
  text: ["eq", "in", "contains_text", "is_null", "is_empty"],
  number: ["eq", "gt", "gte", "lt", "lte", "is_null", "is_empty"],
  currency: ["eq", "gt", "gte", "lt", "lte", "is_null", "is_empty"],
  date: ["eq", "gt", "gte", "lt", "lte", "is_null", "is_empty"],
  time: ["eq", "gt", "gte", "lt", "lte", "is_null", "is_empty"],
  month: ["eq", "gt", "gte", "lt", "lte", "is_null", "is_empty"],
};

const emptyDraft: JourneyRuleDefinition = {
  id: "",
  label: "",
  matchMode: "all",
  conditions: [{ field: "", operator: "eq", value: "", values: [], valueType: "text" }],
};

export function JourneyBuilder() {
  const [viewMode, setViewMode] = useState<"builder" | "dictionary">("builder");
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [segmentName, setSegmentName] = useState("");
  const [savedSegments, setSavedSegments] = useState<SavedJourneySegment[]>([]);
  const [ruleDefinitions, setRuleDefinitions] = useState<JourneyRuleDefinition[]>(DEFAULT_JOURNEY_RULE_DEFINITIONS);
  const [isDictionaryOpen, setIsDictionaryOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [draftRule, setDraftRule] = useState<JourneyRuleDefinition>(emptyDraft);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [fieldNames, setFieldNames] = useState<string[]>([]);
  const [fieldValues, setFieldValues] = useState<ColumnValueMap>({});
  const [fieldValuesLoading, setFieldValuesLoading] = useState<Record<string, boolean>>({});
  const [fieldValueMeta, setFieldValueMeta] = useState<FieldValueMeta>({});
  const [fieldValueSearch, setFieldValueSearch] = useState<FieldValueSearchMap>({});
  const [fieldTypes, setFieldTypes] = useState<FieldTypeMap>({});
  const [valuePickerForCondition, setValuePickerForCondition] = useState<number | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const getStoredDraft = () => {
    try {
      const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { editingRuleId: string | null; draftRule: JourneyRuleDefinition };
      if (!parsed?.draftRule) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const clearStoredDraft = () => {
    try {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      // ignore local storage errors
    }
  };

  const runtimeRules = useMemo(() => buildJourneyRules(ruleDefinitions), [ruleDefinitions]);
  const selectedCount = useMemo(() => selectedRuleIds.length, [selectedRuleIds]);
  const previewColumns = useMemo(() => {
    if (!previewRows.length) return [];
    const preferred = [
      "crm_id",
      "student_name",
      "status",
      "learning_track",
      "total_completed_lessons",
      "phone_numbers",
      "primary_email",
      "primary_phone",
    ];
    const keys = Object.keys(previewRows[0]);
    const ordered = preferred.filter((key) => keys.includes(key));
    const remainder = keys.filter((key) => !ordered.includes(key));
    return [...ordered, ...remainder].slice(0, 8);
  }, [previewRows]);

  const makeEmptyCondition = (): JourneyCondition => ({
    field: "",
    operator: "eq",
    value: "",
    values: [],
    valueType: "text",
  });

  const normalizeDefinitions = (input: JourneyRuleDefinition[]) =>
    input.map((rule) => ({
      ...rule,
      matchMode: rule.matchMode ?? "all",
      conditions: (rule.conditions?.length ? rule.conditions : [makeEmptyCondition()]).map((condition) => ({
        field: condition.field ?? "",
        operator: condition.operator ?? "eq",
        value: condition.value ?? "",
        values: condition.values ?? [],
        valueType: condition.valueType ?? "text",
      })),
    }));

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SEGMENT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SavedJourneySegment[];
      if (!Array.isArray(parsed)) return;
      setSavedSegments(parsed);
    } catch {
      // ignore local storage read errors
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const sourceTable = process.env.NEXT_PUBLIC_JOURNEY_SOURCE_TABLE ?? "master_attendance_data";
    const loadFieldMetadata = async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const sample = await supabase.from(sourceTable).select("*").limit(1);
        if (sample.error || !sample.data?.[0] || cancelled) return;
        const first = sample.data[0] as Record<string, unknown>;
        const columns = Object.keys(first);
        setFieldNames(columns);
        const types: FieldTypeMap = {};
        for (const column of columns) {
          types[column] = resolveJourneyFieldValueType(column, first[column]);
        }
        setFieldTypes(types);
      } catch {
        // keep UI usable even if metadata fetch fails
      }
    };
    void loadFieldMetadata();
    return () => {
      cancelled = true;
    };
  }, []);

  const ensureFieldValuesLoaded = async (field: string, append = false) => {
    const normalized = field.trim();
    if (!normalized) return;
    if (!append && fieldValues[normalized]?.length) return;
    if (fieldValuesLoading[normalized]) return;

    setFieldValuesLoading((current) => ({ ...current, [normalized]: true }));
    try {
      const supabase = getSupabaseBrowserClient();
      const sourceTable = process.env.NEXT_PUBLIC_JOURNEY_SOURCE_TABLE ?? "master_attendance_data";
      const existingValues = append ? fieldValues[normalized] ?? [] : [];
      const seen = new Set<string>(existingValues);
      const orderedValues = [...existingValues];
      const currentOffset = append ? (fieldValueMeta[normalized]?.offset ?? existingValues.length) : 0;
      const targetRows = append ? currentOffset + FIELD_VALUE_BATCH_SIZE : FIELD_VALUE_SCAN_LIMIT;
      const orderColumn = fieldNames.includes("date")
        ? "date"
        : fieldNames.includes("created_at")
          ? "created_at"
          : fieldNames.includes("id")
            ? "id"
            : null;
      let query = supabase
        .from(sourceTable)
        .select(normalized)
        .not(normalized, "is", null)
        .range(currentOffset, targetRows - 1);
      if (orderColumn) {
        query = query.order(orderColumn, { ascending: false });
      }
      const res = await query;
      if (res.error) return;
      const rows = (res.data ?? []) as unknown as Array<Record<string, unknown>>;
      for (const row of rows) {
        const value = row[normalized];
        if (value === null || value === undefined) continue;
        const text = String(value).trim();
        if (!text) continue;
        if (seen.has(text)) continue;
        seen.add(text);
        orderedValues.push(text);
      }
      const scannedRows = rows.length;
      const nextOffset = currentOffset + scannedRows;
      setFieldValues((current) => ({
        ...current,
        [normalized]: orderedValues,
      }));
      setFieldValueMeta((current) => ({
        ...current,
        [normalized]: {
          scannedRows: nextOffset,
          truncated: scannedRows > 0 && scannedRows >= (append ? FIELD_VALUE_BATCH_SIZE : FIELD_VALUE_SCAN_LIMIT),
          offset: nextOffset,
        },
      }));
    } finally {
      setFieldValuesLoading((current) => ({ ...current, [normalized]: false }));
    }
  };

  const valuesForCondition = (condition: JourneyCondition) => {
    const all = fieldValues[condition.field] ?? [];
    const term = (fieldValueSearch[condition.field] ?? "").trim().toLowerCase();
    if (!term) return all;
    return all.filter((value) => value.toLowerCase().includes(term));
  };

  const operatorOptionsForCondition = (condition: JourneyCondition) => {
    const valueType = condition.valueType ?? "text";
    const allowed = OPERATOR_OPTIONS_BY_TYPE[valueType];
    return OPERATOR_OPTIONS.filter((option) => allowed.includes(option.id));
  };

  const formatConditionSummary = (condition: JourneyCondition) => {
    const operatorLabel = OPERATOR_OPTIONS.find((option) => option.id === condition.operator)?.label ?? condition.operator;
    const value = condition.operator === "in" ? (condition.values ?? []).join(", ") : condition.value ?? "";
    return `${condition.field || "field"} ${operatorLabel}${value ? ` ${value}` : ""}`;
  };

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DICTIONARY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as JourneyRuleDefinition[];
      if (!Array.isArray(parsed) || !parsed.length) return;
      setRuleDefinitions(normalizeDefinitions(parsed));
    } catch {
      // ignore malformed dictionary cache
    }
  }, []);

  const persistSegments = (next: SavedJourneySegment[]) => {
    setSavedSegments(next);
    try {
      window.localStorage.setItem(SEGMENT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore local storage write errors
    }
  };

  const persistDictionary = (next: JourneyRuleDefinition[]) => {
    setRuleDefinitions(next);
    try {
      window.localStorage.setItem(DICTIONARY_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore local storage write errors
    }
  };

  const toggleRule = (ruleId: string) => {
    setNotice(null);
    setSelectedRuleIds((current) =>
      current.includes(ruleId) ? current.filter((id) => id !== ruleId) : [...current, ruleId],
    );
  };

  const onPreviewAudience = async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const preview = await executeJourney(selectedRuleIds, { limit: 25, ruleDefinitions });
      setPreviewRows(preview.rows);
      setTotalCount(preview.totalCount);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not preview audience.";
      setError(message);
      setPreviewRows([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  const saveSegment = () => {
    const name = segmentName.trim();
    if (!name) {
      setNotice("Name this segment before saving.");
      return;
    }
    if (!selectedRuleIds.length) {
      setNotice("Select at least one rule before saving.");
      return;
    }
    const now = new Date().toISOString();
    const existing = savedSegments.find((segment) => segment.name.toLowerCase() === name.toLowerCase());
    const nextSegment: SavedJourneySegment = existing
      ? { ...existing, ruleIds: selectedRuleIds, updatedAt: now }
      : { id: `segment-${Date.now()}`, name, ruleIds: selectedRuleIds, updatedAt: now };
    const next = existing
      ? savedSegments.map((segment) => (segment.id === existing.id ? nextSegment : segment))
      : [nextSegment, ...savedSegments];
    persistSegments(next);
    setNotice(existing ? `Updated segment "${name}".` : `Saved segment "${name}".`);
  };

  const loadSegment = (segmentId: string) => {
    const segment = savedSegments.find((item) => item.id === segmentId);
    if (!segment) return;
    setSelectedRuleIds(segment.ruleIds);
    setSegmentName(segment.name);
    setNotice(`Loaded segment "${segment.name}".`);
  };

  const deleteSegment = (segmentId: string) => {
    const target = savedSegments.find((segment) => segment.id === segmentId);
    const next = savedSegments.filter((segment) => segment.id !== segmentId);
    persistSegments(next);
    if (target) setNotice(`Deleted segment "${target.name}".`);
  };

  const openNewRule = () => {
    setViewMode("dictionary");
    const fallbackDraft = {
      ...emptyDraft,
      id: `rule-${Date.now()}`,
    };
    const stored = getStoredDraft();
    setEditingRuleId(null);
    setDraftRule(stored && !stored.editingRuleId ? stored.draftRule : fallbackDraft);
    setDraftError(null);
    setIsDictionaryOpen(true);
  };

  const openEditRule = (rule: JourneyRuleDefinition) => {
    setViewMode("dictionary");
    const stored = getStoredDraft();
    setEditingRuleId(rule.id);
    setDraftRule(stored?.editingRuleId === rule.id ? stored.draftRule : rule);
    setDraftError(null);
    setIsDictionaryOpen(true);
  };

  useEffect(() => {
    if (!isDictionaryOpen) return;
    try {
      window.localStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({
          editingRuleId,
          draftRule,
          updatedAt: new Date().toISOString(),
        }),
      );
    } catch {
      // ignore local storage errors
    }
  }, [isDictionaryOpen, editingRuleId, draftRule]);

  useEffect(() => {
    if (!isDictionaryOpen) return;
    for (const condition of draftRule.conditions) {
      if (!condition.field?.trim()) continue;
      void ensureFieldValuesLoaded(condition.field);
    }
  }, [isDictionaryOpen, draftRule.conditions]);

  const validateDraftRule = (draft: JourneyRuleDefinition) => {
    if (!draft.id.trim()) return "Rule ID is required.";
    if (!draft.label.trim()) return "Rule label is required.";
    if (!draft.conditions.length) return "Add at least one condition.";
    for (const condition of draft.conditions) {
      if (!condition.field.trim()) return "Each condition needs a field.";
      if (
        (condition.operator === "eq" ||
          condition.operator === "contains_text" ||
          condition.operator === "gt" ||
          condition.operator === "gte" ||
          condition.operator === "lt" ||
          condition.operator === "lte") &&
        !String(condition.value ?? "").trim()
      ) {
        return "Each Equals/Contains condition needs a value.";
      }
      if (condition.operator === "in" && !(condition.values ?? []).length) {
        return "Each IN condition needs at least one selected value.";
      }
    }
    const duplicate = ruleDefinitions.find((rule) => rule.id === draft.id && rule.id !== editingRuleId);
    if (duplicate) return "Rule ID must be unique.";
    return null;
  };

  const saveDraftRule = () => {
    const nextDraft: JourneyRuleDefinition = {
      ...draftRule,
      id: draftRule.id.trim(),
      label: draftRule.label.trim(),
      conditions: draftRule.conditions.map((condition) => ({
        ...condition,
        field: condition.field.trim(),
        value: condition.value?.trim() ?? "",
        values: (condition.values ?? []).map((entry) => entry.trim()).filter(Boolean),
      })),
    };
    const validation = validateDraftRule(nextDraft);
    if (validation) {
      setDraftError(validation);
      return;
    }
    const next = editingRuleId
      ? ruleDefinitions.map((rule) => (rule.id === editingRuleId ? nextDraft : rule))
      : [...ruleDefinitions, nextDraft];
    persistDictionary(next);
    setIsDictionaryOpen(false);
    setEditingRuleId(null);
    setDraftRule(emptyDraft);
    setDraftError(null);
    clearStoredDraft();
    setNotice(editingRuleId ? `Updated rule "${nextDraft.label}".` : `Added rule "${nextDraft.label}".`);
  };

  const deleteRule = (ruleId: string) => {
    const target = ruleDefinitions.find((rule) => rule.id === ruleId);
    const next = ruleDefinitions.filter((rule) => rule.id !== ruleId);
    persistDictionary(next);
    setSelectedRuleIds((current) => current.filter((id) => id !== ruleId));
    if (target) setNotice(`Deleted rule "${target.label}".`);
  };

  const toggleDraftValue = (value: string) => {
    setDraftRule((current) => {
      const first = current.conditions[0] ?? makeEmptyCondition();
      const currentValues = first.values ?? [];
      const exists = currentValues.includes(value);
      return {
        ...current,
        conditions: [
          {
            ...first,
            values: exists ? currentValues.filter((entry) => entry !== value) : [...currentValues, value],
          },
          ...current.conditions.slice(1),
        ],
      };
    });
  };

  const updateCondition = (index: number, patch: Partial<JourneyCondition>) => {
    setDraftRule((current) => ({
      ...current,
      conditions: current.conditions.map((condition, idx) => (idx === index ? { ...condition, ...patch } : condition)),
    }));
  };

  const addCondition = () => {
    setDraftRule((current) => ({
      ...current,
      conditions: [...current.conditions, makeEmptyCondition()],
    }));
  };

  const removeCondition = (index: number) => {
    setDraftRule((current) => {
      const next = current.conditions.filter((_, idx) => idx !== index);
      return {
        ...current,
        conditions: next.length ? next : [makeEmptyCondition()],
      };
    });
  };

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Visual Rule Builder</div>
          <div className="section-sub">
            Rule controls are fully driven by the master dictionary. Selected rules: {selectedCount}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-sm" onClick={() => setIsHelpOpen(true)} title="How this works">
            ?
          </button>
          <button
            type="button"
            className={`btn btn-sm ${viewMode === "builder" ? "btn-primary" : ""}`}
            onClick={() => setViewMode("builder")}
          >
            Builder View
          </button>
          <button
            type="button"
            className={`btn btn-sm ${viewMode === "dictionary" ? "btn-primary" : ""}`}
            onClick={() => setViewMode("dictionary")}
          >
            Dictionary View
          </button>
        </div>
      </div>

      {viewMode === "builder" ? (
        <>
          <div className="flex flex-wrap gap-2">
            {runtimeRules.map((rule) => {
              const selected = selectedRuleIds.includes(rule.id);
              return (
                <button
                  key={rule.id}
                  type="button"
                  onClick={() => toggleRule(rule.id)}
                  className={`btn btn-sm ${selected ? "btn-primary" : ""}`}
                  aria-pressed={selected}
                >
                  {rule.label}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" onClick={() => void onPreviewAudience()} disabled={loading}>
              {loading ? "Previewing..." : "Preview Audience"}
            </button>
            <input
              className="inp min-w-[220px]"
              value={segmentName}
              onChange={(event) => setSegmentName(event.target.value)}
              placeholder="Segment name (e.g. L0 Missing Phone)"
            />
            <button type="button" className="btn btn-sm" onClick={saveSegment}>
              Save Segment
            </button>
            <span className="section-sub">{totalCount} total matches • showing first {previewRows.length}</span>
          </div>

          {notice ? <p className="mt-3 text-sm text-emerald-300">{notice}</p> : null}
          {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}

          {savedSegments.length ? (
            <div className="mt-4 space-y-2">
              <div className="text-xs uppercase tracking-wider text-slate-400">Saved Segments</div>
              <div className="space-y-2">
                {savedSegments.map((segment) => (
                  <div key={segment.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/10 px-3 py-2">
                    <div>
                      <div className="text-sm font-semibold">{segment.name}</div>
                      <div className="text-xs text-slate-400">
                        {segment.ruleIds.length} rules • updated {new Date(segment.updatedAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" className="btn btn-sm" onClick={() => loadSegment(segment.id)}>
                        Load
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => deleteSegment(segment.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {previewRows.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-400">
                    {previewColumns.map((column) => (
                      <th key={column} className="py-2 pr-4">{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, index) => (
                    <tr key={`preview-${index}`} className="border-b border-white/5">
                      {previewColumns.map((column) => (
                        <td key={`${index}-${column}`} className="py-2 pr-4 text-slate-200">
                          {String(row[column] ?? "—")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="mb-3 flex justify-end">
            <button type="button" className="btn btn-sm" onClick={openNewRule}>
              Add Dictionary Rule
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-400">
                  <th className="py-2 pr-4">Label</th>
                  <th className="py-2 pr-4">Field</th>
                  <th className="py-2 pr-4">Operator</th>
                  <th className="py-2 pr-4">Value</th>
                  <th className="py-2 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {ruleDefinitions.map((rule) => (
                  <tr key={rule.id} className="border-b border-white/5">
                    <td className="py-2 pr-4">{rule.label}</td>
                    <td className="py-2 pr-4 text-slate-300">{rule.conditions[0]?.field ?? "—"}</td>
                    <td className="py-2 pr-4 text-slate-300">
                      {rule.conditions[0]
                        ? OPERATOR_OPTIONS.find((opt) => opt.id === rule.conditions[0].operator)?.label ?? rule.conditions[0].operator
                        : "—"}
                    </td>
                    <td className="py-2 pr-4 text-slate-300">{rule.conditions[0]?.value || (rule.conditions[0]?.values?.join(", ") ?? "—")}</td>
                    <td className="py-2 pr-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button type="button" className="btn btn-sm" onClick={() => openEditRule(rule)}>
                          Edit
                        </button>
                        <button type="button" className="btn btn-sm" onClick={() => deleteRule(rule.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {notice ? <p className="mt-3 text-sm text-emerald-300">{notice}</p> : null}
        </>
      )}

      {isDictionaryOpen ? (
        <div className="fixed inset-0 z-[170] overflow-y-auto bg-black/75 p-4">
          <div className="card mx-auto my-3 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden border border-white/10 bg-slate-950/95">
            <div className="card-header">
              <div className="card-title">{editingRuleId ? "Edit Dictionary Rule" : "Add Dictionary Rule"}</div>
              <button type="button" className="btn btn-sm" onClick={() => setIsDictionaryOpen(false)}>
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1 pb-4">
              <div className="grid2 compact-grid">
              <label className="form-grp">
                <span className="form-lbl">Rule ID</span>
                <input
                  className="inp"
                  value={draftRule.id}
                  onChange={(event) => setDraftRule((current) => ({ ...current, id: event.target.value }))}
                  placeholder="e.g. active-student"
                />
              </label>
              <label className="form-grp">
                <span className="form-lbl">Label</span>
                <input
                  className="inp"
                  value={draftRule.label}
                  onChange={(event) => setDraftRule((current) => ({ ...current, label: event.target.value }))}
                  placeholder="What users see"
                />
              </label>
              <label className="form-grp">
                <span className="form-lbl">Condition Match Mode</span>
                <select
                  className="inp"
                  value={draftRule.matchMode}
                  onChange={(event) => setDraftRule((current) => ({ ...current, matchMode: event.target.value as JourneyRuleMatchMode }))}
                >
                  <option value="all">All conditions (AND)</option>
                  <option value="any">Any condition (OR)</option>
                </select>
              </label>
              <div className="form-grp wide">
                <div className="mb-2 flex items-center justify-between">
                  <span className="form-lbl">Conditions</span>
                  <button type="button" className="btn btn-sm" onClick={addCondition}>
                    Add Condition
                  </button>
                </div>
                <div className="space-y-3">
                  {draftRule.conditions.map((condition, index) => (
                    <div key={`condition-${index}`} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs text-slate-400">Condition {index + 1}</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => {
                              if (index === 0) return;
                              const copy = [...draftRule.conditions];
                              const prev = copy[index - 1];
                              copy[index - 1] = copy[index];
                              copy[index] = prev;
                              setDraftRule((current) => ({ ...current, conditions: copy }));
                            }}
                            disabled={index === 0}
                          >
                            Up
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => {
                              if (index === draftRule.conditions.length - 1) return;
                              const copy = [...draftRule.conditions];
                              const next = copy[index + 1];
                              copy[index + 1] = copy[index];
                              copy[index] = next;
                              setDraftRule((current) => ({ ...current, conditions: copy }));
                            }}
                            disabled={index === draftRule.conditions.length - 1}
                          >
                            Down
                          </button>
                          <button type="button" className="btn btn-sm" onClick={() => removeCondition(index)}>
                            Remove
                          </button>
                        </div>
                      </div>
                      <div className="mb-2 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs text-slate-300">
                        {formatConditionSummary(condition)}
                      </div>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                        <label className="form-grp">
                          <span className="form-lbl">Field</span>
                          <select
                            className="inp"
                            value={condition.field}
                            onChange={(event) => {
                              const nextField = event.target.value;
                              const nextType = fieldTypes[nextField] ?? "text";
                              const nextOperator = OPERATOR_OPTIONS_BY_TYPE[nextType][0] ?? "eq";
                              updateCondition(index, {
                                field: nextField,
                                value: "",
                                values: [],
                                valueType: nextType,
                                operator: nextOperator as JourneyRuleOperatorExtended,
                              });
                              void ensureFieldValuesLoaded(nextField);
                            }}
                          >
                            <option value="">Select column</option>
                            {fieldNames.map((field) => (
                              <option key={field} value={field}>
                                {field}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="form-grp">
                          <span className="form-lbl">Operator</span>
                          <select
                            className="inp"
                            value={condition.operator}
                            onChange={(event) =>
                              updateCondition(index, {
                                operator: event.target.value as JourneyRuleOperatorExtended,
                                value: "",
                                values: [],
                              })
                            }
                          >
                            {operatorOptionsForCondition(condition).map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="form-grp">
                          <span className="form-lbl">Value</span>
                          <input
                            className="inp"
                            value={condition.value ?? ""}
                            onChange={(event) => updateCondition(index, { value: event.target.value })}
                            placeholder="Enter value"
                            disabled={condition.operator === "in" || condition.operator === "is_null" || condition.operator === "is_empty"}
                            type={condition.valueType === "number" || condition.valueType === "currency" ? "number" : "text"}
                          />
                        </label>
                      </div>
                      <div className="form-grp mt-2">
                        <span className="form-lbl">Unique Field Results (multi-select)</span>
                        {fieldValuesLoading[condition.field] ? (
                          <span className="section-sub">Loading unique values...</span>
                        ) : null}
                        {!fieldValues[condition.field]?.length ? (
                          <span className="section-sub">No distinct values loaded for this field yet.</span>
                        ) : null}
                        {fieldValueMeta[condition.field]?.truncated ? (
                          <span className="section-sub">
                            Showing distinct values from first {fieldValueMeta[condition.field]?.scannedRows} rows for speed.
                          </span>
                        ) : null}
                        {condition.field ? (
                          <button
                            type="button"
                            className="btn btn-sm mt-2"
                            onClick={() => {
                              setValuePickerForCondition(index);
                              void ensureFieldValuesLoaded(condition.field, true);
                            }}
                            disabled={fieldValuesLoading[condition.field]}
                          >
                            Open Multi-Select Values
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              </div>
              {draftError ? <p className="mt-2 text-sm text-red-400">{draftError}</p> : null}
            </div>
            <div className="modal-acts shrink-0 border-t border-white/10 bg-slate-950/95 pt-3">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setEditingRuleId(null);
                  setDraftRule(emptyDraft);
                  setDraftError(null);
                  clearStoredDraft();
                }}
              >
                Clear Draft
              </button>
              <button type="button" className="btn btn-primary" onClick={saveDraftRule}>
                Save Rule
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {valuePickerForCondition !== null ? (
        <div className="fixed inset-0 z-[180] overflow-y-auto bg-black/70 p-4">
          <div className="card mx-auto my-6 flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden border border-white/10 bg-slate-950/95">
            <div className="card-header">
              <div className="card-title">Unique Field Results (multi-select)</div>
              <button type="button" className="btn btn-sm" onClick={() => setValuePickerForCondition(null)}>
                Done
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {(() => {
                const condition = draftRule.conditions[valuePickerForCondition];
                if (!condition) return null;
                return (
                  <>
                    <input
                      className="inp"
                      value={fieldValueSearch[condition.field] ?? ""}
                      onChange={(event) =>
                        setFieldValueSearch((current) => ({ ...current, [condition.field]: event.target.value }))
                      }
                      placeholder="Search values..."
                    />
                    <div className="mt-2 max-h-[50vh] overflow-y-auto rounded-lg border border-white/10 bg-black/10 p-2">
                      {valuesForCondition(condition).map((value) => {
                        const checked = (condition.values ?? []).includes(value);
                        return (
                          <label key={`picker-${value}`} className="flex items-center gap-2 px-1 py-1 text-sm">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const nextValues = condition.values ?? [];
                                const exists = nextValues.includes(value);
                                const selected = exists ? nextValues.filter((entry) => entry !== value) : [...nextValues, value];
                                updateCondition(valuePickerForCondition, {
                                  operator: selected.length ? "in" : "eq",
                                  values: selected,
                                  value: selected.length ? "" : condition.value ?? "",
                                });
                              }}
                            />
                            <span>{value}</span>
                          </label>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => void ensureFieldValuesLoaded(condition.field, true)}
                        disabled={fieldValuesLoading[condition.field]}
                      >
                        {fieldValuesLoading[condition.field] ? "Loading..." : "Load More Values"}
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      ) : null}

      {isHelpOpen ? (
        <div className="fixed inset-0 z-[181] overflow-y-auto bg-black/70 p-4">
          <div className="card mx-auto my-6 max-w-2xl border border-white/10 bg-slate-950/95">
            <div className="card-header">
              <div className="card-title">How Rule Builder Works</div>
              <button type="button" className="btn btn-sm" onClick={() => setIsHelpOpen(false)}>
                Close
              </button>
            </div>
            <div className="space-y-2 text-sm text-slate-200">
              <p>1) Add conditions in order. Use Up/Down to control interaction order.</p>
              <p>2) Pick a field. The builder detects type (text/number/date/time/currency).</p>
              <p>3) Operator list auto-adjusts to field type.</p>
              <p>4) For text-like fields, use Open Multi-Select Values to choose distinct values.</p>
              <p>5) Match mode: All = AND, Any = OR.</p>
              <p>6) Save the rule to dictionary, then toggle it in Builder View and preview audience.</p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
