# hitungbiz Backup & Disaster Recovery (DR) Guide

*Effective Date: August 5, 2026*  
*Version: 1.0*

This document establishes operational procedures for database backups, static storage recovery, and disaster recovery scenarios for the hitungbiz SaaS platform.

---

## 1. Recovery Objectives

- **Recovery Point Objective (RPO)**: **< 1 Hour** (Maximum allowable data loss in catastrophic scenario).
- **Recovery Time Objective (RTO)**: **< 2 Hours** (Maximum allowable application downtime).

---

## 2. Backup Schedule & Strategy

| Component | Backup Type | Frequency | Retention Schedule | Encryption |
|---|---|---|---|---|
| **PostgreSQL Database** | Automated WAL Archiving & Daily Dumps | Hourly WAL logs + Daily full dump | Daily backups: 30 days. Monthly snapshots: 12 months. | AES-256 |
| **Storage Volumes (`/app/uploads`)** | File Volume Mirroring / Object Snapshots | Daily incremental snapshot | Rolling 30 days | AES-256 |
| **Configuration (`.env` & compose files)** | Encrypted Vault Backup | On every deployment change | Version controlled in private vault | Encrypted |

---

## 3. Restore Verification & Testing

- **Quarterly Automated Restore Drills**: Backups are automatically restored into an isolated staging environment once every 3 months.
- **Verification Criteria**: Database integrity checks (`pg_restore`), table count comparison, and execution of backend automated test suites (`pytest`).

---

## 4. Disaster Recovery Scenarios & Playbooks

### Scenario A: PostgreSQL Database Corruption / Failure
1. Spin up a new PostgreSQL container/instance.
2. Restore the latest daily full database backup dump.
3. Apply WAL transaction logs up to the timestamp immediately prior to corruption.
4. Execute `pytest` health checks to confirm data integrity.
5. Point backend connection URI (`POSTGRES_SERVER`) to new database instance.

### Scenario B: Storage Volume Loss (`/app/uploads`)
1. Provision clean storage volume mounted at `/app/uploads`.
2. Restore latest static file volume snapshot.
3. Verify file permission masks (`chmod 755`).

### Scenario C: Cloud Provider / Host Outage
1. Provision secondary cloud infrastructure host using Docker Compose (`compose.yml`).
2. Restore PostgreSQL database and storage volume snapshots from off-site storage.
3. Update DNS A-records at Cloudflare to point domain traffic to new host IP.

### Scenario D: Third-Party AI Provider Outage (DeepSeek)
1. Platform automatically enters graceful fallback mode.
2. Non-AI bookkeeping, invoicing, sales, purchase, and manual bank reconciliation endpoints continue operating without interruption.
3. Users receive safe 503 status messages indicating temporary AI unavailability.

### Scenario E: Ransomware or Server Compromise
1. Immediately isolate and sever all network connectivity to compromised host.
2. Provision completely fresh infrastructure from verified Docker images.
3. Restore database and file storage from off-site, immutable read-only backup snapshots taken prior to intrusion.
4. Rotate all application secrets (`SECRET_KEY`, `POSTGRES_PASSWORD`, `DEEPSEEK_API_KEY`).

---

## 5. Service Restoration Order

```
[1. Network & DNS] ➔ [2. Database (PostgreSQL)] ➔ [3. Prestart Script (Migrations)]
                                                                  │
[6. AI Services]    [5. Frontend (Nginx)]        [4. Backend (FastAPI)]
```
