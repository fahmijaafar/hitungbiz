import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Send } from "lucide-react-motion"
import { useState } from "react"
import {
  EmailBlastingService,
  type EmailTemplatePublic,
  type RecipientFilter,
  type UserSearchResult,
} from "@/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import useCustomToast from "@/hooks/useCustomToast"
import { EmailBodyEditor } from "./EmailBodyEditor"
import { RecipientFilters } from "./RecipientFilters"
import { SendConfirmDialog } from "./SendConfirmDialog"
import { SendTestEmailDialog } from "./SendTestEmailDialog"
import { TemplateSelector } from "./TemplateSelector"
import { UserSearch } from "./UserSearch"

const DEFAULT_FILTERS: RecipientFilter = {
  all_users: false,
  active_only: true,
  superusers_only: false,
  selected_user_ids: [],
}

export function ComposeTab() {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [filters, setFilters] = useState<RecipientFilter>(DEFAULT_FILTERS)
  const [selectedUsers, setSelectedUsers] = useState<UserSearchResult[]>([])
  const [confirmOpen, setConfirmOpen] = useState(false)

  const filterJson: RecipientFilter = {
    ...filters,
    selected_user_ids: selectedUsers.map((u) => u.id),
  }

  const { data: countData, isLoading: isCountLoading } = useQuery({
    queryKey: ["recipient-count", filterJson],
    queryFn: () =>
      EmailBlastingService.previewRecipientCount({ requestBody: filterJson }),
    placeholderData: (prev) => prev,
  })

  const recipientCount = countData?.count ?? null

  const getFilterJson = () => filterJson

  // Send
  const sendMutation = useMutation({
    mutationFn: async () => {
      // Create campaign first (which starts in draft status)
      const campaign = await EmailBlastingService.createCampaign({
        requestBody: { subject, body, filter_json: getFilterJson() },
      })
      // Send campaign immediately
      return EmailBlastingService.sendCampaign({ campaignId: campaign.id })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] })
      showSuccessToast("Campaign queued for sending!")
      setConfirmOpen(false)
      // Reset form
      setSubject("")
      setBody("")
      setFilters(DEFAULT_FILTERS)
      setSelectedUsers([])
    },
    onError: (err: any) => {
      showErrorToast(err?.body?.detail ?? "Failed to send campaign")
      setConfirmOpen(false)
    },
  })

  const handleTemplateSelect = (template: EmailTemplatePublic) => {
    setSubject(template.subject)
    setBody(template.body)
  }

  const canSend = subject.trim().length > 0 && body.trim().length > 0

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side: Subject and Email Body */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Template loader */}
          <TemplateSelector onSelect={handleTemplateSelect} />

          {/* Subject */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="campaign-subject">Subject</Label>
            <Input
              id="campaign-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Your email subject…"
              className="text-base"
            />
          </div>

          {/* Body editor */}
          <EmailBodyEditor value={body} onChange={setBody} />
        </div>

        {/* Right Side: Recipient filters and specific users */}
        <div className="flex flex-col gap-6">
          {/* Recipient filters */}
          <RecipientFilters
            value={filters}
            onChange={setFilters}
            recipientCount={recipientCount}
            isLoading={isCountLoading}
          />

          {/* User search */}
          <UserSearch
            selectedUsers={selectedUsers}
            onSelect={setSelectedUsers}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 pt-4 border-t">
        <SendTestEmailDialog
          subject={subject}
          body={body}
          disabled={!canSend}
        />
        <div className="flex-1" />
        <Button onClick={() => setConfirmOpen(true)} disabled={!canSend}>
          <Send className="mr-2 h-4 w-4" />
          Send Campaign
        </Button>
      </div>

      <SendConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        subject={subject}
        recipientCount={recipientCount ?? 0}
        onConfirm={() => sendMutation.mutate()}
        isLoading={sendMutation.isPending}
      />
    </div>
  )
}
