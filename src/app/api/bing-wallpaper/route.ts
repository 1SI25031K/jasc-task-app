import { fetchBingTodayWallpaper } from "@/lib/bing";
import { NextResponse } from "next/server";

export async function GET() {
  const wallpaper = await fetchBingTodayWallpaper();
  return NextResponse.json({ wallpaper });
}
