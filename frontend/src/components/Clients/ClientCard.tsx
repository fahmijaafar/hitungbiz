import { Building2, Mail, MapPin, Phone } from "lucide-react-motion"
import { useState } from "react"
import type { ClientPublic } from "@/client"
import ClientActionsMenu from "./ClientActionsMenu"
import EditClient from "./EditClient"

interface ClientCardProps {
  client: ClientPublic
  selected?: boolean
}

export function getInitials(name: string): string {
  if (!name) return "?"
  const trimmed = name.trim()
  if (trimmed.includes("&")) {
    const parts = trimmed.split(/\s*&\s*/)
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return `${parts[0][0]}&${parts[1][0]}`.toUpperCase()
    }
  }
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase()
  }
  const significantWords = words.filter(
    (w) =>
      !["by", "of", "and", "the", "sdn", "bhd", "enterprise"].includes(
        w.toLowerCase(),
      ),
  )
  const targetWords = significantWords.length >= 1 ? significantWords : words
  if (targetWords.length === 1) {
    return targetWords[0].substring(0, 2).toUpperCase()
  }
  return (
    targetWords[0][0] + targetWords[targetWords.length - 1][0]
  ).toUpperCase()
}

export function getAvatarStyle(name: string) {
  const styles = [
    {
      bg: "bg-purple-100/90 border border-purple-200/60 dark:bg-purple-950/40 dark:border-purple-800/40",
      text: "text-purple-800 dark:text-purple-300",
    },
    {
      bg: "bg-emerald-100/90 border border-emerald-200/60 dark:bg-emerald-950/40 dark:border-emerald-800/40",
      text: "text-emerald-800 dark:text-emerald-300",
    },
    {
      bg: "bg-amber-100/90 border border-amber-200/60 dark:bg-amber-950/40 dark:border-amber-800/40",
      text: "text-amber-800 dark:text-amber-300",
    },
    {
      bg: "bg-blue-100/90 border border-blue-200/60 dark:bg-blue-950/40 dark:border-blue-800/40",
      text: "text-blue-800 dark:text-blue-300",
    },
    {
      bg: "bg-pink-100/90 border border-pink-200/60 dark:bg-pink-950/40 dark:border-pink-800/40",
      text: "text-pink-800 dark:text-pink-300",
    },
    {
      bg: "bg-orange-100/90 border border-orange-200/60 dark:bg-orange-950/40 dark:border-orange-800/40",
      text: "text-orange-800 dark:text-orange-300",
    },
    {
      bg: "bg-cyan-100/90 border border-cyan-200/60 dark:bg-cyan-950/40 dark:border-cyan-800/40",
      text: "text-cyan-800 dark:text-cyan-300",
    },
    {
      bg: "bg-rose-100/90 border border-rose-200/60 dark:bg-rose-950/40 dark:border-rose-800/40",
      text: "text-rose-800 dark:text-rose-300",
    },
    {
      bg: "bg-indigo-100/90 border border-indigo-200/60 dark:bg-indigo-950/40 dark:border-indigo-800/40",
      text: "text-indigo-800 dark:text-indigo-300",
    },
    {
      bg: "bg-teal-100/90 border border-teal-200/60 dark:bg-teal-950/40 dark:border-teal-800/40",
      text: "text-teal-800 dark:text-teal-300",
    },
  ]
  let hash = 0
  for (let i = 0; i < (name || "").length; i++) {
    hash = (name || "").charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % styles.length
  return styles[index]
}

export function formatCustomerType(type?: string | null): string {
  if (!type) return "Individual"
  return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()
}

export function ClientCard({ client, selected = false }: ClientCardProps) {
  const [isEditOpen, setIsEditOpen] = useState(false)
  const avatarStyle = getAvatarStyle(client.name)
  const initials = getInitials(client.name)
  const isCompany =
    client.customer_type?.toLowerCase() === "company" ||
    client.customer_type?.toLowerCase() === "syarikat"

  return (
    <>
      <div
        onClick={() => setIsEditOpen(true)}
        className={`group flex flex-col justify-between rounded-xl border border-border bg-card shadow-xs transition-all hover:shadow-md hover:border-primary/40 cursor-pointer ${
          selected ? "border-l-3 border-l-primary" : ""
        }`}
      >
        {/* Top Header section */}
        <div className="flex gap-4 p-4 pb-3">
          {/* Initials Avatar */}
          <div
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl font-bold text-lg ${avatarStyle.bg} ${avatarStyle.text} shadow-xs`}
          >
            {initials}
          </div>

          {/* Title & Customer Type Badge & Actions */}
          <div className="flex flex-1 items-start justify-between gap-2 min-w-0">
            <div className="min-w-0">
              <h3
                className="truncate font-semibold text-base leading-tight pt-1 group-hover:text-primary transition-colors"
                title={client.name}
              >
                {client.name}
              </h3>
              <div className="mt-1">
                {isCompany ? (
                  <span className="inline-flex items-center rounded-md bg-blue-100/80 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 capitalize">
                    Company
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-md bg-emerald-100/80 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 capitalize">
                    {formatCustomerType(client.customer_type)}
                  </span>
                )}
              </div>
            </div>

            {/* Three dots action menu */}
            <div
              className="shrink-0 -mr-1 -mt-1"
              onClick={(e) => e.stopPropagation()}
            >
              <ClientActionsMenu client={client} />
            </div>
          </div>
        </div>

        {/* Horizontal Divider */}
        <div className="mx-4 my-3.5 border-t border-border/60" />

        {/* Card Details List */}
        <div className="flex flex-col gap-2.5 px-4 pb-4 text-sm font-medium">
          {/* Email & Phone Row */}
          <div className="grid grid-cols-12 gap-3 min-w-0">
            <div
              className="col-span-7 flex items-center gap-2 min-w-0"
              title={client.email}
            >
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-foreground">
                {client.email || "-"}
              </span>
            </div>

            <div
              className="col-span-5 flex items-center justify-end gap-2 min-w-0 text-right"
              title={client.phone_number || ""}
            >
              <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-foreground">
                {client.phone_number || "-"}
              </span>
            </div>
          </div>

          <div
            className="flex items-center gap-3 min-w-0"
            title={client.company_name || client.reg_number || ""}
          >
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-foreground">
              {client.company_name || client.reg_number || "-"}
            </span>
          </div>

          <div
            className="flex items-center gap-3 min-w-0"
            title={client.billing_address || ""}
          >
            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-foreground">
              {client.billing_address || "-"}
            </span>
          </div>
        </div>
      </div>

      <EditClient
        client={client}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSuccess={() => setIsEditOpen(false)}
      />
    </>
  )
}

export default ClientCard
