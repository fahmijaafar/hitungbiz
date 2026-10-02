import { APP_NAME } from "@/lib/app"

const appName = APP_NAME || "App"

export interface TourStepConfig {
  element?: string
  title: string
  description: string
  side?: "top" | "right" | "bottom" | "left"
  align?: "start" | "center" | "end"
}

export const TOUR_STEPS: TourStepConfig[] = [
  {
    title: `👋 Welcome to ${appName}!`,
    description:
      `Welcome to ${appName}!\n\nLet's take a quick tour around the app.\nIt'll only take about a minute, and by the end of it you'll know where everything lives.\n\nReady? Let's go!`,
  },
  {
    element: "#sidebar-dashboard",
    title: "Dashboard",
    description:
      "This is your dashboard.\nThink of it as your business health check.\n\nYou'll see your revenue, expenses, profit (hopefully 😄), and a bunch of nice-looking charts because numbers are less scary when they're colourful.\n\nOh, and our AI is here too! It'll help spot trends, explain your finances, and give recommendations when something deserves your attention.",
    side: "right",
    align: "start",
  },
  {
    element: "#sidebar-tax",
    title: "LHDN Tax Advisor",
    description:
      "Taxes... not exactly everyone's favourite topic 😅\n\nBased on your transactions, we'll let you know when your business is getting close to taxable territory, what expenses are generally deductible, and what might need a second look.\n\nNo accountant? No problem. We'll try to point you in the right direction.",
    side: "right",
    align: "center",
  },
  {
    element: "#sidebar-companies",
    title: "Companies",
    description:
      "Got more than one business? Nice 😎\n\nCreate as many companies as you need and keep everything separate. Each company has its own customers, products, reports, invoices, and financial records.\n\nOne side hustle is never enough... why not have three? 😄",
    side: "right",
    align: "center",
  },
  {
    element: "#sidebar-clients",
    title: "Clients",
    description:
      "Save your customers here.\n\nIt'll save you from typing the same information over and over again when creating invoices or quotations.\n\nAnd who knows... they might become customers for your next big business too. 😉",
    side: "right",
    align: "center",
  },
  {
    element: "#sidebar-products",
    title: "Products",
    description:
      "Add the products or services you sell.\n\nIt'll make creating invoices much faster, and you'll be able to track what's selling best.\n\nFuture you will definitely appreciate spending a few minutes here.",
    side: "right",
    align: "center",
  },
  {
    element: "#sidebar-transactions",
    title: "Transactions",
    description:
      "This is where all your business activity comes together.\n\nNeed to review, edit or search your records? This is the place to do it.\n\nThink of it as your bookkeeping timeline.",
    side: "right",
    align: "center",
  },
  {
    element: "#sidebar-revenue",
    title: "Revenue",
    description:
      "Money came in? Awesome! 🎉\n\nRecord your revenue here so your reports stay accurate and your business performance is always up to date.",
    side: "right",
    align: "center",
  },
  {
    element: "#sidebar-expenses",
    title: "Expenses",
    description:
      'Bought supplies? Paid subscriptions? Coffee for "business purposes"? ☕\n\nRecord your expenses here, or simply scan the receipt and let us fill in most of the details for you.',
    side: "right",
    align: "center",
  },
  {
    element: "#sidebar-import",
    title: "Import",
    description:
      "Already keeping records in Excel or another system?\n\nNo worries.\n\nImport everything here.\n\nUpload your file, match the columns, review the data, and you're good to go.",
    side: "right",
    align: "center",
  },
  {
    element: "#sidebar-bank-reconciliation",
    title: "Bank Reconciliation",
    description:
      "Don't feel like entering transactions one by one?\n\nUpload your bank statement and let us match the transactions for you.\n\nAll that's left is a quick review.\n\nIt works best if you have a dedicated business bank account.",
    side: "right",
    align: "center",
  },
  {
    element: "#sidebar-documents",
    title: "Documents",
    description:
      "Need to send a quotation, invoice, or payment voucher?\n\nPick from beautifully designed templates, then print them or simply share a link with your customer.\n\nLooking professional has never been easier.",
    side: "right",
    align: "center",
  },
  {
    element: "#sidebar-recurring-invoices",
    title: "Recurring Invoices",
    description:
      "Got customers who pay every month?\n\nSet up a recurring invoice once, and we'll handle the rest automatically.\n\nLess admin work. More time to grow your business.",
    side: "right",
    align: "center",
  },
  {
    title: "🎉 You're all set!",
    description:
      `That's pretty much it!\n\nYou have started by creating your company, then you may proceed to add your customers, products, and your first few transactions.\n\nBefore you know it, you'll have beautiful reports, AI insights, and hopefully... plenty of profit. 🚀\n\nEnjoy using ${appName}!`,
  },
]
