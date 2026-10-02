import { useNavigate } from "@tanstack/react-router"
import { Sparkles, Zap } from "lucide-react-motion"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  FEATURE_METADATA,
  formatLimitValue,
  PLAN_FEATURE_LIMITS,
  PLAN_NAMES,
} from "@/lib/planLimits"

export interface UpgradeModalProps {
  open: boolean
  onClose: () => void
  feature: string
  currentPlan: string
  currentUsage: number
  limit: number
  limitType?: string
  retryAt?: string | null
  recommendedPlan?: string | null
}

export function UpgradeModal({
  open,
  onClose,
  feature,
  currentPlan,
  currentUsage,
  limit,
  limitType,
  retryAt,
  recommendedPlan,
}: UpgradeModalProps) {
  const navigate = useNavigate()

  const featureMeta = FEATURE_METADATA[feature] || {
    label: feature,
    unit: feature,
  }
  const currentPlanName = PLAN_NAMES[currentPlan] || currentPlan
  const recPlanKey = recommendedPlan ?? null
  const recommendedPlanName = recPlanKey
    ? PLAN_NAMES[recPlanKey] || recPlanKey
    : null

  // Recommended plan limit value
  const recommendedLimit = recPlanKey
    ? PLAN_FEATURE_LIMITS[recPlanKey]?.[feature]
    : null
  const retryLabel = retryAt ? formatRetryAt(retryAt) : null

  const handleUpgradeClick = () => {
    onClose()
    navigate({ to: "/upgrade" })
  }

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="flex flex-col items-center text-center sm:items-center sm:text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-2">
            <Zap className="size-6" />
          </div>
          <DialogTitle className="text-xl font-bold">
            {recommendedPlanName
              ? `Upgrade to ${recommendedPlanName}`
              : `${currentPlanName} Plan Limit Reached`}
          </DialogTitle>
          <DialogDescription className="text-sm mt-1">
            You&apos;ve reached your {currentPlanName} plan limit for{" "}
            {featureMeta.unit || featureMeta.label.toLowerCase()}.
          </DialogDescription>
        </DialogHeader>

        {limitType === "cooldown" && retryLabel ? (
          <p className="text-center text-sm text-muted-foreground">
            Available again {retryLabel}.
          </p>
        ) : null}

        <div className="my-3 rounded-lg border bg-muted/40 p-4">
          <div className="grid grid-cols-2 gap-4 text-center">
            {/* Current Plan Column */}
            <div className="flex flex-col items-center justify-center rounded-md bg-background p-3 border shadow-xs">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {currentPlanName}
              </span>
              <span className="text-lg font-bold mt-1 text-foreground">
                {currentUsage} / {formatLimitValue(limit)}
              </span>
              <span className="text-[11px] text-muted-foreground mt-0.5">
                {featureMeta.label}
              </span>
            </div>

            {/* Recommended Plan Column */}
            {recommendedPlanName ? (
              <div className="flex flex-col items-center justify-center rounded-md bg-primary/5 p-3 border border-primary/20 shadow-xs relative overflow-hidden">
                <span className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="size-3" />
                  {recommendedPlanName}
                </span>
                <span className="text-lg font-bold mt-1 text-primary">
                  {formatLimitValue(recommendedLimit)}
                </span>
                <span className="text-[11px] text-primary/80 mt-0.5">
                  {featureMeta.label}
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-md bg-background p-3 border shadow-xs">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Maximum
                </span>
                <span className="text-sm font-medium mt-1 text-muted-foreground text-center">
                  Highest plan limit reached
                </span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-col sm:justify-stretch">
          {recommendedPlanName ? (
            <Button
              className="w-full gap-2 font-semibold"
              onClick={handleUpgradeClick}
            >
              <Zap className="size-4" />
              Upgrade to {recommendedPlanName}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={onClose}
          >
            Not now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default UpgradeModal

function formatRetryAt(value: string): string {
  const retryDate = new Date(value)
  if (Number.isNaN(retryDate.getTime())) return "soon"
  const ms = retryDate.getTime() - Date.now()
  if (ms <= 0) return "now"
  const minutes = Math.ceil(ms / 60000)
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours <= 0) return `in ${minutes}m`
  if (hours < 24) {
    return remainingMinutes > 0
      ? `in ${hours}h ${remainingMinutes}m`
      : `in ${hours}h`
  }
  return retryDate.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}
