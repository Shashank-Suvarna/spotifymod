import { NextResponse } from "next/server";
import { fetchSpotifyMetadata } from "@/lib/serverSpotify";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const playlist = await fetchSpotifyMetadata(id);
    return NextResponse.json(playlist);
  } catch (error: any) {
    console.error("Error in /api/playlists/[id]:", error);
    return NextResponse.json(
      { detail: error.message || "Failed to fetch playlist" },
      { status: 500 }
    );
  }
}
