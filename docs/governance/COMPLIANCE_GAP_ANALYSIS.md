# hitungbiz Compliance Gap Analysis & Future Roadmap

*Effective Date: August 5, 2026*  
*Version: 1.0*

This document provides a technical compliance gap analysis of the current hitungbiz codebase and outlines a technical roadmap for future compliance features.

---

## 1. Technical Compliance Strengths

hitungbiz has established strong technical security and privacy foundations:
- **Centralized Security Headers (Phase 1)**: Full HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP, and CORP implementations.
- **Centralized Upload Security Profiles (Phase 2)**: Reusable profile-based validation (`LOGO_UPLOAD`, `OCR_RECEIPT_UPLOAD`, `CSV_IMPORT_UPLOAD`), EXIF stripping, SVG sanitization, PDF encryption checks, and CSV injection formula escaping.
- **Tiered API Rate Limiting (Phase 2)**: IP, user, company, and concurrency controls across public, authenticated, upload, and AI endpoints.
- **AI Security & Safety (Phase 8)**: Regex-based prompt injection detection, prompt length bounds, JSON nesting limits, output secret redaction, 60s timeouts, and privacy-preserving audit logs.
- **Data Minimization & Multi-Tenant Isolation**: Database records strictly partitioned by company ID; upload process files purged post-ingestion.

---

## 2. Identified Compliance Gaps & Mitigations

| Area | Current Gap | Mitigation / Workaround | Recommended Resolution |
|---|---|---|---|
| **Cookie Consent** | Essential cookie (`sidebar_state`) set without explicit consent banner. | Documented in Cookie Policy as essential UI preference. | Implement interactive cookie consent banner for optional cookies. |
| **Data Export Tooling** | Data export currently handled via endpoint CSV downloads. | Manual export available per module. | Add automated "Export Full Account Archive (ZIP/JSON)" tool. |
| **Right-to-be-Forgotten** | User deletion currently handled via manual support requests. | Manual DB anonymization procedure. | Build automated "Request Account Erasure" self-service workflow. |
| **Legal Consent History** | Terms acceptance recorded upon signup without explicit version tracking table. | Account creation date serves as acceptance proof. | Create `UserConsentHistory` database table tracking consent timestamps and policy version IDs. |
| **ClamAV Antivirus Scanning** | Antivirus hook (`run_antivirus_scan`) operates as a software stub. | File extensions, MIME types, and header signatures validated. | Connect hook to a dedicated ClamAV daemon container service. |

---

## 3. Future Compliance Feature Roadmap

### Phase 10: Consent Management & Cookie Banner
- Build an interactive, GDPR/PDPA compliant Cookie Banner for the frontend (`frontend/src/components/Common/CookieConsentBanner.tsx`).
- Support granular preference controls (Essential, Analytics, Functional).

### Phase 11: Legal Terms Version Tracking
- Create `user_consent_logs` table storing `(user_id, policy_type, version_string, accepted_at, ip_address)`.
- Require users to re-verify acceptance when major Privacy Policy or Terms of Service updates occur.

### Phase 12: Automated Data Export & Erasure Self-Service
- Implement a single-click "Download My Data" feature generating a secure encrypted ZIP containing JSON/CSV dumps of all user transactions.
- Implement an automated self-service account deletion workflow with a 30-day soft-delete holding queue.
