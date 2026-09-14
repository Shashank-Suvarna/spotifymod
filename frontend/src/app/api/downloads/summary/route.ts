import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    total_jobs: 0,
    pending_jobs: 0,
    downloading_jobs: 0,
    completed_jobs: 0,
    failed_jobs: 0,
    paused_jobs: 0,
    total_bytes_downloaded: 0,
    overall_speed_bytes_sec: 0,
    concurrency_limit: 3,
  });
}
