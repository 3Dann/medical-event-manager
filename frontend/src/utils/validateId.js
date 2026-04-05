/**
 * Validates an Israeli ID number (ת.ז.) using the Luhn-variant checksum.
 * Returns: true = valid, false = invalid, null = empty
 */
export function validateIsraeliId(id) {
  if (!id) return null
  const clean = String(id).replace(/\D/g, '')
  if (clean.length !== 9) return false
  let sum = 0
  for (let i = 0; i < 9; i++) {
    let digit = Number(clean[i]) * ((i % 2) + 1)
    if (digit > 9) digit -= 9
    sum += digit
  }
  return sum % 10 === 0
}

/**
 * Shared ID input field component logic — returns className and message.
 */
export function idInputClass(base, value, valid) {
  if (!value) return base
  if (valid === false) return `${base} border-red-400 focus:ring-red-300`
  if (valid === true)  return `${base} border-green-400 focus:ring-green-300`
  return base
}
