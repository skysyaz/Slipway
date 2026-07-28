'use client'

import * as React from 'react'
import { Globe, Plus, ShieldCheck, ExternalLink, MoreHorizontal, ArrowRight, RefreshCw, Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useSlipway } from '@/lib/slipway/store'
import { StatusDot, StackGlyph } from '../icons'
import { TimeAgo } from '../format'
import { useToast } from '@/hooks/use-toast'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

export function DomainsView() {
  const projects = useSlipway((s) => s.projects)
  const selectProject = useSlipway((s) => s.selectProject)
  const setNewDomainOpen = useSlipway((s) => s.setNewDomainOpen)
  const scanHost = useSlipway((s) => s.scanHost)
  const { toast } = useToast()

  // ponytail: scan loading + last result feedback. The old Domains view had no
  // scan trigger at all — running a scan from elsewhere returned silently and
  // the user saw an empty list with no indication of what (if anything) was
  // found. Now the scan is awaited here, the list it writes to (projects →
  // p.domains, the SAME source this view renders from) is refetched, and the
  // toast names exactly how many domains/servers were found (0 is shown
  // honestly, not silently).
  const [scanning, setScanning] = React.useState(false)
  const [lastResult, setLastResult] = React.useState<{ domains: number; projects: number; databases: number; volumes: number } | null>(null)

  const runScan = async () => {
    setScanning(true)
    setLastResult(null)
    try {
      const r = await scanHost()
      setLastResult({ domains: r.domains, projects: r.projects, databases: r.databases, volumes: r.volumes })
      toast({
        title: 'Scan complete',
        description: `Found ${r.domains} domain(s), ${r.projects} app(s), ${r.databases} database(s), ${r.volumes} volume(s).`,
      })
    } catch (e) {
      toast({ title: 'Scan failed', description: e instanceof ApiError ? e.message : 'could not scan the host.', variant: 'destructive' })
    } finally {
      setScanning(false)
    }
  }

  const allDomains = projects.flatMap((p) => p.domains.map((d) => ({ ...d, project: p })))

  const expiringSoon = allDomains.filter((d) => {
    if (!d.sslExpiry) return false
    const days = (new Date(d.sslExpiry).getTime() - Date.now()) / 86400000
    return days < 30
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Domains & SSL</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            {allDomains.length} domains · {allDomains.filter((d) => d.ssl === 'managed').length} with managed SSL ·{' '}
            {expiringSoon.length} renewing within 30 days
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-9 gap-2" disabled={scanning} onClick={() => void runScan()}>
            {scanning ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            {scanning ? 'Scanning…' : 'Scan host for domains'}
          </Button>
          <Button size="sm" className="h-9 gap-2" onClick={() => setNewDomainOpen(true)}>
            <Plus size={13} />
            Add domain
          </Button>
        </div>
      </div>

      {/* ponytail: honest feedback after a scan — "Found N domains" (or 0), so a
          silent empty result is never confused with "scan didn't run". Disappears
          once you add a domain or navigate away. */}
      {lastResult && (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground flex items-center gap-2">
          <ShieldCheck size={13} className="text-emerald-500 shrink-0" />
          <span>
            Last scan found <b className="text-foreground">{lastResult.domains}</b> domain(s) from <b className="text-foreground">{lastResult.projects}</b> app container(s).
            {lastResult.domains === 0 && ' No Traefik Host(`…`) labels detected on the host\'s containers — add routing labels to surface domains here.'}
          </span>
        </div>
      )}

      {/* SSL banner */}
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
          <ShieldCheck size={16} className="text-emerald-500" />
        </div>
        <div className="flex-1">
          <div className="text-[13px] font-semibold">All domains are HTTPS by default</div>
          <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">
            Slipway provisions and renews TLS certificates via Let’s Encrypt automatically. HTTP requests are redirected to HTTPS.
            Bring your own cert by uploading it under <span className="font-mono text-[11px]">Settings → SSL</span>.
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={() => toast({ title: 'SSL renewal queued', description: 'Renewing all certificates due within 30 days.' })}>
          <RefreshCw size={11} className="mr-1" />
          Renew all
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-12 px-4 py-2 border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          <div className="col-span-4">Hostname</div>
          <div className="col-span-2">Project</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-2">SSL</div>
          <div className="col-span-2 text-right">Status</div>
        </div>
        {allDomains.map((d, i) => (
          <button
            key={d.id}
            onClick={() => selectProject(d.project.id)}
            className={cn(
              'w-full text-left grid grid-cols-12 px-4 py-3 items-center text-[12px] hover:bg-accent/30 transition-colors',
              i !== allDomains.length - 1 && 'border-b border-border',
            )}
          >
            <div className="col-span-4 min-w-0">
              <div className="font-mono font-medium truncate flex items-center gap-1.5" title={d.hostname}>
                {d.https && <ShieldCheck size={11} className="text-emerald-500 shrink-0" />}
                {d.hostname}
                <ExternalLink size={10} className="text-muted-foreground shrink-0" />
              </div>
            </div>
            <div className="col-span-2 flex items-center gap-1.5 min-w-0">
              <StackGlyph stack={d.project.stack} size={18} />
              <span className="text-[11px] truncate" title={d.project.name}>{d.project.name}</span>
            </div>
            <div className="col-span-2">
              <Badge variant="outline" className="text-[10px] capitalize">{d.type}</Badge>
            </div>
            <div className="col-span-2 text-[11px] text-muted-foreground">
              {d.ssl === 'managed' ? (
                <>
                  Let’s Encrypt
                  {d.sslExpiry && (
                    <div className="text-[10px] mt-0.5">
                      renews <TimeAgo ts={d.sslExpiry} className="text-[10px]" />
                    </div>
                  )}
                </>
              ) : (
                <span className="capitalize">{d.ssl}</span>
              )}
            </div>
            <div className="col-span-2 flex justify-end">
              <StatusDot status={d.status} />
            </div>
          </button>
        ))}
      </div>

      {/* Wildcard / preview domains */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="text-[13px] font-semibold mb-1">Preview domains</div>
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          Every pull request gets its own preview environment on a <span className="font-mono">*.preview.slipway.app</span> subdomain.
          Wildcard SSL is provisioned once per cluster and reused across all previews.
        </p>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[11px] font-mono">*.preview.slipway.app</Badge>
          <ArrowRight size={11} className="text-muted-foreground" />
          <Badge variant="outline" className="text-[11px] font-mono bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
            <ShieldCheck size={9} className="mr-0.5" />
            Wildcard SSL active
          </Badge>
        </div>
      </div>
    </div>
  )
}
