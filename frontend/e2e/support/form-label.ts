/** Match a literal label, preserving the existing optional required-marker/whitespace suffix. */
export function formLabelPattern(label: string): RegExp {
  const literal = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${literal}(?:\\s*\\*)?\\s*$`)
}
