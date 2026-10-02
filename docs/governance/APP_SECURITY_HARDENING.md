# hitungbiz Application Security Hardening Documentation (Phase 2)

This document provides comprehensive technical documentation for **Phase 2 (Application Security)** hardening implemented across the hitungbiz backend.

---

## 1. Centralized Upload Profiles (`upload_security.py`)

All upload endpoints utilize reusable, centralized validation profiles instead of inline validation logic.

### Profile 1: `LOGO_UPLOAD`
- **Max File Size**: 5 MB (`MAX_LOGO_SIZE`)
- **Allowed MIME Types**: `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml`
- **Validation Controls**:
  - Empty / zero-byte file rejection.
  - Image decoding via Pillow to verify dimensions (`width > 0`, `height > 0`).
  - Automatic EXIF metadata stripping.
  - Safe SVG XML structure parsing and embedded script tag / inline JavaScript handler rejection.
  - Random UUID filename generation (`uuid.uuid4().hex`), ignoring original client filenames.

### Profile 2: `OCR_RECEIPT_UPLOAD`
- **Max File Size**: 15 MB (`MAX_OCR_SIZE`)
- **Allowed MIME Types**: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`
- **Validation Controls**:
  - PDF magic header verification (`%PDF-`).
  - Password protection / encryption check (rejects `/Encrypt` dictionary payloads).
  - Configurable page limit enforcement (`MAX_PDF_PAGES`, default 10 pages).
  - Extensible antivirus hook (`run_antivirus_scan()`).
  - Random UUID filename generation.

### Profile 3: `CSV_IMPORT_UPLOAD`
- **Max File Size**: 10 MB (`MAX_CSV_SIZE`)
- **Allowed MIME Types**: `text/csv`, `application/vnd.ms-excel`, `text/plain`, `application/csv`
- **Validation Controls**:
  - Mandatory UTF-8 encoding check (automatic BOM stripping).
  - Automatic delimiter detection (`,` `;` `\t`).
  - Configurable maximum row limit (`MAX_CSV_ROWS`, default 10,000) and column limit (`MAX_CSV_COLS`, default 100).
  - CSV Injection protection: automatically escapes formula injection prefixes (`=`, `+`, `-`, `@`, `\t`, `\r`) with a leading single quote (`'`).

---

## 2. API Rate Limiting Tiers (`rate_limiter.py`)

Implemented via a thread-safe sliding window algorithm (`InMemoryRateLimiter`).

| Tier | Category | Endpoints | Threshold |
|---|---|---|---|
| **Tier 1** | Public | Login, Register, Password Recovery | `10 req/min/IP`. Login failure tracking (5 attempts trigger temporary 5-min throttle). |
| **Tier 2** | Authenticated | Dashboard, Products, Clients, Documents, Purchases | `120 req/min/user` (Burst limit: `30 req/10s`). |
| **Tier 3** | Uploads | Logo upload, Receipt OCR, CSV import | `20 uploads/hr/user`. Daily per-company limits: Logo (10/day), CSV (30/day), OCR (300/day). |
| **Tier 4** | AI Services | OCR Parsing, Financial Summaries, Tax Advisor | `30 req/hr/user`, `300 req/day/company`. Concurrent active limit: `Max 2 active requests per user`. |

---

## 3. Input Validation & Content-Type Enforcement (`input_validation.py`)

- **Content-Type Validation**: Middleware returns `HTTP 415 Unsupported Media Type` if requests with non-empty payloads specify unsupported Content-Types (e.g. `application/xml` or `text/html`).
- **String Sanitization**: Normalizes user input strings to Unicode NFKC standard and trims leading/trailing whitespace.

---

## 4. AI Request Protections & Audit Logging (`ai_logger.py`)

- **Prompt Protection**: Rejects prompts exceeding 10,000 characters (`MAX_AI_PROMPT_LENGTH`), empty prompts, and deeply nested JSON structures (>10 levels).
- **Privacy-Preserving Audit Logging**: Logs User ID, Company ID, Endpoint, Timestamp, Duration, Model, Success/Failure status, and Token Usage while redacting prompt text and raw company financial data (unless explicitly enabled via `AI_LOG_PROMPTS_ENABLED`).

---

## 5. Environment Variables Added

| Variable | Type | Default | Description |
|---|---|---|---|
| `RATE_LIMIT_ENABLED` | `bool` | `True` | Global rate limiting toggle |
| `RATE_LIMIT_TIER1_IP_PER_MIN` | `int` | `10` | Tier 1 public endpoint limit per IP |
| `RATE_LIMIT_TIER2_USER_PER_MIN` | `int` | `120` | Tier 2 authenticated endpoint limit per user |
| `RATE_LIMIT_TIER3_UPLOAD_PER_HR` | `int` | `20` | Tier 3 upload endpoint limit per user |
| `RATE_LIMIT_TIER4_AI_PER_HR` | `int` | `30` | Tier 4 AI endpoint limit per user |
| `MAX_CONCURRENT_AI_REQUESTS` | `int` | `2` | Maximum active concurrent AI requests per user |
| `MAX_LOGO_SIZE` | `int` | `5242880` | Logo upload profile limit in bytes (5MB) |
| `MAX_OCR_SIZE` | `int` | `15728640` | OCR upload profile limit in bytes (15MB) |
| `MAX_CSV_SIZE` | `int` | `10485760` | CSV import profile limit in bytes (10MB) |
| `MAX_CSV_ROWS` | `int` | `10000` | Maximum CSV rows allowed |
| `MAX_CSV_COLS` | `int` | `100` | Maximum CSV columns allowed |
| `MAX_PDF_PAGES` | `int` | `10` | Maximum PDF pages for OCR upload |
| `MAX_AI_PROMPT_LENGTH` | `int` | `10000` | Maximum character length for AI prompts |
| `AI_LOG_PROMPTS_ENABLED` | `bool` | `False` | Toggle logging raw prompt bodies |
