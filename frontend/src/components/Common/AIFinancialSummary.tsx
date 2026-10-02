import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  TriangleAlert as AlertTriangle,
  CircleCheck as CheckCircle2,
  Lightbulb,
  Loader as Loader2,
  Minus,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react-motion"
import { useState } from "react"

import UpgradeModal from "@/components/UpgradePlan/UpgradeModal"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AI_INSIGHT_MODULES,
  type AIFinancialSummary as AIFinancialSummaryData,
  type AIInsightMetadata,
  type AIInsightModuleType,
  type AIKeyMetric,
  generateAIInsight,
  getStoredAIInsight,
} from "@/lib/aiInsights"
import { UPGRADE_PATH } from "@/lib/planLimits"
import { cn } from "@/lib/utils"

interface AIFinancialSummaryProps {
  moduleType?: AIInsightModuleType
  title?: string
  description?: string
  period: string
  periodLabel: string
}

function TrendIcon({ trend }: { trend: AIKeyMetric["trend"] }) {
  if (trend === "up") return <TrendingUp className="h-4 w-4 text-green-500" />
  if (trend === "down")
    return <TrendingDown className="h-4 w-4 text-rose-500" />
  return <Minus className="h-4 w-4 text-muted-foreground" />
}

function priorityVariant(priority: string) {
  if (priority === "high") return "destructive" as const
  if (priority === "low") return "secondary" as const
  return "default" as const
}

