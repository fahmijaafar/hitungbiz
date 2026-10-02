# hitungbiz Data Deletion Policy

*Effective Date: August 5, 2026*  
*Version: 1.0*

This Data Deletion Policy defines procedures for deleting user accounts, company data, system logs, and backups upon user request or account termination.

---

## 1. Deletion Mechanisms

hitungbiz employs two deletion mechanisms:

### A. Soft Delete
- **Behavior**: Records are flagged as inactive (`is_active=False`) or archived. Records are hidden from UI and normal API endpoints but retained temporarily for administrative recovery or audit verification.
- **Grace Period**: Soft-deleted data can be restored by company administrators within **30 days**.

### B. Permanent Hard Purge
- **Behavior**: Database rows are permanently erased via `DELETE` SQL statements, and associated static file uploads (receipt scans, logos) are deleted from disk volumes.
- **Irreversibility**: Once hard purged, data cannot be recovered by users or customer support.

---

## 2. User Account Deletion Workflow

1. **Deletion Request**: User initiates account deletion via account settings or email to `privacy@fahmijaafar.com`.
2. **Identity Verification**: Multi-factor or email confirmation is required.
3. **Soft-Delete Stage (Days 1–30)**: Account access is disabled. User profile is hidden.
4. **Hard Purge (Day 90)**: Personal identifiers (name, email hash, password) are permanently purged from database tables, except where transaction logs must be retained for statutory tax compliance.

---

## 3. Company Data Deletion Workflow

1. **Company Closure Request**: Initiated exclusively by the primary Company Superuser/Owner.
2. **30-Day Recovery Hold**: All company user accounts are deactivated. Database records enter a 30-day grace period.
3. **Permanent Volume Scrub (Day 60)**: Storage volumes `/app/uploads` associated with company receipt scans and logos are scrubbed. Database tables are purged.

---

## 4. System Logs & Backup Purging

- **AI Audit Logs**: AI usage logs are purged on a 1-year rolling cycle.
- **System Audit Logs**: Audit trail entries are retained for 3 years to fulfill statutory accounting standards.
- **Database Backups**: Backup snapshots expire automatically on a rolling 30-day schedule. Within 30 days of a hard database purge, all historical backup copies naturally cycle out.

---

## 5. Right-to-be-Forgotten (RTBF) Compliance Workflow

For regulatory erasure requests under GDPR or PDPA:
- Personal data in active database tables is erased or anonymized (e.g., `user_deleted_1234@anonymized.local`).
- Tax-mandated invoice records are retained with anonymized customer identities to preserve statutory accounting integrity.
