import { requireAuth } from "@/lib/server-auth"
import { isDockerAvailable, dockerClient } from "@/lib/docker"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * SSE stream of live container logs from the Docker engine. No fallback:
 * with the engine down there are no containers, so the stream reports that and
 * closes. With the engine up, it tails stdout/stderr of every running container.
 */
export async function GET(req: Request) {
  await requireAuth(req as never)

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let counter = 0
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
      }

      const cleanup = new Set<() => void>()
      const close = () => {
        for (const fn of cleanup) {
          try { fn() } catch { /* ignore */ }
        }
        try { controller.close() } catch { /* already closed */ }
      }

      // If the client disconnects, tear everything down.
      req.signal?.addEventListener("abort", close)

      if (!(await isDockerAvailable())) {
        send({ id: `log-${counter++}`, ts: Date.now(), level: "system", service: "slipway", message: "Docker engine unavailable — no containers to stream." })
        return close()
      }

      const docker = dockerClient()
      if (!docker) {
        send({ id: `log-${counter++}`, ts: Date.now(), level: "error", service: "slipway", message: "Docker client not initialized." })
        return close()
      }

      try {
        const containers = await docker.listContainers({ all: false })
        if (containers.length === 0) {
          send({ id: `log-${counter++}`, ts: Date.now(), level: "system", service: "slipway", message: "No running containers." })
        }

        for (const c of containers) {
          const name = (c.Names?.[0] || c.Id.slice(0, 12)).replace(/^\//, "")
          const logStream = await docker.getContainer(c.Id).logs({
            follow: true,
            stdout: true,
            stderr: true,
            timestamps: true,
            tail: 200,
          })
          let buf = ""
          const onData = (chunk: Buffer) => {
            // dockerode multiplexed stream: 8-byte header per frame on stdout/stderr.
            // The `.logs` stream with `timestamps` prefixes each line with an ISO timestamp.
            buf += chunk.toString("utf8")
            const lines = buf.split("\n")
            buf = lines.pop() || ""
            for (const line of lines) {
              const raw = line.replace(/^\d{4}-\d{2}-\d{2}T[\d:.Z-]+ /, "")
              if (!raw) continue
              send({
                id: `log-${counter++}`,
                ts: Date.now(),
                level: "info",
                service: name,
                message: raw.slice(0, 4000),
              })
            }
          }
          logStream.on("data", onData as never)
          logStream.on("error", () => {})
          cleanup.add(() => {
            logStream.removeListener("data", onData as never)
            try { (logStream as { destroy?: () => void }).destroy?.() } catch { /* ignore */ }
          })
        }
      } catch (e) {
        send({ id: `log-${counter++}`, ts: Date.now(), level: "error", service: "slipway", message: `Failed to list containers: ${(e as Error).message}` })
      }
    },
    cancel() {
      // client gone; the abort listener + ReadableStream cancellation handle cleanup
    },
  })

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  })
}