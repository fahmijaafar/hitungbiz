import { useQuery } from "@tanstack/react-query"
import {
  CircleCheck as CheckCircle,
  Clock,
  Loader as Loader2,
  Users,
  CircleX as XCircle,
} from "lucide-react-motion"
import { useState } from "react"
import { EmailBlastingService, type EmailCampaignPublic } from "@/client"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const STATUS_CONFIG: Record<
  string,
  {
    label: string
    variant: "default" | "secondary" | "destructive" | "outline"
  }
> = {
  draft: { label: "Draft", variant: "secondary" },
  sending: { label: "Sending…", variant: "default" },
  completed: { label: "Completed", variant: "default" },
  failed: { label: "Failed", variant: "destructive" },
}

interface CampaignDetailDialogProps {
  campaign: EmailCampaignPublic
  open: boolean
  onOpenChange: (open: boolean) => void
}

function CampaignDetailDialog({
  campaign,
  open,
  onOpenChange,
}: CampaignDetailDialogProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["campaign-recipients", campaign.id],
    queryFn: () =>
      EmailBlastingService.listCampaignRecipients({
        campaignId: campaign.id,
        limit: 200,
      }),
    enabled: open,
  })
  const recipients = data?.data ?? []
  const sentCount = recipients.filter((r) => r.status === "sent").length
  const failedCount = recipients.filter((r) => r.status === "failed").length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="line-clamp-2">{campaign.subject}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-4 rounded-lg border bg-muted/40 p-4 text-sm">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
              Status
            </span>
            <Badge
              variant={
                STATUS_CONFIG[campaign.status ?? ""]?.variant ?? "secondary"
              }
            >
              {STATUS_CONFIG[campaign.status ?? ""]?.label ?? campaign.status}
            </Badge>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
              Total
            </span>
            <span className="font-semibold">
              {(campaign.recipient_count ?? 0).toLocaleString()}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
              Sent
            </span>
            <span className="font-semibold text-green-600">
              {sentCount.toLocaleString()}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
              Failed
            </span>
            <span className="font-semibold text-destructive">
              {failedCount.toLocaleString()}
            </span>
          </div>
          {campaign.sent_at && (
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                Sent at
              </span>
              <span>{new Date(campaign.sent_at).toLocaleString()}</span>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading recipients…
          </div>
        ) : recipients.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            No recipients recorded yet.
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent at</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipients.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm font-mono">
                      {r.email}
                    </TableCell>
                    <TableCell>
                      {r.status === "sent" ? (
                        <span className="flex items-center gap-1 text-green-600 text-sm">
                          <CheckCircle className="h-3.5 w-3.5" /> Sent
                        </span>
                      ) : r.status === "failed" ? (
                        <span className="flex items-center gap-1 text-destructive text-sm">
                          <XCircle className="h-3.5 w-3.5" /> Failed
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-muted-foreground text-sm">
                          <Clock className="h-3.5 w-3.5" /> Pending
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.sent_at ? new Date(r.sent_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-destructive max-w-[200px] truncate">
                      {r.error_message ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function HistoryTab() {
  const [selectedCampaign, setSelectedCampaign] =
    useState<EmailCampaignPublic | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => EmailBlastingService.listCampaigns({ limit: 100 }),
    refetchInterval: 10_000, // poll every 10s to catch sending→completed transitions
  })
  const campaigns = data?.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        All campaigns — click a row to view per-recipient delivery status.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading campaigns…
        </div>
      ) : campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center text-muted-foreground">
          <p className="font-medium">No campaigns yet</p>
          <p className="text-sm">
            Head over to the Compose tab to create your first campaign.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Recipients</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Sent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer hover:bg-muted/60 transition-colors"
                  onClick={() => setSelectedCampaign(c)}
                >
                  <TableCell className="font-medium max-w-xs truncate">
                    {c.subject}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        STATUS_CONFIG[c.status ?? ""]?.variant ?? "secondary"
                      }
                    >
                      {STATUS_CONFIG[c.status ?? ""]?.label ?? c.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      {(c.recipient_count ?? 0).toLocaleString()}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.created_at
                      ? new Date(c.created_at).toLocaleDateString()
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.sent_at ? new Date(c.sent_at).toLocaleString() : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {selectedCampaign && (
        <CampaignDetailDialog
          campaign={selectedCampaign}
          open={!!selectedCampaign}
          onOpenChange={(open) => !open && setSelectedCampaign(null)}
        />
      )}
    </div>
  )
}
