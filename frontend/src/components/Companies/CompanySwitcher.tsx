import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Check,
  ChevronDown,
  Loader as Loader2,
  Plus,
  Store,
} from "lucide-react-motion"
import { useState } from "react"

import { CompaniesService, type CompanyPublic, UsersService } from "@/client"
import AddCompany from "@/components/Companies/AddCompany"
import UpgradeModal from "@/components/UpgradePlan/UpgradeModal"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import useCustomToast from "@/hooks/useCustomToast"
import useSubscription from "@/hooks/useSubscription"
import { setAppCurrency } from "@/lib/currency"
import { PLAN_FEATURE_LIMITS, UPGRADE_PATH } from "@/lib/planLimits"
import { getUploadUrl } from "@/lib/uploads"
import { cn } from "@/lib/utils"
import { handleError } from "@/utils"

export default function CompanySwitcher() {
  const [isAddCompanyOpen, setIsAddCompanyOpen] = useState(false)
  const [upgradeModalState, setUpgradeModalState] = useState<{
    open: boolean
    currentPlan: string
    currentUsage: number
    limit: number
    recommendedPlan?: string | null
  }>({
    open: false,
    currentPlan: "personal",
    currentUsage: 0,
    limit: 2,
    recommendedPlan: "pro",
  })

  const { subscription } = useSubscription()
  const queryClient = useQueryClient()
  const { showErrorToast } = useCustomToast()

  const { data: currentUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => UsersService.readUserMe(),
  })

  const companyId = currentUser?.company_id

  const { data: activeCompany, isLoading: isLoadingActiveCompany } = useQuery({
    queryKey: ["companyName", companyId],
    queryFn: async () => {
      if (!companyId) return null
      return CompaniesService.readCompany({ id: companyId })
    },
    enabled: !!companyId,
    staleTime: Infinity,
  })

  const { data: companiesResp, isLoading: isLoadingCompanies } = useQuery({
    queryKey: ["companies"],
    queryFn: () => CompaniesService.readCompanies({ skip: 0, limit: 100 }),
    staleTime: 60_000,
  })

  const selectCompanyMutation = useMutation({
    mutationFn: (targetCompany: CompanyPublic) =>
      UsersService.updateUserMe({
        requestBody: { company_id: targetCompany.id },
      }),
    onSuccess: (updatedUser, targetCompany) => {
      if (updatedUser.company_id) {
        localStorage.setItem("company_id", updatedUser.company_id)
      }
      setAppCurrency(targetCompany.currency)
      queryClient.setQueryData(["currentUser"], updatedUser)
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
      queryClient.invalidateQueries({ queryKey: ["companyName"] })
      queryClient.invalidateQueries({ queryKey: ["company"] })
      queryClient.invalidateQueries({ queryKey: ["companies"] })
      queryClient.resetQueries()
    },
    onError: handleError.bind(showErrorToast),
  })

  const companies = companiesResp?.data || []
  const isSwitching = selectCompanyMutation.isPending

  const handleSelectCompany = (company: CompanyPublic) => {
    if (String(company.id) === String(companyId)) return
    selectCompanyMutation.mutate(company)
  }

  const handleOpenAddCompany = () => {
    const currentPlan = subscription?.plan || "personal"
    const rawLimit = PLAN_FEATURE_LIMITS[currentPlan]?.companies
    const limit = typeof rawLimit === "number" ? rawLimit : null
    const currentUsage = companies.length

    if (!currentUser?.is_superuser && limit !== null && currentUsage >= limit) {
      setUpgradeModalState({
        open: true,
        currentPlan,
        currentUsage,
        limit,
        recommendedPlan: UPGRADE_PATH[currentPlan],
      })
    } else {
      setIsAddCompanyOpen(true)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex items-center gap-2 h-9 px-2 hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring cursor-pointer select-none rounded-md"
            data-testid="company-switcher-trigger"
            disabled={isSwitching}
          >
            {isSwitching ? (
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
                <span className="text-sm font-semibold text-muted-foreground">
                  Switching...
                </span>
              </div>
            ) : activeCompany ? (
              <div className="flex items-center gap-2 min-w-0">
                {activeCompany.company_url && (
                  <Avatar className="size-7 border bg-background shrink-0">
                    <AvatarImage
                      src={getUploadUrl(activeCompany.company_url)}
                      alt={`${activeCompany.company_name} logo`}
                      className="object-contain"
                    />
                    <AvatarFallback className="text-[10px] bg-muted">
                      <Store className="size-3 text-muted-foreground" />
                    </AvatarFallback>
                  </Avatar>
                )}
                <span className="text-sm font-semibold text-muted-foreground max-w-[180px] sm:max-w-[220px] truncate">
                  {activeCompany.company_name}
                </span>
                <ChevronDown className="size-4 text-muted-foreground shrink-0" />
              </div>
            ) : isLoadingActiveCompany ? (
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-64 max-h-80 overflow-y-auto p-1.5"
        >
          {isLoadingCompanies ? (
            <DropdownMenuItem disabled className="flex items-center gap-2 py-2">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Loading companies...
              </span>
            </DropdownMenuItem>
          ) : companies.length === 0 ? (
            <>
              <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                No companies found
              </div>
              <DropdownMenuItem
                onClick={handleOpenAddCompany}
                className="cursor-pointer gap-2 py-2 font-medium text-primary focus:text-primary"
              >
                <Plus className="size-4" />
                Create your first company
              </DropdownMenuItem>
            </>
          ) : (
            <>
              {companies.map((comp) => {
                const isSelected = String(comp.id) === String(companyId)
                const logoUrl = comp.company_url
                  ? getUploadUrl(comp.company_url)
                  : null

                return (
                  <DropdownMenuItem
                    key={comp.id}
                    onClick={() => handleSelectCompany(comp)}
                    className={cn(
                      "flex items-center justify-between gap-3 cursor-pointer py-2 px-2.5 rounded-md",
                      isSelected &&
                        "bg-accent text-accent-foreground font-medium",
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <Avatar className="size-6 border bg-background shrink-0">
                        {logoUrl && (
                          <AvatarImage
                            src={logoUrl}
                            alt={`${comp.company_name} logo`}
                            className="object-contain"
                          />
                        )}
                        <AvatarFallback className="text-[10px] bg-muted">
                          <Store className="size-3 text-muted-foreground" />
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm truncate font-medium">
                        {comp.company_name}
                      </span>
                    </div>
                    {isSelected && (
                      <Check className="size-4 text-primary shrink-0 ml-auto" />
                    )}
                  </DropdownMenuItem>
                )
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleOpenAddCompany}
                className="cursor-pointer gap-2 py-2 font-medium"
              >
                <Plus className="size-4" />
                Add New Company
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AddCompany open={isAddCompanyOpen} onOpenChange={setIsAddCompanyOpen} />

      <UpgradeModal
        open={upgradeModalState.open}
        onClose={() =>
          setUpgradeModalState((prev) => ({ ...prev, open: false }))
        }
        feature="companies"
        currentPlan={upgradeModalState.currentPlan}
        currentUsage={upgradeModalState.currentUsage}
        limit={upgradeModalState.limit}
        recommendedPlan={upgradeModalState.recommendedPlan}
      />
    </>
  )
}
