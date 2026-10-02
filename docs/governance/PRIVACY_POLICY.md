# hitungbiz Privacy Policy

*Effective Date: August 5, 2026*  
*Version: 1.0*

Welcome to **hitungbiz** ("hitungbiz", "we", "us", or "our"). We are committed to protecting the privacy, confidentiality, and security of personal data collected through our accounting and bookkeeping Software-as-a-Service (SaaS) platform (the "Platform").

This Privacy Policy explains what personal and financial data we collect, why we collect it, how it is processed and stored, your privacy rights, and our data security practices.

---

## 1. Information We Collect

We collect information necessary to deliver accounting, document management, and reporting services:

### A. Account & Registration Data
- User full names, email addresses, password hashes (Argon2/bcrypt), phone numbers, and profile settings.
- Organization details: Company name, business registration number, tax ID, business address, currency preferences, and fiscal year configuration.

### B. Financial & Bookkeeping Records
- Sales invoices, purchase receipts, vendor details, customer lists, item catalogs, and bank account transaction histories.
- Scanned receipt images, PDF invoice uploads, and imported CSV transaction logs.

### C. Technical & System Logs
- Client IP addresses, browser user-agent strings, system diagnostic logs, audit trial entries (module, action, timestamp, user ID), and performance metrics.

### D. AI & Processing Inputs
- User-submitted queries, OCR-extracted receipt text, and aggregated financial summary parameters.

---

## 2. Why We Collect Information

We process personal and organizational data for the following lawful purposes:
- **Service Provision**: To operate the hitungbiz platform, generate financial reports, calculate tax obligations, and process invoices.
- **AI-Assisted Processing**: To parse scanned receipt images, detect anomalies, generate executive financial summaries, and suggest expense categories.
- **Account Verification & Communication**: To deliver password reset emails, account verification links, system notifications, and security alerts via transactional email services (e.g., Brevo).
- **Platform Hardening & Security**: To audit system activity, enforce rate limits, detect unauthorized access attempts, and prevent fraudulent transactions.
- **Compliance & Legal Obligations**: To maintain accurate tax and accounting records as mandated by applicable financial regulations.

---

## 3. How Information Is Stored & Secured

- **Storage Architecture**: Data is stored in secure PostgreSQL relational databases and isolated file storage volumes.
- **Data Encryption**: Data in transit is protected using TLS 1.3 encryption. Data at rest is encrypted using industry-standard AES-256 storage encryption.
- **Multi-Tenant Isolation**: Tenant database records are partitioned and strictly scoped to your organization's unique company ID.

---

## 4. Artificial Intelligence (AI) Processing

- **Third-Party AI Models**: hitungbiz integrates enterprise LLM provider APIs (such as DeepSeek) for receipt OCR parsing and financial summary generation.
- **Privacy Controls**: Only extracted, minimal text parameters are transmitted to AI provider APIs over HTTPS.
- **No Unconsented Model Training**: Customer financial data is **NOT** used to train AI models unless explicit consent is provided.

---

## 5. Analytics & Monitoring

- **Error Monitoring**: We utilize Sentry for real-time error tracking and performance monitoring. Sentry logs omit sensitive customer passwords, financial ledgers, and API keys.
- **No Third-Party Advertising Trackers**: hitungbiz does not sell, rent, or trade customer data to third-party ad networks or data brokers.

---

## 6. Cookie Policy & Local Storage

hitungbiz uses minimal, essential cookies and browser local storage:
- **`sidebar_state`**: A preference cookie storing user interface sidebar toggle states (`SameSite=Lax`, `Secure`).
- **Authorization Tokens**: JWT Bearer tokens passed via standard HTTP headers for session authentication.
- Detailed information is available in our [Cookie Policy](COOKIE_POLICY.md).

---

## 7. Third-Party Service Providers

We engage vetted third-party infrastructure sub-processors:
- **Brevo (formerly Sendinblue)**: Transactional email delivery.
- **DeepSeek**: Enterprise AI processing API.
- **Sentry**: Application error logging and performance telemetry.
- **Cloudflare / Traefik**: Edge proxying, DDoS mitigation, and TLS termination.

---

## 8. Data Security Safeguards

We implement defense-in-depth security controls:
- **HTTP Security Headers**: HSTS, CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP, and CORP.
- **Rate Limiting & DoS Protection**: Tiered rate limits on public, authenticated, upload, and AI endpoints.
- **Input & Upload Sanitization**: Automated EXIF metadata stripping, SVG script sanitization, PDF encryption checks, and CSV injection formula escaping.

---

## 9. Your Data Rights

Subject to local laws (such as Malaysia PDPA or GDPR), you have the right to:
- **Access & Inspect**: Request a copy of your personal data stored within hitungbiz.
- **Rectification**: Correct inaccurate user profile or company information via account settings.
- **Data Portability**: Export your transaction ledgers, clients, and products in CSV format.
- **Deletion (Right-to-be-Forgotten)**: Request account or company deletion in accordance with our [Data Deletion Policy](DATA_DELETION_POLICY.md).

---

## 10. Future Updates

We may update this Privacy Policy periodically to reflect technological changes, regulatory requirements, or platform updates. Material changes will be communicated via email or dashboard notifications.

---

## 11. Contact Information

For privacy inquiries, data access requests, or security concerns, contact our Data Protection Officer:

**hitungbiz Privacy & Compliance Team**  
Email: `privacy@fahmijaafar.com` / `security@fahmijaafar.com`
