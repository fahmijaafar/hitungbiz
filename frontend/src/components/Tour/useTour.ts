import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useContext } from "react"
import { UsersService } from "@/client"
import useAuth from "@/hooks/useAuth"
import { TourContext, type TourContextType } from "./TourProvider"

export function useTour() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const tourContext = useContext(TourContext) as TourContextType

  const markTourCompletedMutation = useMutation({
    mutationFn: async () => {
      return await UsersService.updateUserMe({
        requestBody: {
          has_completed_tour: true,
          completed_tour_at: new Date().toISOString(),
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
    },
  })

  const completeTour = async () => {
    try {
      await markTourCompletedMutation.mutateAsync()
    } catch (error) {
      console.error("Failed to update tour completion status:", error)
    }
  }

  return {
    startTour: tourContext.startTour,
    stopTour: tourContext.stopTour,
    isTourActive: tourContext.isTourActive,
    completeTour,
    hasCompletedTour: !!user?.has_completed_tour,
    isUpdating: markTourCompletedMutation.isPending,
  }
}
