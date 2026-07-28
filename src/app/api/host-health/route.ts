import { route } from "@/lib/http"
import { getHostHealth } from "@/lib/host-health"

export const dynamic = "force-dynamic"
export const GET = route(async () => {
  const health = await getHostHealth()
  return health
})