import { useQuery } from "@tanstack/react-query"
import { Search, X } from "lucide-react-motion"
import { useState } from "react"
import { EmailBlastingService, type UserSearchResult } from "@/client"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface UserSearchProps {
  selectedUsers: UserSearchResult[]
  onSelect: (users: UserSearchResult[]) => void
}

export function UserSearch({ selectedUsers, onSelect }: UserSearchProps) {
  const [query, setQuery] = useState("")
  const [showDropdown, setShowDropdown] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["user-search", query],
    queryFn: () => EmailBlastingService.searchUsers({ q: query, limit: 15 }),
    enabled: showDropdown,
    staleTime: 5000,
  })

  const results = data?.data ?? []

  const addUser = (user: UserSearchResult) => {
    if (!selectedUsers.find((u) => u.id === user.id)) {
      onSelect([...selectedUsers, user])
    }
  }

  const removeUser = (id: string) => {
    onSelect(selectedUsers.filter((u) => u.id !== id))
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Specific Users</Label>
      <p className="text-xs text-muted-foreground -mt-1">
        Selected users are always included regardless of filters above.
      </p>

      {/* Selected users chips */}
      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedUsers.map((u) => (
            <Badge
              key={u.id}
              variant="secondary"
              className="flex items-center gap-1.5 pr-1"
            >
              <span className="max-w-[180px] truncate text-xs">
                {u.full_name ?? u.email}
              </span>
              <button
                type="button"
                onClick={() => removeUser(u.id)}
                className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="user-search-input"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setShowDropdown(true)
          }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          placeholder="Search by name or email…"
          className="pl-9"
        />

        {/* Dropdown */}
        {showDropdown && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md overflow-hidden">
            {isLoading ? (
              <div className="px-4 py-3 text-sm text-muted-foreground">
                Searching…
              </div>
            ) : results.length === 0 ? (
              <div className="px-4 py-3 text-sm text-muted-foreground">
                No users found
              </div>
            ) : (
              <ul className="max-h-56 overflow-y-auto">
                {results.map((u) => {
                  const isSelected = !!selectedUsers.find((s) => s.id === u.id)
                  return (
                    <li
                      key={u.id}
                      className={`px-4 py-2.5 cursor-pointer flex flex-col gap-0.5 transition-colors text-sm ${
                        isSelected
                          ? "bg-primary/10 text-primary cursor-default"
                          : "hover:bg-muted"
                      }`}
                      onMouseDown={() => !isSelected && addUser(u)}
                    >
                      <span className="font-medium">
                        {u.full_name ?? "(no name)"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {u.email}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
