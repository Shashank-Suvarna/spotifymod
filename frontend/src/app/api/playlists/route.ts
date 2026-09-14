import { NextResponse } from "next/server";
import { playlistCache, generateMockPlaylist } from "@/lib/serverSpotify";

export async function GET() {
  try {
    const playlists = Array.from(playlistCache.values());
    if (playlists.length === 0) {
      return NextResponse.json([
        generateMockPlaylist("today_top_hits"),
        generateMockPlaylist("demo_500_track_mega_playlist"),
      ]);
    }
    return NextResponse.json(playlists);
  } catch (error: any) {
    console.error("Error in /api/playlists:", error);
    return NextResponse.json(
      { detail: error.message || "Failed to fetch playlists" },
      { status: 500 }
    );
  }
}
