import * as React from "react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface AutocompleteInputProps
  extends React.ComponentProps<typeof Input> {
  suggestions?: string[]
}

export const AutocompleteInput = React.forwardRef<
  HTMLInputElement,
  AutocompleteInputProps
>(
  (
    {
      suggestions = [],
      className,
      value,
      onChange,
      onFocus,
      onBlur,
      onKeyDown,
      ...props
    },
    ref,
  ) => {
    const [isOpen, setIsOpen] = React.useState(false)
    const [highlightedIndex, setHighlightedIndex] = React.useState(-1)
    const containerRef = React.useRef<HTMLDivElement>(null)

    const stringValue =
      typeof value === "string" ? value : (value?.toString() ?? "")

    const filteredSuggestions = React.useMemo(() => {
      if (!suggestions || suggestions.length === 0) return []
      const trimmedQuery = stringValue.trim().toLowerCase()

      // Normalize and deduplicate suggestions
      const uniqueMap = new Map<string, string>()
      for (const item of suggestions) {
        if (!item) continue
        const trimmed = item.trim()
        const key = trimmed.toLowerCase()
        if (key) {
          const existing = uniqueMap.get(key)
          if (!existing) {
            uniqueMap.set(key, trimmed)
          } else if (trimmed !== trimmed.toLowerCase() && existing === existing.toLowerCase()) {
            uniqueMap.set(key, trimmed)
          }
        }
      }
      const uniqueItems = Array.from(uniqueMap.values())

      if (!trimmedQuery) {
        return uniqueItems.slice(0, 8)
      }

      const exactMatch: string[] = []
      const startsWithMatch: string[] = []
      const containsMatch: string[] = []

      for (const item of uniqueItems) {
        const lowerItem = item.toLowerCase()
        if (lowerItem === trimmedQuery) {
          exactMatch.push(item)
        } else if (lowerItem.startsWith(trimmedQuery)) {
          startsWithMatch.push(item)
        } else if (lowerItem.includes(trimmedQuery)) {
          containsMatch.push(item)
        }
      }

      return [...exactMatch, ...startsWithMatch, ...containsMatch].slice(0, 8)
    }, [suggestions, stringValue])

    // Click outside listener
    React.useEffect(() => {
      const handleClickOutside = (event: MouseEvent | TouchEvent) => {
        if (
          containerRef.current &&
          !containerRef.current.contains(event.target as Node)
        ) {
          setIsOpen(false)
        }
      }
      document.addEventListener("mousedown", handleClickOutside)
      document.addEventListener("touchstart", handleClickOutside)
      return () => {
        document.removeEventListener("mousedown", handleClickOutside)
        document.removeEventListener("touchstart", handleClickOutside)
      }
    }, [])

    const selectItem = (item: string) => {
      if (onChange) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )?.set

        const inputElement = containerRef.current?.querySelector("input")
        if (inputElement && nativeInputValueSetter) {
          nativeInputValueSetter.call(inputElement, item)
          const event = new Event("input", { bubbles: true })
          inputElement.dispatchEvent(event)
        } else {
          const syntheticEvent = {
            target: { value: item, name: props.name },
            currentTarget: { value: item, name: props.name },
          } as React.ChangeEvent<HTMLInputElement>
          onChange(syntheticEvent)
        }
      }
      setIsOpen(false)
      setHighlightedIndex(-1)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen || filteredSuggestions.length === 0) {
        if (e.key === "ArrowDown" && filteredSuggestions.length > 0) {
          setIsOpen(true)
          setHighlightedIndex(0)
          e.preventDefault()
        } else {
          onKeyDown?.(e)
        }
        return
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          setHighlightedIndex((prev) => (prev + 1) % filteredSuggestions.length)
          break
        case "ArrowUp":
          e.preventDefault()
          setHighlightedIndex((prev) =>
            prev <= 0 ? filteredSuggestions.length - 1 : prev - 1,
          )
          break
        case "Enter":
          if (
            highlightedIndex >= 0 &&
            highlightedIndex < filteredSuggestions.length
          ) {
            e.preventDefault()
            selectItem(filteredSuggestions[highlightedIndex])
          } else {
            onKeyDown?.(e)
          }
          break
        case "Escape":
          e.preventDefault()
          setIsOpen(false)
          setHighlightedIndex(-1)
          break
        default:
          onKeyDown?.(e)
          break
      }
    }

    return (
      <div ref={containerRef} className="relative w-full">
        <Input
          ref={ref}
          value={value}
          onChange={(e) => {
            onChange?.(e)
            setIsOpen(true)
            setHighlightedIndex(-1)
          }}
          onFocus={(e) => {
            onFocus?.(e)
            setIsOpen(true)
          }}
          onBlur={(e) => {
            onBlur?.(e)
          }}
          onKeyDown={handleKeyDown}
          className={className}
          {...props}
        />
        {isOpen && filteredSuggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95">
            <ul className="p-1">
              {filteredSuggestions.map((item, index) => (
                <li
                  key={item}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    selectItem(item)
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={cn(
                    "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors",
                    index === highlightedIndex
                      ? "bg-accent text-accent-foreground font-medium"
                      : "hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  },
)
AutocompleteInput.displayName = "AutocompleteInput"
