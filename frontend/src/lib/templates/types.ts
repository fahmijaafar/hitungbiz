// Shared types for document template builders

import type { ClientPublic, CompanyPublic, DocumentPublic } from "@/client"

export type CompanyWithLogo = CompanyPublic & {
  company_url?: string | null
  default_document_template_id?: string | null
}

export interface TemplateBuilderArgs {
  document: DocumentPublic
  company?: CompanyWithLogo
  client?: ClientPublic
}

export type TemplateBuilder = (args: TemplateBuilderArgs) => string
