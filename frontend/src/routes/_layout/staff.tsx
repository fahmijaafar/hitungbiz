import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Search, User as UserIcon, Users } from "lucide-react-motion"
import { useMemo, useState } from "react"
import { CompaniesService, UsersService } from "@/client"
import AddStaff from "@/components/Staff/AddStaff"
import StaffCard from "@/components/Staff/StaffCard"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCurrentCompanyId } from "@/hooks/useCompany"
import { APP_NAME } from "@/lib/app"

export const Route = createFileRoute("/_layout/staff")({
  component: Staff,
  head: () => ({
    meta: [
      {
        title: `Staff - ${APP_NAME}`,
      },
    ],
  }),
})

function StaffCardSkeleton() {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-xs animate-pulse">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <div className="h-14 w-14 rounded-xl bg-muted shrink-0" />
            <div>
              <div className="h-5 w-32 rounded bg-muted mb-2" />
              <div className="h-4 w-16 rounded bg-muted" />
            </div>
          </div>
        </div>
        <div className="my-3.5 border-t border-border/60" />
        <div className="h-4 w-48 rounded bg-muted" />
      </div>
    </div>
  )
}

function StaffContent({ companyId }: { companyId: string }) {
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState("owner-first")

  const { data: currentUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => UsersService.readUserMe(),
  })

  const {
    data: staffData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["staff", companyId],
    queryFn: () => CompaniesService.readCompanyStaff({ companyId }),
    enabled: Boolean(companyId),
  })

  const staffMembers = useMemo(() => {
    return staffData?.data ?? []
  }, [staffData])

  const canManage = useMemo(() => {
    if (!currentUser) return false
    if (currentUser.is_superuser) return true
    return staffMembers.some(
      (s) => s.id === currentUser.id && s.membership_type === "owner",
    )
  }, [currentUser, staffMembers])

  const filteredStaff = useMemo(() => {
    let result = [...staffMembers]

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(
        (s) =>
          s.name?.toLowerCase().includes(q) ||
          s.email?.toLowerCase().includes(q),
      )
    }

    result.sort((a, b) => {
      if (sortBy === "owner-first") {
        const aOwner = a.membership_type === "owner" ? 0 : 1
        const bOwner = b.membership_type === "owner" ? 0 : 1
        if (aOwner !== bOwner) return aOwner - bOwner
        return (a.name || a.email).localeCompare(b.name || b.email)
      }
      if (sortBy === "name-asc") {
        return (a.name || a.email).localeCompare(b.name || b.email)
      }
      if (sortBy === "name-desc") {
        return (b.name || b.email).localeCompare(a.name || a.email)
      }
      return 0
    })

    return result
  }, [staffMembers, searchQuery, sortBy])

  const hasOnlyOwner = useMemo(() => {
    return (
      staffMembers.length <= 1 &&
      staffMembers.some((s) => s.membership_type === "owner")
    )
  }, [staffMembers])

  return (
    <div className="flex flex-col gap-6">
      {/* Search & Filter Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search staff..."
            className="pl-9 bg-background border-border rounded-xl"
          />
        </div>

        <div className="w-full sm:w-auto">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-full sm:w-55 bg-background border-border rounded-xl font-medium text-foreground">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="owner-first">Sort by: Owner First</SelectItem>
              <SelectItem value="name-asc">Sort by: Name (A-Z)</SelectItem>
              <SelectItem value="name-desc">Sort by: Name (Z-A)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Cards Grid / States */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {["sk-1", "sk-2", "sk-3"].map((key) => (
            <StaffCardSkeleton key={key} />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center text-center py-12">
          <p className="text-rose-500 font-medium">
            Failed to load staff members. Please try again.
          </p>
        </div>
      ) : filteredStaff.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 bg-background rounded-2xl border border-dashed border-border">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Search className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-bold text-foreground">
            No matching staff found
          </h3>
          <p className="text-muted-foreground text-sm mt-1">
            Try searching for another keyword.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredStaff.map((staff) => (
              <StaffCard
                key={staff.id}
                companyId={companyId}
                staff={staff}
                canManage={canManage}
                currentUserId={currentUser?.id}
              />
            ))}
          </div>

          {/* Empty state for owner when no staff members exist */}
          {hasOnlyOwner && !searchQuery && (
            <div className="flex flex-col items-center justify-center text-center py-12 px-4 bg-background rounded-2xl border border-dashed border-border">
              <div className="rounded-full bg-muted p-3.5 mb-3">
                <Users className="h-7 w-7 text-muted-foreground" />
              </div>
              <h3 className="text-base font-bold text-foreground">
                No staff members yet.
              </h3>
              <p className="text-muted-foreground text-sm mt-1 max-w-sm">
                Add members to collaborate on this company.
              </p>
              {canManage && (
                <div className="mt-4">
                  <AddStaff companyId={companyId} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Staff() {
  const companyId = useCurrentCompanyId()

  const { data: currentUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => UsersService.readUserMe(),
  })

  const { data: staffData } = useQuery({
    queryKey: ["staff", companyId],
    queryFn: () =>
      CompaniesService.readCompanyStaff({ companyId: companyId ?? "" }),
    enabled: Boolean(companyId),
  })

  const canManage = useMemo(() => {
    if (!currentUser || !staffData?.data) return false
    if (currentUser.is_superuser) return true
    return staffData.data.some(
      (s) => s.id === currentUser.id && s.membership_type === "owner",
    )
  }, [currentUser, staffData])

  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16">
        <p className="text-muted-foreground font-medium">
          Please select a company to view staff members.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <UserIcon className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Staff</h1>
          </div>
          <p className="text-muted-foreground">
            Manage company staff and members
          </p>
        </div>
        {canManage && (
          <div>
            <AddStaff companyId={companyId} />
          </div>
        )}
      </div>
      <StaffContent companyId={companyId} />
    </div>
  )
}

export default Staff
