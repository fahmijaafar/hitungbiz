import { useQuery } from "@tanstack/react-query"
import { UsersService } from "@/client"

const isLoggedIn = () => {
  return (
    typeof window !== "undefined" &&
    localStorage.getItem("access_token") !== null
  )
}

export function useCurrentCompanyId(): string | null {
  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => UsersService.readUserMe(),
    enabled: isLoggedIn(),
    staleTime: 300_000,
  })

  return (
    user?.company_id ??
    (typeof window !== "undefined" ? localStorage.getItem("company_id") : null)
  )
}
