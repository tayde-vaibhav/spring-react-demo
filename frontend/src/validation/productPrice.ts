/** The existing backend-compatible price grammar, unchanged: positive, 12 whole digits, 2 decimals. */
export function isValidProductPrice(value: string): boolean {
  return /^\d{1,12}(\.\d{1,2})?$/.test(value) && Number(value) > 0
}
