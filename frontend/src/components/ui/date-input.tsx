import * as React from "react"

import { DatePicker } from "@/components/ui/date-picker"

/**
 * DateInput — a consistently-styled date field that uses the Shadcn
 * Popover + Calendar on all screen sizes (desktop and mobile).
 *
 * This replaces the previous responsive approach (native <input type="date">
 * on mobile, DatePicker on desktop) because iOS Safari's native date input
 * has intrinsic sizing quirks that make it visually inconsistent with other
 * form fields regardless of CSS overrides.
 *
 * Forwards react-hook-form's field props (value, onChange, disabled, etc.)
 * through to DatePicker.
 */
const DateInput = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"input">
>(({ className, value, onChange, disabled, min, max, placeholder }, ref) => {
  const stringValue = typeof value === "string" ? value : ""

  // Bridge from a native ChangeEvent shape (what react-hook-form expects)
  // to the plain string value DatePicker emits.
  const handlePickerChange = (dateStr: string) => {
    onChange?.({
      target: { value: dateStr },
    } as React.ChangeEvent<HTMLInputElement>)
  }

  return (
    <DatePicker
      ref={ref}
      value={stringValue}
      onChange={handlePickerChange}
      disabled={!!disabled}
      min={typeof min === "string" ? min : undefined}
      max={typeof max === "string" ? max : undefined}
      placeholder={typeof placeholder === "string" ? placeholder : undefined}
      className={className}
    />
  )
})

DateInput.displayName = "DateInput"

export { DateInput }
