import { getOpsStaffClient } from "@/lib/ops-staff-schedule/ops";
import type { InstructorRegistryRow, RoomRegistryRow } from "@/lib/ops-staff-schedule/types";

type InstructorDb = {
  id: string;
  name: string;
  locations: string | null;
  status: string | null;
};

type RoomDb = {
  id: string;
  name: string;
  location: string;
};

export async function listInstructorRegistry(): Promise<InstructorRegistryRow[]> {
  const client = getOpsStaffClient();
  const { data, error } = await client
    .from("instructor_registry")
    .select("id, name, locations, status")
    .order("name", { ascending: true });
  if (error) throw new Error(`Failed to load instructor registry: ${error.message}`);
  return ((data ?? []) as InstructorDb[])
    .map((row) => ({
      id: row.id,
      name: row.name,
      locations: row.locations ?? "",
      status: row.status ?? "active",
    }))
    .filter((row) => row.status !== "archived" && row.status !== "inactive");
}

export async function listRoomRegistry(): Promise<RoomRegistryRow[]> {
  const client = getOpsStaffClient();
  const { data, error } = await client
    .from("room_registry")
    .select("id, name, location")
    .order("location", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(`Failed to load room registry: ${error.message}`);
  return ((data ?? []) as RoomDb[]).map((row) => ({
    id: row.id,
    name: row.name,
    location: row.location,
  }));
}

export async function resolveInstructorId(staffName: string, rows?: InstructorRegistryRow[]) {
  const list = rows ?? (await listInstructorRegistry());
  const normalized = staffName.trim().toLowerCase();
  const match = list.find((row) => row.name.toLowerCase() === normalized);
  if (!match) throw new Error(`Instructor "${staffName}" was not found.`);
  return match.id;
}

export async function resolveRoomId(input: {
  location: string;
  roomName?: string;
  instructorId?: string;
  weekDay?: string;
}) {
  const rooms = await listRoomRegistry();
  if (input.roomName) {
    const normalized = input.roomName.trim().toLowerCase();
    const match = rooms.find(
      (room) => room.name.toLowerCase() === normalized && room.location === input.location,
    );
    if (match) return match.id;
    throw new Error(`Room "${input.roomName}" was not found for ${input.location}.`);
  }
  const locationRooms = rooms.filter((room) => room.location === input.location);
  if (!locationRooms.length) {
    throw new Error(`No room found for location "${input.location}".`);
  }
  return locationRooms[0]!.id;
}
