'use client'

import * as React from 'react'
import {
  Terminal,
  Monitor,
  Copy,
  Check,
  Apple,
  Package,
  Download,
  Zap,
  ArrowRight,
  ChevronRight,
  Smartphone,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast, toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

export function CliDesktopView() {
  const [activeOs, setActiveOs] = React.useState<'macos' | 'linux' | 'windows'>('macos')
  const [activeSection, setActiveSection] = React.useState<'install' | 'cli' | 'desktop'>('install')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight flex items-center gap-2">
          <Terminal size={18} className="text-primary" />
          CLI & Desktop app
        </h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          Slipway ships with three first-class clients — a web dashboard, a native desktop app, and a CLI. All three
          talk to the same Slipway API on your server, so anything you can do in the browser you can do from the
          terminal or the desktop.
        </p>
      </div>

      {/* Honest scope note */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-[12px] text-muted-foreground leading-relaxed">
        <strong className="text-foreground font-medium">What this build ships:</strong> the Slipway server, web dashboard,
        and REST API (including Bearer-token auth for automation). The standalone CLI binary and the Tauri desktop app
        are <strong className="text-foreground font-medium">not bundled</strong> with this self-hosted build — the install
        commands and download buttons below describe the intended distribution, not files that exist today. Drive Slipway
        from the web dashboard, or call the API directly with an API token (see Settings → Profile → API tokens).
      </div>

      {/* Three clients banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ClientTile
          icon={Terminal}
          label="CLI"
          detail="slipway deploy, slipway logs, slipway rollback"
          color="oklch(0.7 0.17 158)"
        />
        <ClientTile
          icon={Monitor}
          label="Desktop"
          detail="macOS, Windows, Linux · Tauri-based"
          color="oklch(0.65 0.18 250)"
        />
        <ClientTile
          icon={Zap}
          label="Web"
          detail="this dashboard · zero-install"
          color="oklch(0.78 0.16 70)"
        />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {([
          { id: 'install', label: 'Install' },
          { id: 'cli', label: 'CLI cookbook' },
          { id: 'desktop', label: 'Desktop app' },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveSection(t.id)}
            className={cn(
              'px-3 h-9 text-[13px] border-b-2 transition-colors -mb-px',
              activeSection === t.id
                ? 'border-primary text-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeSection === 'install' && <InstallSection activeOs={activeOs} setActiveOs={setActiveOs} />}
      {activeSection === 'cli' && <CliCookbookSection />}
      {activeSection === 'desktop' && <DesktopSection />}

      {/* Footer note */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-[12px] text-muted-foreground leading-relaxed">
        <strong className="text-foreground font-medium">Open source.</strong> Slipway is licensed under Apache 2.0.
        Source for the server, CLI, and desktop app is on GitHub at <code className="font-mono text-foreground">github.com/slipway/slipway</code>.
        Self-host on a single VPS, a dedicated server, or a small multi-node cluster — the same binary runs everywhere.
      </div>
    </div>
  )
}

function ClientTile({ icon: Icon, label, detail, color }: { icon: React.ComponentType<{ size?: number }>; label: string; detail: string; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
      <div
        className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `oklch(from ${color} l c h / 0.15)`, color }}
      >
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold">{label}</div>
        <div className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">{detail}</div>
      </div>
    </div>
  )
}

