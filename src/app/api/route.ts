import { NextResponse } from "next/server"
import { isDockerAvailable } from "@/lib/docker"

export const dynamic = "force-dynamic"

export async function GET() {
  let docker: boolean | null = null
  try {
    docker = await isDockerAvailable()
  } catch {
    docker = null
  }
  return NextResponse.json({
    name: "slipway",
    ok: true,
    docker: docker === true ? "available" : docker === false ? "unavailable" : "unknown",
    time: new Date().toISOString(),
  })
}