# hitungbiz Cookie Policy

*Effective Date: August 5, 2026*  
*Version: 1.0*

This Cookie Policy explains how **hitungbiz** uses cookies and local browser storage technologies to recognize you when you visit our web application.

---

## 1. What Are Cookies?

Cookies are small text files placed on your computer or mobile device when you visit a website. They are widely used to make web applications work efficiently, provide personalized UI settings, and enhance security.

---

## 2. Inventory of Current Cookies & Storage

hitungbiz adheres to a strict data minimization policy. We use only essential and functional storage mechanisms:

### A. Essential Preference Cookies

| Cookie Name | Purpose | Expiration | Security Flags |
|---|---|---|---|
| `sidebar_state` | Stores user interface navigation sidebar collapse/expand toggle preference. | 7 Days | `SameSite=Lax`, `Path=/`, `Secure` (over HTTPS) |

### B. Authentication Tokens (Session Storage)

| Identifier | Purpose | Storage Type | Expiration |
|---|---|---|---|
| `Authorization` | JSON Web Token (JWT) Bearer token containing user ID for API request authentication. | HTTP Header / LocalStorage | 8 Days (60 mins x 24 hrs x 8 days) |

---

## 3. Analytics & Planned Future Cookies

- **Error Telemetry**: Sentry SDK operates in memory for runtime error tracking and does not set persistent third-party advertising cookies.
- **Future Analytics (Planned)**: hitungbiz may implement privacy-friendly, first-party analytics (e.g., Plausible or Matomo) in future releases to measure feature usage without cross-site tracking.
- **No Advertising Cookies**: hitungbiz does **NOT** use third-party marketing, targeting, or advertising tracking cookies.

---

## 4. How to Manage Cookies

You can control and manage cookies through your web browser settings:
- **Browser Settings**: Most browsers allow you to block, delete, or receive warnings before cookies are set.
- **Impact of Disabling**: Disabling `sidebar_state` will cause the navigation sidebar state to reset to its default view upon page reload. Disabling local storage authentication will prevent you from staying signed in.

---

## 5. Contact Us

If you have questions about our use of cookies, contact us at `privacy@fahmijaafar.com`.
