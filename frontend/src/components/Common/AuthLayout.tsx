import {
  BarChart3,
  Calculator,
  ChevronDown,
  FileText,
  ScanLine,
  TrendingUp,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Appearance } from "@/components/Common/Appearance"
import { Logo } from "@/components/Common/Logo"
import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"
import bgDark from "/assets/images/background-dark.png"
import bgLight from "/assets/images/background-light.png"
import { Footer } from "./Footer"

interface AuthLayoutProps {
  children: React.ReactNode
  mobileButtonText?: string
}

export function AuthLayout({
  children,
  mobileButtonText = "Sign In / Sign Up",
}: AuthLayoutProps) {
  const { resolvedTheme } = useTheme()
  const bgImage = resolvedTheme === "dark" ? bgDark : bgLight

  const authFormRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLElement>(null)
  const [isFormVisible, setIsFormVisible] = useState(false)

  useEffect(() => {
    const target = authFormRef.current
    if (!target) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsFormVisible(entry.isIntersecting)
      },
      { threshold: 0.2 },
    )

    observer.observe(target)

    return () => {
      observer.disconnect()
    }
  }, [])

  const scrollToForm = () => {
    if (footerRef.current) {
      footerRef.current.scrollIntoView({ behavior: "smooth", block: "end" })
    } else {
      authFormRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
    }
  }

  const features = [
    {
      icon: ScanLine,
      title: "AI Receipt Scanner",
      description: "Extract and categorize receipts instantly",
      iconStyle:
        "border-blue-500/30 bg-blue-500/10 text-blue-500 dark:text-blue-400 dark:border-blue-400/30 dark:bg-blue-950/40",
    },
    {
      icon: TrendingUp,
      title: "Sales & Expense Tracking",
      description: "Keep your finances organized in real-time",
      iconStyle:
        "border-indigo-500/30 bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 dark:border-indigo-400/30 dark:bg-indigo-950/40",
    },
    {
      icon: FileText,
      title: "Invoices & Payments",
      description: "Create professional invoices and get paid faster",
      iconStyle:
        "border-cyan-500/30 bg-cyan-500/10 text-cyan-500 dark:text-cyan-400 dark:border-cyan-400/30 dark:bg-cyan-950/40",
    },
    {
      icon: BarChart3,
      title: "Financial Reports",
      description: "Understand your business with smart reports",
      iconStyle:
        "border-purple-500/30 bg-purple-500/10 text-purple-500 dark:text-purple-400 dark:border-purple-400/30 dark:bg-purple-950/40",
    },
    {
      icon: Calculator,
      title: "LHDN Tax Calculator",
      description: "Estimate taxes and stay LHDN compliant effortlessly",
      iconStyle:
        "border-emerald-500/30 bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 dark:border-emerald-400/30 dark:bg-emerald-950/40",
    },
  ]

  return (
    <div
      className="relative flex min-h-svh w-full flex-col justify-between bg-cover bg-center bg-no-repeat p-4 sm:p-6 lg:p-10 transition-all duration-300 overflow-x-hidden"
      style={{ backgroundImage: `url(${bgImage})` }}
    >
      <div className="absolute inset-0 bg-background/30 dark:bg-black/40 pointer-events-none" />

      {/* Top Header */}
      <header className="relative z-10 flex items-center justify-between shrink-0 h-12 sm:h-14">
        <Logo variant="full" className="h-8" asLink={true} />
        <Appearance />
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex flex-1 flex-col justify-center my-2 lg:my-8">
        <div className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Marketing & Branding Panel (Takes full screen height on mobile before scroll) */}
          <div className="lg:col-span-7 flex flex-col justify-between min-h-[calc(100dvh-5.5rem)] lg:min-h-0 py-2 lg:py-2">
            <div className="flex flex-col justify-center flex-1 space-y-5 sm:space-y-8 my-auto">
              <div className="space-y-3 sm:space-y-4 text-left">
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground leading-[1.15]">
                  Smarter bookkeeping{" "}
                  <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 bg-clip-text text-transparent drop-shadow-sm">
                    for modern businesses
                  </span>
                </h1>
                <p className="text-base sm:text-lg text-muted-foreground max-w-xl font-normal leading-relaxed">
                  Track sales, manage expenses, generate invoices, and get
                  AI-powered insights, all in one place. And it's FREE forever!
                </p>
              </div>

              {/* Feature list */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 max-w-xl gap-3 sm:gap-4">
                {features.map((feature, idx) => {
                  const IconComponent = feature.icon
                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-3.5 sm:gap-4 p-3 sm:p-4 rounded-xl border border-border/40 bg-background/60 dark:bg-slate-900/50 backdrop-blur-md transition-all duration-200 hover:border-border/80 hover:bg-background/80 dark:hover:bg-slate-900/70 shadow-sm"
                    >
                      <div
                        className={cn(
                          "p-2.5 rounded-lg border shrink-0 flex items-center justify-center shadow-xs",
                          feature.iconStyle,
                        )}
                      >
                        <IconComponent className="size-5" />
                      </div>
                      <div className="space-y-0.5">
                        <h3 className="font-semibold text-sm sm:text-base text-foreground leading-tight">
                          {feature.title}
                        </h3>
                        <p className="text-xs sm:text-sm text-muted-foreground leading-snug">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Spacer for bottom slide button area on mobile */}
            <div className="h-16 lg:hidden shrink-0" />
          </div>

          {/* Right Auth Form Panel (Pushed below fold on mobile) */}
          <div
            ref={authFormRef}
            id="auth-form"
            className="lg:col-span-5 flex flex-col justify-center items-center w-full min-h-[calc(100dvh-5.5rem)] lg:min-h-0 py-8 lg:py-2 scroll-mt-6"
          >
            <div className="w-full max-w-md rounded-2xl border border-border/40 bg-background/85 dark:bg-background/85 p-6 sm:p-8 shadow-2xl backdrop-blur-md">
              {children}
            </div>
          </div>
        </div>
      </main>

      {/* Floating Mobile Slide Button */}
      <div
        className={cn(
          "fixed bottom-6 inset-x-4 z-50 lg:hidden flex justify-center transition-all duration-300 pointer-events-none",
          isFormVisible
            ? "opacity-0 translate-y-6"
            : "opacity-100 translate-y-0 pointer-events-auto",
        )}
      >
        <button
          type="button"
          onClick={scrollToForm}
          className="w-full max-w-xs flex items-center justify-center gap-2 py-3 px-6 rounded-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-sm shadow-xl shadow-blue-600/30 backdrop-blur-lg border border-blue-400/30 transition-all active:scale-95 cursor-pointer"
        >
          <span>{mobileButtonText}</span>
          <ChevronDown className="size-4 animate-bounce shrink-0" />
        </button>
      </div>

      {/* Footer */}
      <footer ref={footerRef} className="relative z-10 shrink-0">
        <Footer />
      </footer>
    </div>
  )
}
