/**
 * Activity + notification dispatch. Called by mutations to record an event
 * and fan it out to in-app notifications, webhooks, and integrations.
 *
 * Integration delivery: Slack/Discord/Teams/Telegram/PagerDuty webhooks +
 * SMTP email via nodemailer. All best-effort — failures are logged, never
 * thrown to the caller.
 */
import { db } from "./db"

export type EventKind =
  | "deploy.success"
  | "deploy.failed"
  | "deploy.building"
  | "rollback"
  | "backup.completed"
  | "backup.failed"
  | "ssl.expiring"
  | "server.degraded"
  | "database.created"
  | "volume.created"
  | "domain.added"
  | "server.connected"
  | "system"

export async function recordActivity(
  kind: string,
  message: string,
  opts: { projectId?: string; userId?: string; actor?: string } = {}
) {
  return db.activityEvent.create({
    data: {
      kind,
      message,
      projectId: opts.projectId ?? null,
      userId: opts.userId ?? null,
      actor: opts.actor ?? "you",
    },
  })
}

export async function pushNotification(
  title: string,
  body: string,
  opts: { level?: string; kind?: string; projectId?: string } = {}
) {
  return db.notification.create({
    data: {
      title,
      body,
      level: opts.level || "info",
      kind: opts.kind || "system",
      projectId: opts.projectId ?? null,
    },
  })
}

/** Record activity + in-app notification together. */
export async function emit(
  eventKind: EventKind,
  activityKind: string,
  message: string,
  notif: { title: string; body: string; level?: string; kind?: string },
  opts: { projectId?: string; userId?: string; actor?: string } = {}
) {
  await Promise.all([
    recordActivity(activityKind, message, opts),
    pushNotification(notif.title, notif.body, {
      level: notif.level,
      kind: notif.kind,
      projectId: opts.projectId,
    }),
  ])
  // Fire-and-forget external delivery; never let it break the caller.
  dispatchExternal(eventKind, { title: notif.title, body: notif.body }, { projectId: opts.projectId }).catch((e) => {
    console.error("[notify] external dispatch failed:", e instanceof Error ? e.message : e)
  })
}

/**
 * Fan an event out to all configured webhooks + active integrations.
 * Best-effort: each target is tried independently and failures are swallowed.
 *
 *   - webhooks:        HTTP POST JSON to each Webhook whose events include this kind
 *   - slack/discord/teams/telegram: integrations holding a webhook URL, POST their native payload
 *   - pagerduty:       integration holding a routing_key, POST an event to the Events API
 *   - email:           integration holding SMTP config, send via nodemailer
 */
export async function dispatchExternal(
  event: EventKind,
  payload: { title: string; body: string },
  opts: { projectId?: string } = {}
): Promise<void> {
  const envelope = {
    event,
    title: payload.title,
    body: payload.body,
    projectId: opts.projectId ?? null,
    ts: new Date().toISOString(),
  }

  // 1) Generic webhooks (filtered by subscribed events).
  try {
    const hooks = await db.webhook.findMany({ where: { active: true } })
    await Promise.all(
      hooks.map(async (h) => {
        const events = JSON.parse(h.events || "[]") as string[]
        if (events.length && !events.includes(event)) return
        await postJson(h.url, envelope)
      })
    )
  } catch (e) {
    console.error("[notify] webhook dispatch error:", e instanceof Error ? e.message : e)
  }

  // 2) Integrations by kind.
  try {
    const integrations = await db.integration.findMany({ where: { active: true } })
    await Promise.all(
      integrations.map((i) => deliverIntegration(i.kind, JSON.parse(i.config || "{}"), envelope).catch((e) => {
        console.error(`[notify] integration ${i.kind} failed:`, e instanceof Error ? e.message : e)
      }))
    )
  } catch (e) {
    console.error("[notify] integration dispatch error:", e instanceof Error ? e.message : e)
  }
}

async function postJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
}

async function deliverIntegration(
  kind: string,
  config: Record<string, unknown>,
  env: { event: string; title: string; body: string; ts: string }
): Promise<void> {
  switch (kind) {
    case "slack":
    case "discord":
    case "teams": {
      // All three accept an incoming-webhook JSON body. Slack/Teams use
      // {text}; Discord uses {content}.
      const url = String(config.url || config.webhook || "")
      if (!url) return
      const body =
        kind === "discord"
          ? { content: `*${env.title}* — ${env.body}` }
          : { text: `*${env.title}* — ${env.body}` }
      await postJson(url, body)
      return
    }
    case "telegram": {
      const token = String(config.token || "")
      const chatId = String(config.chatId || config.chat_id || "")
      if (!token || !chatId) return
      await postJson(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chatId,
        text: `*${env.title}* — ${env.body}`,
        parse_mode: "Markdown",
      })
      return
    }
    case "pagerduty": {
      const routingKey = String(config.routingKey || config.routing_key || "")
      if (!routingKey) return
      await postJson("https://events.pagerduty.com/v2/enqueue", {
        routing_key: routingKey,
        event_action: "trigger",
        payload: {
          summary: `${env.title}: ${env.body}`,
          severity: env.event === "deploy.failed" || env.event === "backup.failed" ? "error" : "info",
          source: "slipway",
          timestamp: env.ts,
        },
      })
      return
    }
    case "email": {
      const host = String(config.host || "")
      const port = Number(config.port || 587)
      const user = String(config.user || "")
      const pass = String(config.pass || config.password || "")
      const from = String(config.from || user)
      const to = String(config.to || "")
      if (!host || !to) return
      const { createTransport } = await import("nodemailer")
      const transporter = createTransport({ host, port, secure: port === 465, auth: user ? { user, pass } : undefined })
      await transporter.sendMail({
        from,
        to,
        subject: `[Slipway] ${env.title}`,
        text: `${env.body}\n\nEvent: ${env.event}\nTime: ${env.ts}`,
      })
      return
    }
    default:
      return
  }
}