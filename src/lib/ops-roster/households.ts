export type AttendanceContactRow = {
  student_id?: string | number | null;
  student_name?: string | null;
  primary_name?: string | null;
  primary_email?: string | null;
  student_email?: string | null;
  phone_numbers?: string | null;
  instructor_name?: string | null;
  description?: string | null;
  category?: string | null;
  product?: string | null;
  status?: string | null;
  date?: string | null;
  start?: string | null;
  end?: string | null;
  location?: string | null;
};

export type StudentService = {
  instructorId: string;
  instructorName: string;
  labels: string[];
};

export type RosterStudent = {
  crmId: string;
  displayName: string;
  primaryInstructorId: string;
  instructorIds: string[];
  parentCrmId: string;
  parentDisplayName: string;
  parentEmail: string;
  enrolledPrograms: Array<"lessons" | "bands" | "camps">;
  services: StudentService[];
};

export type RosterInstructor = {
  id: string;
  name: string;
  studentCount: number;
};

export function studentOptionLabel(
  student: { displayName: string; services?: Array<{ instructorId: string; labels: string[] }> },
  instructorId?: string,
) {
  const services = student.services ?? [];
  const labels = instructorId
    ? services.find((service) => service.instructorId === instructorId)?.labels ?? []
    : services.flatMap((service) => service.labels);
  const unique = [...new Set(labels)];
  return unique.length ? `${student.displayName} · ${unique.join(", ")}` : student.displayName;
}

const EXCLUDED_STATUS = /discontinu|cancel\s*-\s*school|school\s*-\s*cancel/;
const SCHEDULE_STATUSES = new Set([
  "scheduled",
  "rescheduled",
  "complete",
  "completed",
  "cancel - student",
  "cancel-student",
  "cancelled - student",
]);

export function normalizeAttendanceToken(value?: string | null) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function isExcludedAttendanceStatus(status?: string | null) {
  const normalized = normalizeAttendanceToken(status);
  if (!normalized) return false;
  return EXCLUDED_STATUS.test(normalized);
}

export function isVisibleScheduleStatus(status?: string | null) {
  return SCHEDULE_STATUSES.has(normalizeAttendanceToken(status));
}

export function isLessonCategory(category?: string | null) {
  const normalized = normalizeAttendanceToken(category);
  if (!normalized) return false;
  const compact = normalized.replace(/\s+/g, "");
  return normalized === "banked time" || normalized.includes("banked time") || compact === "service(lesson)";
}

export function normalizeEmail(value?: string | null) {
  const email = String(value ?? "").trim().toLowerCase();
  return email.includes("@") ? email : "";
}

export function normalizePersonName(value?: string | null) {
  const raw = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return "";
  if (raw.includes(",")) {
    const [last, ...rest] = raw.split(",").map((part) => part.trim()).filter(Boolean);
    const first = rest.join(" ");
    if (first && last) return `${first} ${last}`;
  }
  return raw;
}

export function extractPhones(value?: string | null) {
  const digits = String(value ?? "").replace(/\D/g, "");
  const phones = new Set<string>();
  let i = 0;
  while (i < digits.length) {
    if (digits.length - i >= 11 && digits[i] === "1") {
      phones.add(digits.slice(i + 1, i + 11));
      i += 11;
      continue;
    }
    if (digits.length - i >= 10) {
      phones.add(digits.slice(i, i + 10));
      i += 10;
      continue;
    }
    break;
  }
  return [...phones].filter((phone) => phone.length === 10);
}

function compactServiceLabel(value: string) {
  if (!value.includes(" : ")) return value;
  return value.split(/\s+:\s+/)[0]?.trim() || value;
}

export function serviceLabel(category?: string | null, description?: string | null) {
  const desc = String(description ?? "").trim();
  const cat = String(category ?? "").trim();
  const raw = isLessonCategory(cat) && desc ? desc : desc || cat || (isLessonCategory(cat) ? "Lesson" : "Program");
  return compactServiceLabel(raw);
}

export function instructorIdFromName(name?: string | null) {
  const nameKey = String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return nameKey ? `instr-${nameKey}` : "instr-unknown";
}

type Accumulator = {
  studentId: string;
  displayName: string;
  primaryName: string;
  emails: Set<string>;
  phones: Set<string>;
  instructorName: string;
  programs: Set<"lessons" | "bands" | "camps">;
  lastDate: string;
  services: Map<string, { instructorName: string; labels: Set<string> }>;
};

function asProgram(category?: string | null, description?: string | null): "lessons" | "bands" | "camps" {
  if (isLessonCategory(category)) return "lessons";
  const blob = `${category ?? ""} ${description ?? ""}`.toLowerCase();
  if (blob.includes("camp")) return "camps";
  if (blob.includes("band") || blob.includes("ensemble") || blob.includes("jam")) return "bands";
  return "lessons";
}

