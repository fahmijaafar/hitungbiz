import { APP_NAME } from "@/lib/app"

export function Footer({ className }: { className?: string }) {
  const currentYear = new Date().getFullYear()

  return (
    <footer className={`border-t py-4 px-6 md:px-8 ${className || ""}`}>
      <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
        <p className="text-muted-foreground text-sm">
          © {APP_NAME || "App"} - {currentYear}
        </p>
      </div>
    </footer>
  )
}
