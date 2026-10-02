# hitungbiz Security Incident Response Plan (IRP)

*Effective Date: August 5, 2026*  
*Version: 1.0*

This operational Incident Response Plan (IRP) provides a structured protocol for detecting, containing, investigating, and recovering from potential security incidents affecting the hitungbiz platform.

---

## 1. Incident Severity Classification

| Level | Severity | Examples | Target Response Time | Target Resolution (RTO) |
|---|---|---|---|---|
| **SEV-1** | Critical | Active database breach, unauthorized data exposure, system-wide ransomware, total production outage. | **< 15 Minutes** | **< 2 Hours** |
| **SEV-2** | High | Critical service outage (API down, database failure), authentication bypass attempt, partial tenant data access issue. | **< 30 Minutes** | **< 4 Hours** |
| **SEV-3** | Medium | Isolated rate-limit abuse, third-party AI provider outage, localized non-critical bug affecting single sub-feature. | **< 2 Hours** | **< 24 Hours** |
| **SEV-4** | Low | Low-risk automated vulnerability scanner noise, minor UI cosmetic bug, non-exploitable configuration warning. | **< 24 Hours** | **< 72 Hours** |

---

## 2. Six-Phase Response Workflow

```
[1. Detection & Identification] ➔ [2. Containment] ➔ [3. Investigation & Eradication]
                                                                  │
[6. Post-Mortem & Lessons]    [5. Communication]  [4. Recovery & Verification]
```

### Phase 1: Detection & Identification
- Alerts triggered via Sentry error monitoring, automated health check failures (`/api/v1/utils/health-check/`), or user reports.
- Security team logs initial incident ticket, assigns Severity Level (SEV-1 to SEV-4), and designates an Incident Commander.

### Phase 2: Containment
- **Short-Term Containment**: Block malicious IP addresses at Cloudflare/Nginx level. Revoke compromised JWT token secret keys (`SECRET_KEY`). Terminate active API user sessions.
- **Long-Term Containment**: Isolate compromised container or database instance. Place platform in temporary read-only maintenance mode if required.

### Phase 3: Investigation & Eradication
- Analyze system audit logs, PostgreSQL database query logs, and Sentry stack traces.
- Identify root cause (e.g., credential leak, unpatched dependency, misconfigured proxy header).
- Apply security patches, rotate compromised API keys/passwords, and re-build clean container images.

### Phase 4: Recovery & Verification
- Restore application databases from verified clean backup snapshots if data corruption occurred.
- Execute automated unit test suite (`pytest`) and frontend verification (`bun run build`).
- Gradually restore full API traffic and monitor error telemetry for 2 hours.

### Phase 5: Customer Communication & Notification
- **SEV-1 / SEV-2 Incidents**: Notify impacted company administrators within **24 hours** of incident confirmation.
- Communication details include: Nature of incident, affected data categories, mitigation actions taken, and recommended user actions (e.g., password reset).

### Phase 6: Post-Mortem & Root Cause Analysis (RCA)
- Conduct post-mortem review within **5 business days** of incident resolution.
- Publish internal Incident Report including: Timeline, Root Cause Analysis, Financial Impact, and Remediation Checklist.

---

## 3. Key Contact Escalation Matrix

- **Incident Lead**: Lead Security Engineer (`security@fahmijaafar.com`)
- **Infrastructure Lead**: DevOps / Systems Administrator (`devops@fahmijaafar.com`)
- **Legal & Public Relations**: Compliance Lead (`legal@fahmijaafar.com`)
