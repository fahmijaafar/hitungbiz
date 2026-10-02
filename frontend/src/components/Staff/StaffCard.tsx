import {
  EllipsisVertical,
  Mail,
  Phone,
  ShieldCheck,
  User,
} from "lucide-react-motion"
import type { StaffMemberPublic } from "@/client"
import { getAvatarStyle, getInitials } from "@/components/Clients/ClientCard"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import DeleteStaff from "./DeleteStaff"

interface StaffCardProps {
  companyId: string
  staff: StaffMemberPublic
  canManage: boolean
  currentUserId?: string
}

export function StaffCard({
  companyId,
  staff,
  canManage,
  currentUserId,
}: StaffCardProps) {
  const displayName = staff.name || staff.email
  const avatarStyle = getAvatarStyle(displayName)
  const initials = getInitials(displayName)

  const isOwner = staff.membership_type === "owner"
  const isSelf = currentUserId ? staff.id === currentUserId : false
  const canRemove = canManage && !isOwner && !isSelf

  return (
    <div className="group flex flex-col justify-between rounded-xl border border-border bg-card shadow-xs transition-all hover:shadow-md hover:border-primary/40 p-4">
      <div>
        {/* Top Header section */}
        <div className="flex gap-4 items-start">
          {/* Initials Avatar */}
          <div
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl font-bold text-lg ${avatarStyle.bg} ${avatarStyle.text} shadow-xs`}
          >
            {initials}
          </div>

          {/* Title & Badge & Actions */}
          <div className="flex flex-1 items-start justify-between gap-2 min-w-0">
            <div className="min-w-0 pt-0.5">
              <h3
                className="truncate font-semibold text-base leading-tight group-hover:text-primary transition-colors"
                title={displayName}
              >
                {displayName}
              </h3>

              <div className="mt-2 flex items-center gap-2">
                {isOwner ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-400">
                    <ShieldCheck className="h-3 w-3" />
                    Owner
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md bg-secondary border border-border/50 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                    <User className="h-3 w-3" />
                    Member
                  </span>
                )}
              </div>
            </div>

            {/* Actions Menu */}
            {canRemove && (
              <div className="shrink-0 -mr-1 -mt-1">
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-lg border border-transparent hover:border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-all">
                    <EllipsisVertical className="h-4 w-4" />
                    <span className="sr-only">Open menu</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DeleteStaff companyId={companyId} staff={staff} />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="my-3.5 border-t border-border/60" />

        {/* Card Details */}
        <div className="flex flex-col gap-2 text-sm font-medium">
          <div className="grid grid-cols-12 gap-3 min-w-0">
            <div
              className="col-span-7 flex items-center gap-2 min-w-0"
              title={staff.email}
            >
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-foreground">
                {staff.email || "-"}
              </span>
            </div>

            <div
              className="col-span-5 flex items-center justify-end gap-2 min-w-0 text-right"
              title={staff.phone_number || ""}
            >
              <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-foreground">
                {staff.phone_number || "-"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default StaffCard
