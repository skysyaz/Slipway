#!/usr/bin/env bash
# Comprehensive audit — visit every view, count buttons, detect error boundary
VIEWS=(
  "Overview"
  "Projects"
  "Deployments"
  "Preview envs"
  "Databases"
  "Storage"
  "Domains & SSL"
  "Backups"
  "Metrics"
  "Live logs"
  "CLI & Desktop"
  "Settings"
)

echo "=== AUDIT: every view ==="
for label in "${VIEWS[@]}"; do
  ref=$(agent-browser snapshot -i 2>&1 | grep "button \"$label\"" | head -1 | sed 's/.*ref=\([^]]*\).*/\1/')
  if [ -z "$ref" ]; then
    echo "✗ MISSING nav: $label"
    continue
  fi
  agent-browser click @$ref >/dev/null 2>&1
  sleep 1
  err=$(agent-browser snapshot -i 2>&1 | grep -i "Reload Slipway" | head -1)
  if [ -n "$err" ]; then
    echo "✗ ERROR BOUNDARY on $label"
    continue
  fi
  heading=$(agent-browser snapshot 2>&1 | grep "heading" | head -1 | sed 's/.*StaticText //' | head -c 40)
  btns=$(agent-browser snapshot -i 2>&1 | grep -c "button ")
  echo "✓ $label → $heading ($btns buttons)"
done
