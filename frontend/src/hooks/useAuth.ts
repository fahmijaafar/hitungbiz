import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"

import {
  type Body_login_login_access_token as AccessToken,
  LoginService,
  type UserPublic,
  type UserRegister,
  UsersService,
} from "@/client"
import { handleError } from "@/utils"
import useCustomToast from "./useCustomToast"

const isLoggedIn = () => {
  return localStorage.getItem("access_token") !== null
}

const clearLocalStorage = () => {
  localStorage.removeItem("access_token")
  localStorage.removeItem("company_id")
  localStorage.removeItem("role")
}

const useAuth = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showErrorToast, showSuccessToast } = useCustomToast()

  const { data: user } = useQuery<UserPublic | null, Error>({
    queryKey: ["currentUser"],
    queryFn: async () => {
      const user = await UsersService.readUserMe()
      if (user.company_id) {
        localStorage.setItem("company_id", user.company_id)
      } else {
        localStorage.removeItem("company_id")
      }
      if (user.role) {
        localStorage.setItem("role", user.role)
      }
      return user
    },
    enabled: isLoggedIn(),
  })

  const signUpMutation = useMutation({
    mutationFn: (data: UserRegister) =>
      UsersService.registerUser({ requestBody: data }),
    onSuccess: () => {
      // Redirect to login — user must verify email before accessing the app
      navigate({ to: "/login" })
      showSuccessToast(
        "Account created! Check your email to verify your address before logging in.",
      )
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] })
    },
  })

  const login = async (data: AccessToken) => {
    const response = await LoginService.loginAccessToken({
      formData: data,
    })
    localStorage.setItem("access_token", response.access_token)
  }

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: async () => {
      // Clear all cached data from previous user before fetching new data
      queryClient.clear()

      localStorage.removeItem("company_id")
      localStorage.removeItem("role")

      const user = await queryClient.fetchQuery<UserPublic>({
        queryKey: ["currentUser"],
        queryFn: UsersService.readUserMe,
      })
      if (user.company_id) {
        localStorage.setItem("company_id", user.company_id)
      }
      if (user.role) {
        localStorage.setItem("role", user.role)
      }

      // Route based on verification + onboarding state
      if (!user.email_verified) {
        navigate({ to: "/email-verification-required" })
      } else if (!user.company_id) {
        navigate({ to: "/onboarding" })
      } else {
        navigate({ to: "/" })
      }
    },
    onError: handleError.bind(showErrorToast),
  })

  const logout = () => {
    clearLocalStorage()
    queryClient.clear()
    navigate({ to: "/login" })
  }

  return {
    signUpMutation,
    loginMutation,
    logout,
    user,
  }
}

export { isLoggedIn }
export default useAuth