function formatTimestamp(value: string | null): string {
  if (!value) return ""
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function errorDetail(error: unknown): string | null {
  return (
    (error as { body?: { detail?: string } } | null)?.body?.detail ||
    (error as { message?: string } | null)?.message ||
    null
  )
}

const AIFinancialSummary = ({
  moduleType,
  title,
  description,
  period,
  periodLabel,
}: AIFinancialSummaryProps) => {
  const queryClient = useQueryClient()
  const [upgradeModalState, setUpgradeModalState] = useState({
    open: false,
    feature: "ai_summary",
    currentPlan: "personal",
    currentUsage: 0,
    limit: 1,
    limitType: "cooldown" as string | undefined,
    retryAt: null as string | null,
    recommendedPlan: "pro" as string | null,
  })
  const moduleTypeValue = moduleType ?? "financial_summary"
  const moduleMeta: AIInsightMetadata = AI_INSIGHT_MODULES[moduleTypeValue]
  const SUMMARY_KEY = ["aiInsight", moduleTypeValue]

  // Load the stored, company-level insight on mount. A 404 means none exists
  // yet, which we treat as an empty (not error) state.
  const {
    data: stored,
    isLoading,
    error: loadError,
  } = useQuery({
    queryKey: SUMMARY_KEY,
    queryFn: () => getStoredAIInsight(moduleTypeValue),
    retry: false,
  })

  const loadStatus = (loadError as { status?: number } | null)?.status
  const noSummaryYet = loadStatus === 404

  const {
    mutate,
    isPending,
    error: generateError,
  } = useMutation({
    mutationFn: () => generateAIInsight(moduleTypeValue, period),
    onSuccess: (result: AIFinancialSummaryData) => {
      queryClient.setQueryData(SUMMARY_KEY, result)
    },
    onError: (err: any) => {
      const errDetail = err?.body?.detail
      if (
        errDetail &&
        typeof errDetail === "object" &&
        errDetail.error === "LIMIT_REACHED"
      ) {
        setUpgradeModalState({
          open: true,
          feature: errDetail.feature || "ai_summary",
          currentPlan: errDetail.plan || "personal",
          currentUsage: errDetail.current_usage ?? 1,
          limit: errDetail.limit ?? 1,
          limitType: errDetail.limit_type,
          retryAt: errDetail.retry_at ?? null,
          recommendedPlan:
            errDetail.next_plan ?? UPGRADE_PATH[errDetail.plan] ?? null,
        })
      }
    },
  })

  const data: AIFinancialSummaryData | undefined = noSummaryYet
    ? undefined
    : stored

  const cardTitle = title ?? moduleMeta.title
  const cardDescription = description ?? moduleMeta.description
  const summaryPeriodLabel = data?.period
    ? data.period
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
    : periodLabel
  const statusLabel = data ? summaryPeriodLabel : periodLabel
  const formattedModuleTitle = moduleMeta.title
    .toLowerCase()
    .replace(/\bai\b/g, "AI")
  const loadingMessage = isPending
    ? `Generating ${formattedModuleTitle}...`
    : `Loading ${formattedModuleTitle}...`
  const emptyMessage =
    moduleTypeValue === "financial_summary"
      ? `Generate an AI-written analysis of your company's financials for ${periodLabel.toLowerCase()}, including strengths, concerns, and actionable recommendations.`
      : `Generate an AI-written analysis of your company's financials for ${periodLabel.toLowerCase()} and view the result here.`

  const generateLimitReached =
    (generateError as { body?: { detail?: { error?: string } } } | null)?.body
      ?.detail?.error === "LIMIT_REACHED"
  const errorMessage =
    (generateLimitReached ? null : errorDetail(generateError)) ||
    (loadError && !noSummaryYet ? errorDetail(loadError) : null)

  const lastUpdated = data?.generated_at
    ? formatTimestamp(data.generated_at)
    : ""

  return (
    <>
      <div className="rounded-xl border bg-card text-card-foreground shadow">
        <div className="p-6 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">{cardTitle}</h3>
                <span className="text-xs text-muted-foreground">
                  {statusLabel}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{cardDescription}</p>
            </div>
            <Button
              size="sm"
              onClick={() => mutate()}
              disabled={isPending || isLoading}
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : data ? (
                "Regenerate"
              ) : moduleTypeValue === "financial_summary" ? (
                "Generate Summary"
              ) : (
                "Generate Analysis"
              )}
            </Button>
          </div>

          {lastUpdated && !isPending && (
            <p className="text-xs text-muted-foreground -mt-1">
              Last updated: {lastUpdated}
            </p>
          )}

          {isLoading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              {loadingMessage}
            </div>
          )}

          {!isLoading && !data && !isPending && !errorMessage && (
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          )}

          {errorMessage && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-rose-700 dark:border-red-900 dark:bg-red-950 dark:text-rose-300">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {isPending && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              {loadingMessage}
            </div>
          )}

          {data && !isPending && (
            <div className="flex flex-col gap-5">
              {data.headline && (
                <p className="text-base font-medium">{data.headline}</p>
              )}
              {data.summary && (
                <p className="text-sm text-muted-foreground">{data.summary}</p>
              )}

              {data.key_metrics.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {data.key_metrics.map((m) => (
                    <div
                      key={`${m.label}-${m.value}`}
                      className="rounded-lg border bg-background p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {m.label}
                        </span>
                        <TrendIcon trend={m.trend} />
                      </div>
                      <div className="text-lg font-semibold">{m.value}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid gap-5 md:grid-cols-2">
                {data.strengths.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      Strengths
                    </div>
                    <ul className="space-y-1.5">
                      {data.strengths.map((s) => (
                        <li
                          key={s}
                          className="text-sm text-muted-foreground flex gap-2"
                        >
                          <span className="text-green-500">•</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {data.concerns.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      Concerns
                    </div>
                    <ul className="space-y-1.5">
                      {data.concerns.map((c) => (
                        <li
                          key={c}
                          className="text-sm text-muted-foreground flex gap-2"
                        >
                          <span className="text-amber-500">•</span>
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {data.recommendations.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Lightbulb className="h-4 w-4 text-primary" />
                    Recommendations
                  </div>
                  <div className="space-y-2">
                    {data.recommendations.map((r) => (
                      <div
                        key={r.title}
                        className="rounded-lg border bg-background p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{r.title}</span>
                          <Badge
                            variant={priorityVariant(r.priority)}
                            className={cn("capitalize")}
                          >
                            {r.priority}
                          </Badge>
                        </div>
                        {r.rationale && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {r.rationale}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                AI-generated from your data. Review before making decisions; not
                financial, tax, or legal advice.
              </p>
            </div>
          )}
        </div>
      </div>
      <UpgradeModal
        open={upgradeModalState.open}
        onClose={() =>
          setUpgradeModalState((prev) => ({ ...prev, open: false }))
        }
        feature={upgradeModalState.feature}
        currentPlan={upgradeModalState.currentPlan}
        currentUsage={upgradeModalState.currentUsage}
        limit={upgradeModalState.limit}
        limitType={upgradeModalState.limitType}
        retryAt={upgradeModalState.retryAt}
        recommendedPlan={upgradeModalState.recommendedPlan}
      />
    </>
  )
}

export default AIFinancialSummary
