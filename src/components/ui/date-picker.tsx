import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react"
import { Popover } from "radix-ui"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/cn"

export interface DatePickerProps {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  "aria-label"?: string
  "aria-describedby"?: string
}

function dateFromValue(value: string): Date | undefined {
  if (!value) return undefined
  const date = parseISO(value)
  return isValid(date) ? date : undefined
}

export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Choose a date",
  className,
  disabled,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: DatePickerProps) {
  const selectedDate = dateFromValue(value)
  const [month, setMonth] = useState(() => startOfMonth(selectedDate ?? new Date()))
  const calendarStart = startOfWeek(startOfMonth(month))
  const calendarEnd = endOfWeek(endOfMonth(month))
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd })
  const monthLabel = format(month, "MMMM yyyy")

  return (
    <Popover.Root
      onOpenChange={(open) => {
        if (open) setMonth(startOfMonth(selectedDate ?? new Date()))
      }}
    >
      <Popover.Trigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          className={cn(
            "flex h-10 w-full items-center justify-between gap-3 rounded-lg border border-input bg-background px-3 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            !selectedDate && "text-muted-foreground",
            className,
          )}
        >
          <span>{selectedDate ? format(selectedDate, "MMM d, yyyy") : placeholder}</span>
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 w-[min(20rem,calc(100vw-2rem))] rounded-xl border bg-card p-3 text-card-foreground shadow-lg outline-none"
        >
          <div className="mb-2 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label="Previous month"
              onClick={() => setMonth((current) => addMonths(current, -1))}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
            <p className="text-sm font-semibold" aria-live="polite">
              {monthLabel}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label="Next month"
              onClick={() => setMonth((current) => addMonths(current, 1))}
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
          <table className="w-full table-fixed border-collapse" aria-label={monthLabel}>
            <thead>
              <tr>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => (
                  <th
                    key={weekday}
                    scope="col"
                    className="h-8 text-center text-xs font-normal text-muted-foreground"
                  >
                    <span aria-hidden="true">{weekday.slice(0, 1)}</span>
                    <span className="sr-only">{weekday}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: Math.ceil(days.length / 7) }, (_, weekIndex) => (
                <tr key={days[weekIndex * 7]?.toISOString()}>
                  {days.slice(weekIndex * 7, weekIndex * 7 + 7).map((day) => {
                    const selected = selectedDate ? isSameDay(day, selectedDate) : false
                    return (
                      <td key={day.toISOString()} className="p-0.5 text-center">
                        <Popover.Close asChild>
                          <button
                            type="button"
                            aria-label={format(day, "EEEE, MMMM d, yyyy")}
                            aria-pressed={selected}
                            className={cn(
                              "inline-flex size-9 items-center justify-center rounded-md text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
                              !isSameMonth(day, month) && "text-muted-foreground opacity-55",
                              selected &&
                                "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                            )}
                            onClick={() => onChange(format(day, "yyyy-MM-dd"))}
                          >
                            {format(day, "d")}
                          </button>
                        </Popover.Close>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {selectedDate && (
            <div className="mt-2 border-t pt-2">
              <Popover.Close asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => onChange("")}
                >
                  <X className="size-4" aria-hidden="true" />
                  Clear date
                </Button>
              </Popover.Close>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
