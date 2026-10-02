# hitungbiz GDPR Readiness Assessment

*Effective Date: August 5, 2026*  
*Status: Technical Architecture Readiness Review (Not Certified)*

This document evaluates the hitungbiz backend and frontend architecture against the requirements of the **EU General Data Protection Regulation (GDPR)**.

---

## 1. Data Subject Rights Mapping

| GDPR Right | Architecture Support | Status |
|---|---|---|
| **Right of Access (Art. 15)** | Users can view all personal details and financial records via API endpoints and dashboard UI. | Fully Ready |
| **Right to Rectification (Art. 16)** | Profile and company records can be edited dynamically in application settings. | Fully Ready |
| **Right to Erasure / Right-to-be-Forgotten (Art. 17)** | User deletion workflow purges personal data while preserving statutory tax compliance ledgers. | Fully Ready |
| **Right to Restrict Processing (Art. 18)** | Accounts can be disabled (`is_active=False`), halting data processing. | Fully Ready |
| **Right to Data Portability (Art. 20)** | Financial transaction records, clients, and products can be exported in standardized CSV format. | Fully Ready |
| **Right to Object (Art. 21)** | Users may object to optional email communications or AI features. | Fully Ready |

---

## 2. Technical Accountability & Privacy by Design

- **Data Minimization (Art. 5(1)(c))**: AI processing transmits only minimal extracted text fields; raw upload process files are automatically purged after ingestion.
- **Purpose Limitation (Art. 5(1)(b))**: Financial records are processed exclusively for bookkeeping, invoice generation, tax reporting, and platform security.
- **Storage Limitation (Art. 5(1)(e))**: Enforced via automated data retention and rolling 30-day backup expiration schedules.
- **Integrity & Confidentiality (Art. 32)**: Enforced via TLS 1.3 in-transit, AES-256 at-rest encryption, HSTS, CSP headers, rate limiting, and tenant database isolation.

---

## 3. Disclaimers

> **DISCLAIMER**: This document represents a technical assessment of system architecture readiness and does not constitute formal GDPR compliance certification.
