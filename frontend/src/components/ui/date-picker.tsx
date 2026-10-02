import * as React from "react"
import { format, parse, isValid } from "date-fns"
import { CalendarIcon } from "lucide-react-motion"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerProps {
  /** Controlled value in YYYY-MM-DD format */
  value?: string
  onChange?: (value: string) => void
  disabled?: boolean
  className?: string
  placeholder?: string
  /** Minimum date in YYYY-MM-DD format */
  min?: string
  /** Maximum date in YYYY-MM-DD format */
  max?: string
}

/**
 * DatePicker — a themed popover date picker built on Shadcn Calendar.
 * Used on md+ screens; on mobile the native <input type="date"> is used instead.
 */
const DatePicker = React.forwardRef<HTMLButtonElement, DatePickerProps>(
  (
    {
      value,
      onChange,
      disabled,
      className,
      placeholder = "Pick a date",
      min,
      max,
    },
    ref,
  ) => {
    const [open, setOpen] = React.useState(false)

    // Parse YYYY-MM-DD string → Date object
    const selected = React.useMemo(() => {
      if (!value) return undefined
      const d = parse(value, "yyyy-MM-dd", new Date())
      return isValid(d) ? d : undefined
    }, [value])

    const fromDate = min ? parse(min, "yyyy-MM-dd", new Date()) : undefined
    const toDate = max ? parse(max, "yyyy-MM-dd", new Date()) : undefined

    const handleSelect = (day: Date | undefined) => {
      if (day && isValid(day)) {
        onChange?.(format(day, "yyyy-MM-dd"))
      } else {
        onChange?.("")
      }
      setOpen(false)
    }

    return (
      <Popover open={open} onOpenChange={setOpen} modal={true}>
        <PopoverTrigger asChild>
          <Button
            ref={ref}
            variant="outline"
            disabled={disabled}
            className={cn(
              "border-input h-9 w-full justify-start px-3 text-left font-normal",
              "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
              !selected && "text-muted-foreground",
              className,
            )}
          >
            <CalendarIcon className="mr-2 size-4 shrink-0 opacity-70" />
            {selected ? (
              format(selected, "dd MMM yyyy")
            ) : (
              <span>{placeholder}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={handleSelect}
            defaultMonth={selected}
            captionLayout="dropdown"
            disabled={[
              ...(fromDate ? [{ before: fromDate }] : []),
              ...(toDate ? [{ after: toDate }] : []),
            ]}
          />
        </PopoverContent>
      </Popover>
    )
  },
)

DatePicker.displayName = "DatePicker"

export { DatePicker }