function InstallSection({ activeOs, setActiveOs }: { activeOs: 'macos' | 'linux' | 'windows'; setActiveOs: (o: any) => void }) {
  const installs = {
    macos: [
      { label: 'Homebrew', cmd: 'brew install slipway/tap/slipway' },
      { label: 'MacPorts', cmd: 'sudo port install slipway' },
      { label: 'Direct download', cmd: 'curl -fsSL https://slipway.run/install.sh | sh' },
    ],
    linux: [
      { label: 'Install script', cmd: 'curl -fsSL https://slipway.run/install.sh | sh' },
      { label: 'apt (Debian/Ubuntu)', cmd: 'apt-get install slipway' },
      { label: 'dnf (Fedora)', cmd: 'dnf install slipway' },
      { label: 'pacman (Arch, AUR)', cmd: 'yay -S slipway-bin' },
      { label: 'Nix', cmd: 'nix profile install nixpkgs#slipway' },
    ],
    windows: [
      { label: 'Winget', cmd: 'winget install Slipway.Slipway' },
      { label: 'Scoop', cmd: 'scoop install slipway' },
      { label: 'Chocolatey', cmd: 'choco install slipway' },
      { label: 'PowerShell', cmd: 'iwr https://slipway.run/install.ps1 | iex' },
    ],
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[14px] font-semibold mb-3">Install the CLI</div>
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5 w-fit h-9">
          {([
            { id: 'macos', label: 'macOS', icon: Apple },
            { id: 'linux', label: 'Linux', icon: Package },
            { id: 'windows', label: 'Windows', icon: Monitor },
          ] as const).map((o) => {
            const Icon = o.icon
            return (
              <button
                key={o.id}
                onClick={() => setActiveOs(o.id)}
                className={cn(
                  'px-3 h-8 rounded text-[12px] flex items-center gap-1.5 transition-colors',
                  activeOs === o.id ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon size={12} />
                {o.label}
              </button>
            )
          })}
        </div>

        <div className="mt-4 space-y-2">
          {installs[activeOs].map((i) => (
            <CodeBlock key={i.label} label={i.label} cmd={i.cmd} />
          ))}
        </div>
      </div>

      <div>
        <div className="text-[14px] font-semibold mb-3">Install the desktop app</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { os: 'macOS', detail: 'Universal · macOS 12+', file: 'Slipway-1.4.2.dmg', size: '14.2 MB', icon: Apple },
            { os: 'Linux', detail: 'AppImage · .deb · .rpm', file: 'Slipway-1.4.2.AppImage', size: '15.8 MB', icon: Package },
            { os: 'Windows', detail: 'Windows 10+ · MSI', file: 'Slipway-1.4.2.msi', size: '16.1 MB', icon: Monitor },
          ].map((d) => {
            const Icon = d.icon
            return (
              <div key={d.os} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={14} />
                  <span className="text-[13px] font-semibold">{d.os}</span>
                </div>
                <div className="text-[11px] text-muted-foreground">{d.detail}</div>
                <div className="text-[11px] text-muted-foreground font-mono mt-1">{d.file} · {d.size}</div>
                <Button variant="outline" size="sm" className="mt-3 h-8 w-full gap-2" onClick={() => toast({ title: 'No prebuilt binary', description: `${d.file} is not built in this release. Build the Tauri app from source, or use the web dashboard.`, variant: 'default' })}>
                  <Download size={11} />
                  Download
                </Button>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <div className="text-[14px] font-semibold mb-3">Install the Slipway server</div>
        <p className="text-[12px] text-muted-foreground mb-3 leading-relaxed">
          Run the server on any Linux machine with Docker installed. The server hosts the dashboard, the API, and the
          build pipeline.
        </p>
        <CodeBlock
          label="One-line install (Ubuntu / Debian / Rocky / Alpine)"
          cmd="curl -fsSL https://slipway.run/install-server.sh | sh"
        />
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CodeBlock label="Docker" cmd={'docker run -d -p 80:80 -p 443:443 \\\n  -v /var/run/docker.sock:/var/run/docker.sock \\\n  -v slipway-data:/data \\\n  --name slipway \\\n  ghcr.io/slipway/server:1.4.2'} multiline />
          <CodeBlock label="Docker Compose" cmd={'services:\n  slipway:\n    image: ghcr.io/slipway/server:1.4.2\n    ports: ["80:80", "443:443"]\n    volumes:\n      - /var/run/docker.sock:/var/run/docker.sock\n      - slipway-data:/data\n    restart: unless-stopped\nvolumes:\n  slipway-data:'} multiline />
        </div>
        <div className="mt-3 flex items-center gap-2 text-[12px] text-muted-foreground">
          <Smartphone size={12} />
          <span>Minimum requirements: 1 vCPU · 1 GB RAM · 10 GB disk · Docker 24+ · any modern Linux kernel</span>
        </div>
      </div>

      <div>
        <div className="text-[14px] font-semibold mb-3">Point the CLI at your server</div>
        <CodeBlock label="Authenticate" cmd={'$ slipway login\n? Server URL: https://slipway.example.com\n? API token: ********\n✓ Logged in as mira@helix.co\n✓ Current cluster: helix-eu (4 servers)'} multiline />
      </div>
    </div>
  )
}

function CliCookbookSection() {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-gradient-to-br from-primary/8 via-background to-background p-4">
        <div className="text-[14px] font-semibold">The CLI mirrors the dashboard 1:1</div>
        <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
          Every action in the web UI has a CLI equivalent. Scripts and CI pipelines can call the same commands.
          Use <code className="font-mono text-[11px] text-foreground">--json</code> on any command for machine-readable output.
        </p>
      </div>

      <div>
        <div className="text-[14px] font-semibold mb-3">Common workflows</div>
        <div className="space-y-4">
          <WorkflowBlock
            title="Deploy from a Git repo"
            steps={[
              { comment: '# clone, detect, build, deploy in one go', cmd: 'slipway deploy github.com/helixco/web' },
              { comment: '# or from a local folder', cmd: 'slipway deploy ./my-app --env staging' },
              { comment: '# or import a compose stack', cmd: 'slipway deploy ./legacy-crm --compose' },
            ]}
          />
          <WorkflowBlock
            title="Tail live logs"
            steps={[
              { comment: '# tail logs from a project', cmd: 'slipway logs helix-api' },
              { comment: '# filter by service and level', cmd: 'slipway logs helix-api --service worker --level error' },
              { comment: '# follow logs across the whole cluster', cmd: 'slipway logs --follow' },
            ]}
          />
          <WorkflowBlock
            title="Roll back to a previous deploy"
            steps={[
              { comment: '# list recent deploys', cmd: 'slipway deployments list --project helix-api' },
              { comment: '# roll back to a specific commit', cmd: 'slipway rollback helix-api --to 9f3a1c2' },
              { comment: '# roll back to the last healthy release', cmd: 'slipway rollback helix-api --last' },
            ]}
          />
          <WorkflowBlock
            title="Manage databases"
            steps={[
              { comment: '# create a managed Postgres', cmd: 'slipway db create postgres --name helix-pg --size 80GB' },
              { comment: '# run a backup now', cmd: 'slipway db backup helix-pg' },
              { comment: '# restore to a point in time', cmd: 'slipway db restore helix-pg --pitr "2026-07-25T14:30:00Z"' },
              { comment: '# psql into the database', cmd: 'slipway db psql helix-pg' },
            ]}
          />
          <WorkflowBlock
            title="Manage domains and SSL"
            steps={[
              { comment: '# add a custom domain', cmd: 'slipway domain add helix-api.com --project helix-api' },
              { comment: '# provision SSL (automatic)', cmd: 'slipway ssl provision helix-api.com' },
              { comment: '# list all domains', cmd: 'slipway domain list' },
            ]}
          />
          <WorkflowBlock
            title="Scale a service"
            steps={[
              { comment: '# scale the api to 5 replicas', cmd: 'slipway scale helix-api --replicas 5' },
              { comment: '# bump memory limit', cmd: 'slipway scale helix-api --memory 1024Mi' },
            ]}
          />
          <WorkflowBlock
            title="Server & cluster management"
            steps={[
              { comment: '# list servers in the cluster', cmd: 'slipway servers list' },
              { comment: '# add a worker node', cmd: 'slipway servers add --host 188.42.13.20 --user root --key helix-prod-key' },
              { comment: '# drain a node for maintenance', cmd: 'slipway servers drain fra1-worker-02' },
            ]}
          />
        </div>
      </div>

      <div>
        <div className="text-[14px] font-semibold mb-3">Use in CI</div>
        <p className="text-[12px] text-muted-foreground mb-3 leading-relaxed">
          The CLI is a single static binary. Drop it into any CI runner and authenticate with an API token.
        </p>
        <CodeBlock
          label="GitHub Actions"
          cmd={'- name: Deploy to staging\n  run: |\n    curl -fsSL https://slipway.run/install.sh | sh\n    slipway login --token ${{ secrets.SLIPWAY_TOKEN }} --server https://slipway.example.com\n    slipway deploy github.com/helixco/web --env staging --wait'}
          multiline
        />
      </div>
    </div>
  )
}

function DesktopSection() {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Mock desktop app screenshot */}
        <div className="bg-[oklch(0.16_0.005_240)] p-3 border-b border-border">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-3 h-3 rounded-full bg-rose-500/80" />
            <span className="w-3 h-3 rounded-full bg-amber-500/80" />
            <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
            <span className="ml-3 text-[11px] text-muted-foreground font-mono">Slipway Desktop — helix-eu</span>
          </div>
          <div className="rounded-md overflow-hidden bg-[oklch(0.12_0.005_240)] aspect-[16/9] grid grid-cols-[180px_1fr]">
            {/* sidebar */}
            <div className="bg-[oklch(0.18_0.005_240)] p-2 space-y-1">
              {['Overview', 'Projects', 'Deployments', 'Databases', 'Metrics', 'Logs', 'Settings'].map((s, i) => (
                <div
                  key={s}
                  className={cn(
                    'px-2 py-1 rounded text-[10px]',
                    i === 1 ? 'bg-primary/20 text-primary' : 'text-muted-foreground',
                  )}
                >
                  {s}
                </div>
              ))}
            </div>
            {/* content */}
            <div className="p-2.5 space-y-1.5">
              <div className="text-[10px] font-semibold text-foreground">Projects</div>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-1.5 p-1 rounded bg-white/5">
                  <div className="w-3 h-3 rounded bg-emerald-500/60" />
                  <div className="flex-1 h-1.5 bg-white/10 rounded" />
                  <div className="text-[8px] text-muted-foreground font-mono">{i}x</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="p-4">
          <div className="text-[14px] font-semibold">A native shell around the same dashboard</div>
          <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
            Built with Tauri, the desktop app wraps the Slipway web UI in a native window with system-tray integration,
            global keyboard shortcuts, and native notifications. It also adds quick actions from the menu bar — start a
            deploy, tail logs, or roll back without opening a browser.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FeatureCard
          icon={Zap}
          title="Global quick actions"
          detail="⌘+Shift+D opens a command palette from anywhere. Trigger deploys, switch projects, tail logs."
        />
        <FeatureCard
          icon={Monitor}
          title="System tray"
          detail="See cluster health at a glance. Get native notifications on failed deploys or backups."
        />
        <FeatureCard
          icon={Terminal}
          title="Built-in terminal"
          detail="One click opens a shell into any running container. No SSH juggling."
        />
        <FeatureCard
          icon={Apple}
          title="Native on every OS"
          detail="macOS (Universal), Linux (AppImage/deb/rpm), Windows (MSI). Same UI, same keyboard shortcuts."
        />
      </div>

      <div>
        <div className="text-[14px] font-semibold mb-3">Keyboard shortcuts (desktop)</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-xl border border-border bg-card p-4">
          {[
            { keys: ['⌘', 'K'], action: 'Open command palette' },
            { keys: ['⌘', 'Shift', 'D'], action: 'Trigger a new deploy' },
            { keys: ['⌘', 'L'], action: 'Tail live logs' },
            { keys: ['⌘', 'B'], action: 'Toggle sidebar' },
            { keys: ['⌘', '1…9'], action: 'Jump to nav section' },
            { keys: ['⌘', ','], action: 'Open settings' },
            { keys: ['⌘', 'R'], action: 'Redeploy current project' },
            { keys: ['⌘', '\\'], action: 'Open in-browser shell' },
          ].map((s) => (
            <div key={s.action} className="flex items-center justify-between py-1.5">
              <span className="text-[12px]">{s.action}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((k) => (
                  <kbd key={k} className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded border border-border bg-muted/60 text-[10px] font-mono font-medium text-muted-foreground">
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function FeatureCard({ icon: Icon, title, detail }: { icon: React.ComponentType<{ size?: number }>; title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center text-primary mb-2.5">
        <Icon size={15} />
      </div>
      <div className="text-[13px] font-semibold">{title}</div>
      <div className="text-[12px] text-muted-foreground mt-1 leading-snug">{detail}</div>
    </div>
  )
}

function CodeBlock({ label, cmd, multiline }: { label: string; cmd: string; multiline?: boolean }) {
  const { toast } = useToast()
  const [copied, setCopied] = React.useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(cmd)
    setCopied(true)
    toast({ title: 'Copied to clipboard' })
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="rounded-lg border border-border bg-[oklch(0.12_0.005_240)] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold font-mono">{label}</div>
        <button
          onClick={copy}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Copy"
        >
          {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
        </button>
      </div>
      <pre className="px-3 py-2.5 text-[12px] font-mono text-foreground overflow-x-auto leading-relaxed">
        {cmd.split('\n').map((line, i) => (
          <div key={i}>
            {line.startsWith('#') || line.startsWith('?') || line.startsWith('✓') || line.startsWith('$') ? (
              <span className="text-muted-foreground">{line}</span>
            ) : line.startsWith('  ') ? (
              <span className="text-emerald-400">{line}</span>
            ) : (
              line
            )}
            {multiline && i < cmd.split('\n').length - 1 && '\n'}
          </div>
        ))}
      </pre>
    </div>
  )
}

function WorkflowBlock({ title, steps }: { title: string; steps: Array<{ comment: string; cmd: string }> }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <div className="text-[13px] font-semibold">{title}</div>
        <ChevronRight size={13} className="text-muted-foreground" />
      </div>
      <div className="p-3 space-y-1.5 bg-[oklch(0.12_0.005_240)]">
        {steps.map((s, i) => (
          <div key={i} className="font-mono text-[12px]">
            <div className="text-muted-foreground">{s.comment}</div>
            <div className="text-emerald-400 break-all">{s.cmd}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
