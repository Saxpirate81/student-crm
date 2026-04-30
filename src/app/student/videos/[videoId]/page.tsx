"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { StudentVideoTheater } from "@/components/student/StudentVideoTheater";
import { useRepository } from "@/lib/useRepository";

export default function VideoDetailPage() {
  const { repository } = useRepository();
  const params = useParams<{ videoId: string }>();
  const video = repository.getVideo(params.videoId);

  if (!video) {
    return (
      <div className="card text-center">
        <div className="card-title">Video not found</div>
        <p className="section-sub">That clip may have been removed or archived.</p>
        <Link href="/student" className="btn btn-primary mt-4 inline-flex">
          Back to library
        </Link>
      </div>
    );
  }

  return (
    <div className="student-detail-view">
      <div className="student-detail-inner">
        <header className="studio-hero lesson-detail-hero compact">
          <div className="min-w-0 space-y-1">
            <p className="card-title">Now watching</p>
            <h1>{video.title}</h1>
          </div>
          <Link
            href="/student"
            className="btn btn-secondary shrink-0"
          >
            ← Library
          </Link>
        </header>

        <StudentVideoTheater video={video} hideMetronomePanel />
      </div>
    </div>
  );
}
