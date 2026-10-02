import { createFileRoute, redirect } from "@tanstack/react-router"
import { Mail } from "lucide-react-motion"
import { useState } from "react"
import { UsersService } from "@/client"
import { ComposeTab } from "@/components/EmailBlasting/ComposeTab"
import { HistoryTab } from "@/components/EmailBlasting/HistoryTab"
import { TemplatesTab } from "@/components/EmailBlasting/TemplatesTab"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { APP_NAME } from "@/lib/app"

export const Route = createFileRoute("/_layout/email-blasting")({
  component: EmailBlasting,
  beforeLoad: async () => {
    const user = await UsersService.readUserMe()
    if (!user.is_superuser) {
      throw redirect({ to: "/" })
    }
  },
  head: () => ({
    meta: [{ title: `Email Blasting - ${APP_NAME}` }],
  }),
})

function EmailBlasting() {
  const [activeTab, setActiveTab] = useState("compose")

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-2">
          <Mail className="h-6 w-6 text-primary" />
          <h1 className="font-bold text-2xl tracking-tight">Email Blasting</h1>
        </div>
        <p className="text-muted-foreground">
          Compose and send targeted email campaigns to your users
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="compose">Compose</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="compose">
            <ComposeTab />
          </TabsContent>
          <TabsContent value="templates">
            <TemplatesTab />
          </TabsContent>
          <TabsContent value="history">
            <HistoryTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}

export default EmailBlasting
