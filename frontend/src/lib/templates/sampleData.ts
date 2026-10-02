// Sample data used for template preview — no database writes occur.

import type { ClientPublic, CompanyPublic, DocumentPublic } from "@/client"
import type { CompanyWithLogo } from "./types"

export const sampleCompany: CompanyWithLogo = {
  id: "00000000-0000-0000-0000-000000000000" as unknown as CompanyPublic["id"],
  company_name: "science4derp Enterprise",
  registration_number: "MA0349808-H",
  company_email: "hello@science4derp.com",
  phone_number: "0136343715",
  company_address:
    "Suite 12, Tower 3, Kuala Lumpur City Centre, 50088 Kuala Lumpur",
  // Use the public asset directly — no upload prefix needed for preview
  company_url: "/assets/images/science4derp-logo.png",
  currency: "RM",
  is_active: true,
  document_running_numbers: {
    quotation: 1,
    invoice: 1,
    paymentvoucher: 1,
    deliveryorder: 1,
  },
  employee_size: null,
  business_industry: null,
  company_type: null,
  financial_year_end: "31-12",
  sst_registration_number: null,
  einvoice_required: false,
  default_document_template_id: null,
  user_id: null,
}

export const sampleClient: ClientPublic = {
  id: "00000000-0000-0000-0000-000000000001" as unknown as ClientPublic["id"],
  name: "John Smith",
  email: "john.smith@globalcorp.com",
  phone_number: "+60 11-222 3344",
  company_name: "Global Corp Sdn. Bhd.",
  customer_type: "business",
  reg_number: "201901056789",
  billing_address:
    "Level 20, Menara Global, Jalan Sultan Ismail, 50250 Kuala Lumpur",
  company_id: null,
}

export const sampleDocument: DocumentPublic = {
  id: "00000000-0000-0000-0000-000000000002" as unknown as DocumentPublic["id"],
  docno: "INV00001",
  doctype: "invoice",
  title: "Web Application Development — Phase 1",
  date: "2026-07-31",
  duedate: "2026-08-31",
  validity: null,
  status: "Pending",
  remark:
    "Payment is due within 30 days.\nBank: Maybank Berhad\nAccount Name: science4derp Enterprise\nAccount No: 1234-5678-9012\n\nThank you for your business!",
  client_id: sampleClient.id,
  company_id: sampleCompany.id,
  item: [
    {
      title: "UI/UX Design",
      description: "Wireframing, prototyping and final design",
      unit_price: 2500,
      quantity: 1,
      unit_type: "pax",
      total: 2500,
    },
    {
      title: "Frontend Development",
      description: "React + TypeScript implementation",
      unit_price: 4500,
      quantity: 1,
      unit_type: "pax",
      total: 4500,
    },
    {
      title: "Backend API Development",
      description: "FastAPI with PostgreSQL database",
      unit_price: 3800,
      quantity: 1,
      unit_type: "pax",
      total: 3800,
    },
    {
      title: "Project Management",
      description: null,
      unit_price: 800,
      quantity: 2,
      unit_type: "month",
      total: 1600,
    },
  ],
  price_calculation: {
    subtotal: 12400,
    discount: 400,
    tax_total: 744,
    shipping: 0,
    final_total: 12744,
    client_details: {
      name: sampleClient.name,
      email: sampleClient.email,
      phone_number: sampleClient.phone_number,
    },
  },
}
