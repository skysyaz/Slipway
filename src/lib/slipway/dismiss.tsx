'use client'

import * as React from 'react'

// ponytail: ONE global dismiss layer for the hand-rolled (non-radix) floating
// elements — the env selector, notifications popover and avatar menu in the
// topbar. Radix Dialog / Sheet (command palette, new-X dialogs, mobile nav)
// already dismiss correctly on outside-click + Escape and already join the
// mutual-exclusivity mutex via the store's openOverlay(); they are intentionally
// NOT migrated here — re-wiring them would duplicate working logic and risk
// breaking them for no gain.
//
// Why this exists (the THIRD time this failed): the old pattern was a per-panel
// `<div className="fixed inset-0 z-30" onClick={close} />` full-screen backdrop.
// That backdrop sits at z-30 — the SAME stacking level as the sticky topbar — so
// it swallows pointer events meant for SIBLING topbar buttons (New deployment,
// the bell, the env toggle). The user experience: click another header button
// while a dropdown is open and nothing happens (the backdrop eats the click), so
// the dropdown never closes and the other button never opens — looking exactly
// like "doesn't close on outside click". Replacing every backdrop with a single
// document-level pointerdown listener (no full-screen div) fixes both: free
// clicks pass through to whatever was clicked, and the listener closes the
// floating element when the click landed outside it.
//
// The layer owns ONE pointerdown + ONE keydown listener (mounted once at the
// app root). Only one floating element is registered at a time — opening one
// closes the previous (mutual exclusivity among the local dropdowns).
// pointerdown (not click) is used so the trigger's own click toggles cleanly
// without an open→instant-close race; the trigger ref is excluded so re-toggling
// works. Portal-safe: we hold DOM element refs, not React subtree refs, so a
// portaled content node is still tested correctly. Escape closes + restores
// focus to the trigger.

type Entry = {
  content: HTMLElement | null
  trigger: HTMLElement | null
  onClose: () => void
}

type FloatingLayerApi = {
  open: (e: Entry) => void
  release: (e: Entry) => void
}

const FloatingLayerContext = React.createContext<FloatingLayerApi | null>(null)

export function FloatingLayerProvider({ children }: { children: React.ReactNode }) {
  const current = React.useRef<Entry | null>(null)

  const open = React.useCallback((e: Entry) => {
    // mutual exclusivity: opening one closes the previous. Set current to the
    // new entry FIRST so the previous entry's release() (fired from its own
    // cleanup once its state flips) is a no-op (identity mismatch).
    const prev = current.current
    current.current = e
    if (prev && prev !== e) prev.onClose()
  }, [])

  const release = React.useCallback((e: Entry) => {
    // drop our entry from the layer IF it is still current. Never call onClose
    // here — either the layer already called it (outside-click / Escape / a
    // newer entry opened), or the component is closing itself (item picked).
    if (current.current === e) current.current = null
  }, [])

  React.useEffect(() => {
    const onPointerDown = (ev: PointerEvent) => {
      const e = current.current
      if (!e) return
      const t = ev.target as Node | null
      if (!t) return
      if (e.content?.contains(t)) return // inside click → keep open
      if (e.trigger?.contains(t)) return // trigger click → let the toggle handle it
      current.current = null
      e.onClose()
    }
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return
      const e = current.current
      if (!e) return
      current.current = null
      e.trigger?.focus() // restore focus to the trigger
      e.onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const value = React.useMemo<FloatingLayerApi>(() => ({ open, release }), [open, release])
  return <FloatingLayerContext.Provider value={value}>{children}</FloatingLayerContext.Provider>
}

// ponytail: per-component API. Register while `open`; on cleanup, release. The
// onClose ref is kept live so callers can pass an inline closure without
// re-registering on every render.
export function useDismiss(opts: {
  open: boolean
  onClose: () => void
  contentRef: React.RefObject<HTMLElement | null>
  triggerRef?: React.RefObject<HTMLElement | null>
}) {
  const ctx = React.useContext(FloatingLayerContext)
  // ponytail: keep the latest onClose in a ref so callers can pass an inline
  // closure without re-registering the layer entry every render. The
  // assignment must happen in an EFFECT, not during render — writing to a ref
  // while rendering is unsafe under React 19 / StrictMode, where a render can
  // be discarded or replayed, and it was only passing lint because a stray
  // `eslint-disable-next-line` further down was masking the diagnostic.
  const onCloseRef = React.useRef(opts.onClose)
  React.useEffect(() => {
    onCloseRef.current = opts.onClose
  })
  const entryRef = React.useRef<Entry | null>(null)

  React.useEffect(() => {
    if (!opts.open || !ctx) return
    const entry: Entry = {
      content: opts.contentRef.current,
      trigger: opts.triggerRef?.current ?? null,
      onClose: () => onCloseRef.current(),
    }
    entryRef.current = entry
    ctx.open(entry)
    return () => {
      const e = entryRef.current
      if (e) ctx.release(e)
      entryRef.current = null
    }
    // re-register only when openness or the layer context changes; onClose is
    // read through a ref so an inline closure doesn't re-register every render.
  }, [opts.open, ctx, opts.contentRef, opts.triggerRef])
}