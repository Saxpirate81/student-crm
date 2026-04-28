"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActivityEvent } from "@/lib/domain/types";
import {
  loadParentActivityReadIds,
  markParentActivityEventsRead,
} from "@/lib/parent/parent-activity-read-store";

export function ActivityFeed({
  events,
  compareHref,
  parentCrmId,
}: {
  events: ActivityEvent[];
  compareHref: string;
  parentCrmId: string;
}) {
  const [readIds, setReadIds] = useState<string[]>([]);

  useEffect(() => {
    setReadIds(loadParentActivityReadIds(parentCrmId));
  }, [parentCrmId]);

  const readSet = useMemo(() => new Set(readIds), [readIds]);
  const unreadCount = useMemo(() => events.filter((event) => !readSet.has(event.id)).length, [events, readSet]);

  const markAllRead = useCallback(() => {
    if (!events.length) return;
    markParentActivityEventsRead(
      parentCrmId,
      events.map((event) => event.id),
    );
    setReadIds(loadParentActivityReadIds(parentCrmId));
  }, [events, parentCrmId]);

  if (!events.length) {
    return (
      <section className="card">
        <div className="card-header">
          <div className="card-title">Activity</div>
        </div>
        <p className="section-sub">Household wins will appear here as students practice and instructors post updates.</p>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Activity</div>
          <div className="section-sub">
            Latest practice, uploads, milestones, and comments across your students.
            {unreadCount ? ` · ${unreadCount} new` : ""}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {unreadCount ? (
            <button className="btn btn-sm" type="button" onClick={markAllRead}>
              Mark read
            </button>
          ) : null}
          <Link className="btn btn-sm" href={compareHref}>
            Compare videos
          </Link>
        </div>
      </div>
      <div className="activity-feed">
        {events.slice(0, 14).map((event) => (
          <div className={`activity-feed-row ${readSet.has(event.id) ? "" : "unread"}`} key={event.id}>
            <span className="activity-feed-dot" aria-hidden />
            <div className="activity-feed-body">
              <div className="activity-feed-title">{event.title}</div>
              {event.detail ? <div className="activity-feed-detail">{event.detail}</div> : null}
              <div className="activity-feed-meta">
                {new Date(event.createdAt).toLocaleString()} · {event.kind.replace(/_/g, " ")}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
