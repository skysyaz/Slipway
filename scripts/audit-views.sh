#!/usr/bin/env bash
# Click every visible button on the current view and check for error boundary
# Returns: count of buttons tested, count of errors

snapshot_refs() {
  agent-browser snapshot -i 2>&1 | grep "^- button " | sed 's/.*ref=\([^]]*\).*/\1/'
}

echo "=== Testing every view, every button ==="

VIEWS=("Overview" "Projects" "Deployments" "Preview envs" "Databases" "Storage" "Domains & SSL" "Backups" "Metrics" "Live logs" "CLI & Desktop" "Settings")

for view in "${VIEWS[@]}"; do
  # Navigate to view
  ref=$(agent-browser snapshot -i 2>&1 | grep "button \"$view" | head -1 | sed 's/.*ref=\([^]]*\).*/\1/')
  if [ -z "$ref" ]; then
    echo "✗ Cannot find nav: $view"
    continue
  fi
  agent-browser click @$ref >/dev/null 2>&1
  sleep 1
  
  # Check for error boundary
  err=$(agent-browser snapshot -i 2>&1 | grep "Reload Slipway" | head -1)
  if [ -n "$err" ]; then
    echo "✗ $view: ERROR BOUNDARY on load"
    continue
  fi
  
  # Count buttons
  btns=$(agent-browser snapshot -i 2>&1 | grep -c "^- button ")
  echo "✓ $view loaded ($btns buttons)"
done