function upsertPerson(map: Map<string, Accumulator>, row: AttendanceContactRow) {
  const studentId = String(row.student_id ?? "").trim();
  if (!studentId || isExcludedAttendanceStatus(row.status)) return;

  const date = String(row.date ?? "").slice(0, 10);
  const existing = map.get(studentId);
  const displayName = normalizePersonName(row.student_name) || existing?.displayName || "Student";
  const primaryName = normalizePersonName(row.primary_name) || existing?.primaryName || "";
  const instructorName = String(row.instructor_name ?? "").trim() || existing?.instructorName || "";
  const next: Accumulator = existing ?? {
    studentId,
    displayName,
    primaryName,
    emails: new Set(),
    phones: new Set(),
    instructorName,
    programs: new Set(),
    lastDate: date,
    services: new Map(),
  };

  if (!existing || date >= existing.lastDate) {
    next.displayName = displayName || next.displayName;
    next.primaryName = primaryName || next.primaryName;
    next.instructorName = instructorName || next.instructorName;
    next.lastDate = date || next.lastDate;
  }
  const primaryEmail = normalizeEmail(row.primary_email);
  const studentEmail = normalizeEmail(row.student_email);
  if (primaryEmail) next.emails.add(primaryEmail);
  if (studentEmail) next.emails.add(studentEmail);
  for (const phone of extractPhones(row.phone_numbers)) next.phones.add(phone);
  next.programs.add(asProgram(row.category, row.description));
  if (instructorName) {
    const instructorId = instructorIdFromName(instructorName);
    const service = next.services.get(instructorId) ?? {
      instructorName: normalizePersonName(instructorName) || instructorName,
      labels: new Set<string>(),
    };
    service.labels.add(serviceLabel(row.category, row.description));
    next.services.set(instructorId, service);
  }
  map.set(studentId, next);
}

function unionFind(ids: string[]) {
  const parent = new Map(ids.map((id) => [id, id]));
  const rank = new Map(ids.map((id) => [id, 0]));

  function find(id: string): string {
    const current = parent.get(id) ?? id;
    if (current !== id) {
      const root = find(current);
      parent.set(id, root);
      return root;
    }
    return current;
  }

  function union(a: string, b: string) {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) return;
    const rankA = rank.get(rootA) ?? 0;
    const rankB = rank.get(rootB) ?? 0;
    if (rankA < rankB) parent.set(rootA, rootB);
    else if (rankA > rankB) parent.set(rootB, rootA);
    else {
      parent.set(rootB, rootA);
      rank.set(rootA, rankA + 1);
    }
  }

  return { find, union };
}

export function buildRosterFromAttendance(rows: AttendanceContactRow[]): RosterStudent[] {
  const people = new Map<string, Accumulator>();
  for (const row of rows) upsertPerson(people, row);

  const ids = [...people.keys()];
  const { find, union } = unionFind(ids);
  const byEmail = new Map<string, string>();
  const byPhone = new Map<string, string>();

  for (const person of people.values()) {
    for (const email of person.emails) {
      const prev = byEmail.get(email);
      if (prev) union(prev, person.studentId);
      else byEmail.set(email, person.studentId);
    }
    for (const phone of person.phones) {
      const prev = byPhone.get(phone);
      if (prev) union(prev, person.studentId);
      else byPhone.set(phone, person.studentId);
    }
  }

  const byName = new Map<string, string>();
  for (const person of people.values()) {
    if (person.emails.size || person.phones.size) continue;
    const key = person.primaryName.trim().toLowerCase();
    if (!key) continue;
    const prev = byName.get(key);
    if (prev) union(prev, person.studentId);
    else byName.set(key, person.studentId);
  }

  const householdMeta = new Map<string, { name: string; email: string }>();
  for (const person of people.values()) {
    const root = find(person.studentId);
    const current = householdMeta.get(root) ?? { name: "", email: "" };
    if (!current.name && person.primaryName) current.name = person.primaryName;
    if (!current.email && person.emails.size) current.email = [...person.emails][0] ?? "";
    householdMeta.set(root, current);
  }

  return [...people.values()]
    .map((person): RosterStudent => {
      const root = find(person.studentId);
      const household = householdMeta.get(root);
      const programs = [...person.programs];
      const services = [...person.services.entries()].map(([instructorId, service]) => ({
        instructorId,
        instructorName: service.instructorName,
        labels: [...service.labels],
      }));
      const instructorIds = services.map((service) => service.instructorId);
      return {
        crmId: person.studentId,
        displayName: person.displayName,
        primaryInstructorId: instructorIdFromName(person.instructorName),
        instructorIds,
        parentCrmId: `hh:${root}`,
        parentDisplayName: household?.name || person.primaryName || "Parent",
        parentEmail: household?.email || [...person.emails][0] || "",
        enrolledPrograms: programs.length ? programs : ["lessons"],
        services,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function buildInstructorsFromStudents(students: RosterStudent[]): RosterInstructor[] {
  const counts = new Map<string, { name: string; studentIds: Set<string> }>();
  for (const student of students) {
    for (const service of student.services) {
      const current = counts.get(service.instructorId) ?? {
        name: service.instructorName,
        studentIds: new Set<string>(),
      };
      current.studentIds.add(student.crmId);
      counts.set(service.instructorId, current);
    }
  }
  return [...counts.entries()]
    .map(([id, value]) => ({
      id,
      name: value.name,
      studentCount: value.studentIds.size,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
