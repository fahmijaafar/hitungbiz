# hitungbiz Security Hardening Documentation (Phase 1)

This document provides technical documentation for Phase 1 Foundation Security Hardening implemented in hitungbiz.

---

## Centralized Security Headers

All security headers are managed centrally via FastAPI middleware in `app/core/security_middleware.py`.

### 1. `Strict-Transport-Security` (HSTS)
- **Value**: `max-age=31536000; includeSubDomains` (configurable)
- **Why it exists**: Forces web browsers to interact with the server exclusively via HTTPS connections.
- **Attack Mitigated**: Man-in-the-Middle (MitM) attacks, SSL stripping, cookie hijacking.
- **Browser Compatibility**: Supported in 99%+ of modern browsers (Chrome 4+, Firefox 4+, Safari 7+, Edge 12+).
- **Environment**: Automatically applied when the connection scheme is `https` or when proxied via `X-Forwarded-Proto: https` (or when `SECURE_HSTS_ENABLED=true`). Inactive in local HTTP development to prevent locking out local HTTP development environments.

### 2. `X-Content-Type-Options`
- **Value**: `nosniff`
- **Why it exists**: Instructs the browser to strictly follow the `Content-Type` declared in HTTP responses rather than attempting to MIME-sniff the file payload.
- **Attack Mitigated**: MIME-sniffing attacks, drive-by downloads, XSS via user-uploaded text/image files containing hidden executable code.
- **Browser Compatibility**: Universal support across all modern and legacy browsers (IE 8+, Chrome 1+, Firefox 50+, Safari 4+).
- **Environment**: Applied globally in all environments (local, staging, production).

### 3. `X-Frame-Options`
- **Value**: `DENY` (configurable)
- **Why it exists**: Disallows embedding any page of the web app inside `<frame>`, `<iframe>`, `<embed>`, or `<object>` HTML elements.
- **Attack Mitigated**: Clickjacking attacks, UI redressing, frame-based phishing.
- **Browser Compatibility**: Supported in 99%+ of modern browsers (IE 8+, Chrome 1+, Firefox 2+, Safari 4+).
- **Environment**: Applied globally in all environments.

### 4. `Referrer-Policy`
- **Value**: `strict-origin-when-cross-origin`
- **Why it exists**: Controls how much referrer metadata (the URL of origin page) is sent along with HTTP requests when navigating from the application to external sites or origins.
- **Attack Mitigated**: Information disclosure, sensitive URL parameter leakage (e.g., reset tokens, internal paths).
- **Browser Compatibility**: Supported across all standard browsers (Chrome 61+, Firefox 52+, Safari 11.1+, Edge 79+).
- **Environment**: Applied globally in all environments.

### 5. `Permissions-Policy`
- **Value**: `camera=(), microphone=(), geolocation=(), payment=()`
- **Why it exists**: Restricts access to sensitive browser features, devices, and Web APIs.
- **Attack Mitigated**: Unauthorized access to device camera, microphone, location, or payment APIs via third-party scripts or compromised components.
- **Browser Compatibility**: Chrome 88+, Edge 88+, Safari 11.1+, Firefox 74+.
- **Environment**: Applied globally in all environments.

### 6. `Cross-Origin-Opener-Policy` (COOP)
- **Value**: `same-origin`
- **Why it exists**: Isolates top-level browser contexts from cross-origin popups and windows.
- **Attack Mitigated**: Cross-origin object reference leaks, Specter side-channel attacks, window.opener manipulation.
- **Browser Compatibility**: Chrome 83+, Firefox 79+, Safari 15.2+, Edge 83+.
- **Environment**: Applied globally in all environments.

### 7. `Cross-Origin-Resource-Policy` (CORP)
- **Value**: `cross-origin` (configurable)
- **Why it exists**: Protects resources (such as static user uploads) from cross-origin embedding while allowing designated frontend web apps on separate domains/subdomains to render media elements (`<img>`, `<picture>`).
- **Attack Mitigated**: Cross-Origin Data Leakage (CODL), Speculative Execution Side-Channel attacks (Spectre).
- **Browser Compatibility**: Chrome 73+, Firefox 74+, Safari 12+, Edge 79+.
- **Environment**: Applied globally in all environments.

### 8. `Content-Security-Policy` (CSP)
- **Value**:
  - *Local Dev*: Relaxed policy supporting Vite HMR, WebSockets (`ws:`, `wss:`), eval/inline scripts, and blob URLs.
  - *Production*: Restricted policy requiring HTTPS connections, self-hosted scripts, Tesseract OCR CDN worker access (`https://cdn.jsdelivr.net`, `https://tessdata.projectnaptha.com`), blocking object/embed (`object-src 'none'`), and framing (`frame-ancestors 'none'`).
- **Why it exists**: Restricts the origins from which scripts, styles, workers, images, and fonts can be loaded and executed.
- **Attack Mitigated**: Cross-Site Scripting (XSS), Data Injection, Framing/Clickjacking, Unauthorized Web Worker execution.
- **Browser Compatibility**: Supported in all modern browsers (Chrome 25+, Firefox 23+, Safari 7+, Edge 12+).
- **Environment**: Environment-aware (relaxed in local dev, strict in production/staging).

---

## Server Information Disclosure Mitigation

The `SecurityMiddleware` automatically removes the `Server` header from all HTTP responses (`REMOVE_SERVER_HEADER=True`). This hides framework version details from automated scanners and fingerprinting tools.

---

## Request Body Size Limits

To prevent Denial of Service (DoS) attacks via memory exhaustion, incoming requests are inspected for `Content-Length`. Requests exceeding `MAX_REQUEST_BODY_SIZE` (default: 50MB) are immediately rejected with `413 Payload Too Large` without buffering into memory.

---

## Environment Variables Configuration

| Variable | Type | Default | Description |
|---|---|---|---|
| `SECURITY_HEADERS_ENABLED` | `bool` | `True` | Toggle security header middleware |
| `SECURE_HSTS_ENABLED` | `bool` | `False` | Force HSTS header regardless of scheme |
| `SECURE_HSTS_SECONDS` | `int` | `31536000` | HSTS max-age duration in seconds (1 year) |
| `MAX_REQUEST_BODY_SIZE` | `int` | `52428800` | Maximum request body limit in bytes (50MB) |
| `REMOVE_SERVER_HEADER` | `bool` | `True` | Remove Server header from HTTP responses |
| `CSP_HEADER_OVERRIDE` | `str` | `None` | Custom CSP string override |
