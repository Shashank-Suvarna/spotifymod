import { NextResponse } from "next/server";
import { fetchSpotifyMetadata } from "@/lib/serverSpotify";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "hits";

  const playlist = await fetchSpotifyMetadata(q);
  return NextResponse.json({
    query: q,
    playlists: [playlist],
    tracks: playlist.tracks || [],
  });
}
