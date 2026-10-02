import { Loader as Loader2, Users } from "lucide-react-motion"
import type { RecipientFilter } from "@/client"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface RecipientFiltersProps {
  value: RecipientFilter
  onChange: (filters: RecipientFilter) => void
  recipientCount: number | null
  isLoading?: boolean
}

export function RecipientFilters({
  value,
  onChange,
  recipientCount,
  isLoading,
}: RecipientFiltersProps) {
  const update = (patch: Partial<RecipientFilter>) => {
    const next = { ...value, ...patch }
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Recipient Filters</Label>
        <div className="flex items-center gap-2">
          {isLoading && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          <Badge variant="secondary" className="flex items-center gap-1.5">
            <Users className="h-3 w-3" />
            {recipientCount !== null
              ? `${recipientCount.toLocaleString()} recipients`
              : "—"}
          </Badge>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/40 p-4 flex flex-col gap-3">
        {/* All users */}
        <label className="flex items-center gap-3 cursor-pointer group">
          <Checkbox
            id="filter-all"
            checked={value.all_users ?? false}
            onCheckedChange={(checked) => update({ all_users: !!checked })}
          />
          <span className="text-sm group-hover:text-foreground transition-colors">
            All users
          </span>
        </label>

        {/* Active only */}
        <label className="flex items-center gap-3 cursor-pointer group">
          <Checkbox
            id="filter-active"
            checked={value.active_only ?? true}
            onCheckedChange={(checked) => update({ active_only: !!checked })}
          />
          <span className="text-sm group-hover:text-foreground transition-colors">
            Active users only
          </span>
        </label>

        {/* Superusers only */}
        <label className="flex items-center gap-3 cursor-pointer group">
          <Checkbox
            id="filter-superusers"
            checked={value.superusers_only ?? false}
            onCheckedChange={(checked) =>
              update({ superusers_only: !!checked })
            }
          />
          <span className="text-sm group-hover:text-foreground transition-colors">
            Superusers only
          </span>
        </label>

        {/* Onboarding not completed */}
        <label className="flex items-center gap-3 cursor-pointer group">
          <Checkbox
            id="filter-onboarding"
            checked={value.onboarding_completed === false}
            onCheckedChange={(checked) =>
              update({ onboarding_completed: checked ? false : undefined })
            }
          />
          <span className="text-sm group-hover:text-foreground transition-colors">
            Users who have not completed onboarding
          </span>
        </label>

        {/* New users within X days */}
        <div className="flex items-center gap-3">
          <Checkbox
            id="filter-new-users"
            checked={
              value.new_users_days !== null &&
              value.new_users_days !== undefined
            }
            onCheckedChange={(checked) =>
              update({ new_users_days: checked ? 30 : undefined })
            }
          />
          <label
            htmlFor="filter-new-users"
            className="text-sm flex items-center gap-2 cursor-pointer"
          >
            New users within the last
            <Input
              type="number"
              min={1}
              max={365}
              value={value.new_users_days ?? ""}
              onChange={(e) =>
                update({
                  new_users_days: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
              className="h-7 w-20 text-center"
              placeholder="30"
              disabled={
                value.new_users_days === null ||
                value.new_users_days === undefined
              }
            />
            days
          </label>
        </div>

        {/* Active within X days */}
        <div className="flex items-center gap-3">
          <Checkbox
            id="filter-active-within"
            checked={
              value.active_within_days !== null &&
              value.active_within_days !== undefined
            }
            onCheckedChange={(checked) =>
              update({ active_within_days: checked ? 7 : undefined })
            }
          />
          <label
            htmlFor="filter-active-within"
            className="text-sm flex items-center gap-2 cursor-pointer"
          >
            Active within the last
            <Input
              type="number"
              min={1}
              max={365}
              value={value.active_within_days ?? ""}
              onChange={(e) =>
                update({
                  active_within_days: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
              className="h-7 w-20 text-center"
              placeholder="7"
              disabled={
                value.active_within_days === null ||
                value.active_within_days === undefined
              }
            />
            days
          </label>
        </div>
      </div>
    </div>
  )
}
