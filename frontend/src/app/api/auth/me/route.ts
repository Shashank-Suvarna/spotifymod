import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    id: "user_shashank",
    display_name: "Shashank Suvarna",
    email: "shashank@spotifymod.app",
    is_spotify_connected: true,
    images: [{ url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&h=300&fit=crop" }],
  });
}
