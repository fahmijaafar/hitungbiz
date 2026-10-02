# hitungbiz Data Retention Policy

*Effective Date: August 5, 2026*  
*Version: 1.0*

This Data Retention Policy establishes standard data lifecycle guidelines for information stored within the hitungbiz platform. It balances regulatory accounting requirements with data minimization principles.

---

## 1. Data Classification Stages

Data within hitungbiz moves through four distinct lifecycle stages:

1. **Active Data**: Data actively queried and updated by active users during daily operations.
2. **Archived Data**: Historical records maintained for financial, audit, or tax compliance purposes.
3. **Soft-Deleted Data**: Records marked as deleted by users (`is_deleted=True` or `disabled=True`) retaining temporary recovery capability.
4. **Permanent Purged Data**: Records permanently destroyed from database volumes and backup lifecycles.

---

## 2. Retention Schedules

| Data Category | Active Retention | Archive Period | Permanent Deletion Trigger |
|---|---|---|---|
| **User Profiles** | Active account duration | 90 Days post-closure | Hard purge after 90 days of account cancellation. |
| **Company Ledgers & Invoices** | Active subscription | 7 Years (Tax Compliance) | Permanent purge 7 years post-company closure unless legally held. |
| **Purchase & Sales Records** | Active subscription | 7 Years (Tax Compliance) | Permanent purge 7 years post-record date. |
| **Scanned Receipt Uploads** | Active subscription | 7 Years | Permanent purge 7 years post-upload. |
| **OCR Extracted Text** | Active subscription | 1 Year | Purged 1 year after receipt process completion. |
| **CSV Transaction Imports** | Active subscription | 90 Days (Raw import logs) | Raw CSV files purged 90 days after successful import. |
| **System Audit Logs** | 1 Year online query | 3 Years compressed storage | Hard purge after 3 years. |
| **AI Request Audit Logs** | 90 Days online query | 1 Year aggregated metrics | Hard purge raw log entries after 1 year. |
| **Database Backups** | 30 Days rolling daily | 12 Months monthly snapshots | Daily backups purged after 30 days; monthly after 1 year. |
| **Deleted Accounts** | 30 Days grace period | 60 Days quarantine | Hard purge 90 days total post-deletion request. |

---

## 3. Storage Minimization & Automated Lifecycles

- **Raw Upload Files**: Temporary process files and raw CSV import uploads are automatically purged from volume mounts after ingestion to preserve storage and reduce exposure.
- **Audit Logs**: Audit logs are retained for 3 years to comply with financial transparency standards.

---

## 4. Policy Governance

This policy is reviewed annually by hitungbiz’s security and legal compliance officers.
