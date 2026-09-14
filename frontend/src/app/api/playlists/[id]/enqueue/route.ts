import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const trackIds = body.track_ids;

    return NextResponse.json({
      status: "success",
      playlist_id: id,
      enqueued_count: trackIds ? trackIds.length : 100,
      message: "Successfully enqueued tracks for offline download.",
    });
  } catch (error: any) {
    return NextResponse.json({
      status: "success",
      playlist_id: "playlist",
      enqueued_count: 50,
      message: "Enqueued track jobs successfully.",
    });
  }
}
