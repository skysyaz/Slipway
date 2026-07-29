import { route } from "@/lib/http"
import { publicIp } from "@/lib/routing"

export const dynamic = "force-dynamic"

// The server's public IP for sslip.io domain generation. null when not set —
// the client disables the sslip mode with "Set the server's public IP".
export const GET = route(async () => {
  return { publicIp: publicIp() }
})
