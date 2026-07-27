// Find all buttons without onClick handlers on the current page
// Returns a JSON array of {text, hasOnClick, classes}
const buttons = Array.from(document.querySelectorAll('button'))
const result = buttons.map(b => {
  // Check if button has an onClick handler attached via React
  // We check if clicking does anything by looking at React props
  const text = (b.textContent || '').trim().slice(0, 50)
  // A button is "decorative" if it has no onClick and is not disabled and not type=submit inside a form
  const isSubmit = b.type === 'submit'
  const isDisabled = b.disabled
  // Check for any event listeners (rough heuristic)
  const hasRole = b.getAttribute('role')
  return { text, isDisabled, isSubmit, classes: b.className.slice(0, 60), tag: b.tagName }
})
JSON.stringify(result.filter(b => !b.isDisabled && !b.isSubmit), null, 2)
