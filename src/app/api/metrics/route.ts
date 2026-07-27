import { route } from "@/lib/http"
import { getMetrics } from "@/lib/metrics"

export const dynamic = "force-dynamic"

export const GET = route(async () => {
  return await getMetrics()
})