export const FD_LOCATIONS = ["Andover", "Burlington", "Derry", "Remote"] as const;
export type FrontDeskLocation = (typeof FD_LOCATIONS)[number];

export type StaffScheduleLayer = "teacher" | "front-desk";

export type StaffShiftKind = "permanent" | "daily" | "master-preview";

export type StaffColumn = {
  key: string;
  label: string;
  location?: string;
};

export type StaffShiftBlock = {
  id: string;
  layer: StaffScheduleLayer;
  kind: StaffShiftKind;
  columnKey: string;
  date: string;
  weekDay: string;
  startMinutes: number;
  endMinutes: number;
  startTime: string;
  endTime: string;
  title: string;
  detail?: string;
  staffName: string;
  location?: string;
  roomId?: string;
  roomName?: string;
  instructorId?: string;
};

export type InstructorRegistryRow = {
  id: string;
  name: string;
  locations: string;
  status: string;
};

export type RoomRegistryRow = {
  id: string;
  name: string;
  location: string;
};

export type TeacherSchedulePayload = {
  layer: "teacher";
  date: string;
  weekDay: string;
  instructors: InstructorRegistryRow[];
  rooms: RoomRegistryRow[];
  shifts: StaffShiftBlock[];
};

export type FrontDeskSchedulePayload = {
  layer: "front-desk";
  fromDate: string;
  toDate: string;
  locations: FrontDeskLocation[];
  staffNames: string[];
  shifts: StaffShiftBlock[];
};

export type StaffSchedulePayload = TeacherSchedulePayload | FrontDeskSchedulePayload;
