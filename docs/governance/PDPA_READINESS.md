# hitungbiz Malaysia PDPA Readiness Assessment

*Effective Date: August 5, 2026*  
*Status: Architecture Readiness Review (Not Certified)*

This document presents a readiness review of the hitungbiz SaaS platform against the **Malaysia Personal Data Protection Act 2010 (PDPA)** principles.

---

## 1. Principle Alignment

### A. General Principle (Consent & Notice)
- **Status**: Ready.
- **Implementation**: hitungbiz collects personal data (name, email, financial records) only upon explicit user registration. Clear Privacy Policy notices explain collection purposes.

### B. Notice and Choice Principle
- **Status**: Ready.
- **Implementation**: Users receive clear notice regarding third-party service providers (Brevo for email, Sentry for error tracking, DeepSeek for AI features) and can manage communication settings.

### C. Disclosure Principle
- **Status**: Fully Implemented.
- **Implementation**: Customer data is strictly segregated per company ID. hitungbiz does not disclose customer data to external third parties for marketing purposes.

### D. Security Principle
- **Status**: Fully Implemented.
- **Implementation**: Multi-tenant database isolation, TLS 1.3 in-transit encryption, AES-256 at-rest storage encryption, HSTS/CSP security headers, EXIF metadata stripping, and tiered rate limiting.

### E. Retention Principle
- **Status**: Fully Implemented.
- **Implementation**: Standardized [Data Retention Policy](DATA_RETENTION_POLICY.md) ensures user and temporary file uploads are purged when no longer required.

### F. Data Integrity Principle
- **Status**: Fully Implemented.
- **Implementation**: Database schema enforcement, Pydantic type validation, Unicode NFKC text normalization, and mandatory database constraints ensure data accuracy.

### G. Access Principle
- **Status**: Fully Implemented.
- **Implementation**: Users can access and update their profile data, view company members, and export transaction data via CSV endpoints.

---

## 2. Cross-Border Data Transfer Considerations

- PDPA restricts cross-border data transfer unless the destination jurisdiction provides equivalent data protection or user consent is obtained.
- **Infrastructure Topology**: Primary application servers and PostgreSQL databases reside in secure data centers. Third-party API calls (AI & Email) are transmitted over TLS-encrypted channels under strict data processing agreements.

---

## 3. Disclaimers

> **DISCLAIMER**: This document assesses architecture readiness only and does not constitute formal legal certification under Malaysia PDPA.
