export function parseMarksInput(
  value: FormDataEntryValue | null,
  fieldName: string,
  defaultValue = "0"
) {
  const rawValue = String(value ?? defaultValue).trim()
  const normalizedValue = rawValue.replace(",", ".")

  if (!/^[0-9]+([.][0-9]{1,2})?$/.test(normalizedValue)) {
    throw new Error(`${fieldName} must be a valid number with up to 2 decimals.`)
  }

  const [wholePart, decimalPart = ""] = normalizedValue.split(".")

  const cleanedWholePart = wholePart.replace(/^0+(?=\d)/, "")

  if (cleanedWholePart.length > 6) {
    throw new Error(`${fieldName} is too large.`)
  }

  return `${cleanedWholePart}.${decimalPart.padEnd(2, "0")}`
}

export function formatMarks(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0)

  if (Number.isNaN(parsed)) {
    return "0"
  }

  if (Number.isInteger(parsed)) {
    return String(parsed)
  }

  return parsed.toFixed(2)
}