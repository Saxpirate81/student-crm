"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { MessageArchiveView } from "@/components/messaging/MessageArchiveView";
import { CadenzaSimpleShell } from "@/components/shell/CadenzaSimpleShell";

const roleParam = ["student", "parent", "instructor", "admin", "producer"] as const;
type Role = (typeof roleParam)[number];

function isRole(value: string | null): value is Role {
  return !!value && (roleParam as readonly string[]).includes(value);
}

const homeByRole: Record<Role, string> = {
  student: "/student",
  parent: "/parent",
  instructor: "/instructor",
  admin: "/admin",
  producer: "/producer",
};

function MessageArchivePageInner() {
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const viewerRole: Role = isRole(from) ? from : "instructor";

  return (
    <CadenzaSimpleShell
      title="Past messages"
      right={
        <Link className="btn btn-ghost" href={homeByRole[viewerRole]}>
          Back
        </Link>
      }
    >
      <MessageArchiveView viewerRole={viewerRole} />
    </CadenzaSimpleShell>
  );
}

export default function MessageArchivePage() {
  return (
    <Suspense
      fallback={
        <div className="cadenza-app" data-theme="dark" style={{ inset: 0, position: "fixed", zIndex: 70 }}>
          <div className="c-main" style={{ width: "100%" }}>
            <div className="topbar">
              <div className="page-title">Past messages</div>
            </div>
            <div className="content">
              <p className="mb-sub">Loading messages…</p>
            </div>
          </div>
        </div>
      }
    >
      <MessageArchivePageInner />
    </Suspense>
  );
}
