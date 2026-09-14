import { NextResponse } from "next/server";
import { fetchSpotifyMetadata } from "@/lib/serverSpotify";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const urlOrId = body.url_or_id || body.url || "";
    if (!urlOrId.trim()) {
      return NextResponse.json({ detail: "Missing URL or playlist ID" }, { status: 400 });
    }

    const playlist = await fetchSpotifyMetadata(urlOrId);
    return NextResponse.json(playlist);
  } catch (error: any) {
    console.error("Error in /api/playlists/import:", error);
    return NextResponse.json(
      { detail: error.message || "Failed to import playlist" },
      { status: 500 }
    );
  }
}
