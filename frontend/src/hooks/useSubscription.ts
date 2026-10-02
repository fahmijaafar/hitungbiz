import { useQuery } from "@tanstack/react-query"
import { SubscriptionService, type UserSubscriptionPublic } from "@/client"
import { isLoggedIn } from "@/hooks/useAuth"

/** Fallback used when the API fails or data is unavailable — UI-only, never written to the DB. */
const PERSONAL_FALLBACK: UserSubscriptionPublic = {
  plan: "personal",
  billing_period: null,
  status: "active",
  started_at: null,
  expires_at: null,
}

const useSubscription = () => {
  const {
    data: subscription,
    isLoading,
    isError,
  } = useQuery<UserSubscriptionPublic>({
    queryKey: ["subscription"],
    queryFn: SubscriptionService.readSubscription,
    enabled: isLoggedIn(),
    // Stale for 5 minutes — subscription doesn't change often
    staleTime: 5 * 60 * 1000,
  })

  return {
    /** The user's current subscription, or the Personal fallback if unavailable */
    subscription: isError || !subscription ? PERSONAL_FALLBACK : subscription,
    isLoading,
    isError,
  }
}

export default useSubscription
