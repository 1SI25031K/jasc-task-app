import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    revalidatePath("/", "layout");
    return NextResponse.json({
      revalidated: true,
      now: new Date().toISOString(),
      message: "Cache revalidated successfully",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to revalidate", details: error?.message },
      { status: 500 }
    );
  }
}

