import { createFileRoute } from "@tanstack/react-router"
import UpgradePlan from "@/components/UpgradePlan/UpgradePlan"
import { APP_NAME } from "@/lib/app"

export const Route = createFileRoute("/_layout/upgrade")({
  component: UpgradePlan,
  head: () => ({
    meta: [
      {
        title: `Upgrade Plan - ${APP_NAME}`,
      },
    ],
  }),
})
