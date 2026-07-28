import { requireAuth } from "@/lib/server-auth"
import { isDockerAvailable, dockerClient } from "@/lib/docker"
import { sanitize } from "@/lib/host-health"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// ponytail: severity from the cleaned line text. Postgres/Go panics are
// critical; the rest map to the viewer's level colors. Parsed server-side so
// the client never re-scans.
function severityOf(line: string): "critical" | "error" | "warn" | "info" {
  if (/^PANIC\b|panic:|\bfatal:|\bcould not write\b/i.test(line)) return "critical"
  if (/\bERROR\b|\bERR\b|\bFATAL\b|Error:/i.test(line)) return "error"
  if (/\bWARN(ING)?\b/i.test(line)) return "warn"
  return "info"
}

/**
 * SSE stream of live container logs from the Docker engine. No fallback:
 * with the engine down there are no containers, so the stream reports that and
 * closes. With the engine up, it tails stdout/stderr of every running container.
 *
 * ROOT CAUSE of the □□□□ (tofu) boxes: dockerode `.logs({stdout,stderr})` on a
 * non-TTY container returns a MULTIPLEXED stream — an 8-byte header per frame
 * [streamType:1][length:4 BE][payload]. Decoding that header as UTF-8 produced
 * the stray chars (b, }, s, u, t, c, @ = the low byte of the 4-byte length)
 * before every timestamp. We now demux frame-by-frame, accumulating across
 * chunks (a frame may span chunks), and split the demuxed payload on newlines
 * (a line may span frames). Sanitize + parse severity once, here, so the client
 * only renders clean text.
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

          // Per-container demux state: pending = bytes not yet a complete frame;
          // lineBuf = demuxed text not yet terminated by \n.
          let pending = Buffer.alloc(0)
          let lineBuf = ""

          const onLine = (line: string) => {
            // dockerode `.logs` with `timestamps` prefixes each line with an ISO
            // timestamp; strip it before sanitizing + severity parsing.
            const raw = sanitize(line.replace(/^\d{4}-\d{2}-\d{2}T[\d:.Z+-]+ /, ""))
            if (!raw) return
            send({
              id: `log-${counter++}`,
              ts: Date.now(),
              level: severityOf(raw),
              service: name,
              message: raw.slice(0, 4000),
            })
          }

          const onData = (chunk: Buffer) => {
            pending = Buffer.concat([pending, chunk])
            let text = ""
            let off = 0
            // demux complete frames; stop at the first incomplete one
            if (pending.length >= 8) {
              while (off + 8 <= pending.length) {
                const len = pending.readUInt32BE(off + 4)
                if (off + 8 + len > pending.length) break
                text += pending.subarray(off + 8, off + 8 + len).toString("utf8")
                off += 8 + len
              }
              pending = pending.subarray(off)
            }
            // TTY streams have no framing — the whole buffer is payload
            if (off === 0 && pending.length) {
              text = pending.toString("utf8")
              pending = pending.subarray(pending.length)
            }
            if (!text) return
            lineBuf += text
            const lines = lineBuf.split("\n")
            lineBuf = lines.pop() ?? ""
            for (const line of lines) onLine(line)
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