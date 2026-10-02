import {
  BadgeCheck,
  Building2,
  Calendar,
  Copy,
  Globe,
  Mail,
  MapPin,
  Phone,
  Receipt,
  Store,
  Users,
} from "lucide-react-motion"
import type { CompanyPublic } from "@/client"
import { Button } from "@/components/ui/button"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
import { getUploadUrl } from "@/lib/uploads"
import DeleteCompany from "./DeleteCompany"
import EditCompany from "./EditCompany"
import SelectCompany from "./SelectCompany"

type CompanyCardProps = {
  company: CompanyPublic
  onDelete?: (id: string) => void
  onSelect?: (company: CompanyPublic) => void
  selected?: boolean
}

const MONTH_NAMES: Record<string, string> = {
  "01": "Jan",
  "02": "Feb",
  "03": "Mar",
  "04": "Apr",
  "05": "May",
  "06": "Jun",
  "07": "Jul",
  "08": "Aug",
  "09": "Sep",
  "10": "Oct",
  "11": "Nov",
  "12": "Dec",
}

function formatFYE(fye: string | null | undefined): string {
  if (!fye) return "31 Dec"
  const [day, month] = fye.split("-")
  return `${parseInt(day, 10)} ${MONTH_NAMES[month] ?? month}`
}

type FieldProps = {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
}

function Field({ icon, label, value }: FieldProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  )
}

export default function CompanyCard({
  company,
  selected = false,
}: CompanyCardProps) {
  const { showSuccessToast } = useCustomToast()
  const { user: currentUser } = useAuth()

  const isOwner =
    Boolean(currentUser?.is_superuser) ||
    Boolean(
      currentUser?.id &&
        company.user_id &&
        String(currentUser.id) === String(company.user_id),
    )

  const handleCopyId = async () => {
    await navigator.clipboard.writeText(company.id)
    showSuccessToast("Company ID copied to clipboard")
  }

  const logoUrl = company.company_url ? getUploadUrl(company.company_url) : null

  return (
    <div
      className={`flex flex-col rounded-xl border border-border bg-card shadow-xs transition-shadow hover:shadow-md ${
        selected ? "border-l-3 border-l-primary" : ""
      }`}
    >
      {/* ── Top section: logo + name + actions ── */}
      <div className="flex gap-4 p-4 pb-3">
        {/* Logo / icon panel */}
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border bg-muted">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={`${company.company_name} logo`}
              className="h-full w-full rounded-xl object-contain"
              loading="lazy"
            />
          ) : (
            <Store className="h-8 w-8 text-muted-foreground" />
          )}
        </div>

        {/* Name + action buttons */}
        <div className="flex flex-1 items-start justify-between gap-2 min-w-0">
          <h3 className="text-base font-semibold leading-tight pt-1 truncate">
            {company.company_name}
          </h3>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleCopyId}
              title="Copy company ID"
            >
              <span className="sr-only">Copy company ID</span>
              <Copy className="h-4 w-4" />
            </Button>
            <EditCompany company={company} />
            {isOwner && <DeleteCompany company={company} />}
          </div>
        </div>
      </div>

      {/* ── Fields grid ── */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 pb-4">
        <Field
          icon={<Mail className="h-3 w-3" />}
          label="Email"
          value={
            <span className="truncate block" title={company.company_email}>
              {company.company_email}
            </span>
          }
        />
        <Field
          icon={<BadgeCheck className="h-3 w-3" />}
          label="Registration"
          value={company.registration_number || "None"}
        />
        <Field
          icon={<Phone className="h-3 w-3" />}
          label="Phone"
          value={company.phone_number}
        />
        <Field
          icon={<Globe className="h-3 w-3" />}
          label="Currency"
          value={company.currency}
        />
        <Field
          icon={<Building2 className="h-3 w-3" />}
          label="Type"
          value={company.company_type || "—"}
        />
        <Field
          icon={<Store className="h-3 w-3" />}
          label="Industry"
          value={company.business_industry || "—"}
        />
        <Field
          icon={<Users className="h-3 w-3" />}
          label="Employees"
          value={company.employee_size || "—"}
        />
        <Field
          icon={<Calendar className="h-3 w-3" />}
          label="FYE"
          value={formatFYE(company.financial_year_end)}
        />
        <Field
          icon={<Receipt className="h-3 w-3" />}
          label="e-Invoice"
          value={company.einvoice_required ? "Yes" : "No"}
        />
        {company.sst_registration_number && (
          <Field
            icon={<BadgeCheck className="h-3 w-3" />}
            label="SST No."
            value={company.sst_registration_number}
          />
        )}
      </div>

      {/* ── Address + select footer ── */}
      <div className="flex items-end justify-between gap-3 border-t px-4 py-3">
        <div className="flex min-w-0 items-start gap-1.5 text-muted-foreground">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] font-medium">Address</p>
            <p className="text-sm leading-snug line-clamp-2">
              {company.company_address || "—"}
            </p>
          </div>
        </div>
        <SelectCompany company={company} selected={selected} />
      </div>
    </div>
  )
}
