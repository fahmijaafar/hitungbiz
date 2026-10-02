# hitungbiz AI Usage & Responsible AI Policy

*Effective Date: August 5, 2026*  
*Version: 1.0*

At **hitungbiz**, we leverage Artificial Intelligence (AI) to empower small and medium-sized businesses with modern, intelligent, and efficient financial workflows. We believe in building AI capabilities that are safe, transparent, private, and accountable. 

This **AI Usage & Responsible AI Policy** outlines how AI is integrated into the hitungbiz platform, what data is processed, the security safeguards in place, and our commitments to privacy and responsible governance.

---

## 1. Purpose of AI

AI capabilities within hitungbiz are designed to serve as an intelligent copilot for bookkeeping, financial analysis, receipt recognition, document processing, and business reporting.

- **Assisting, Not Replacing**: hitungbiz’s AI features are built to assist business owners and managers in making informed decisions by automating repetitive data entry and surfacing structured insights.
- **Human Oversight**: AI outputs are recommendations and automated drafts. They are intended to complement—not replace—human oversight and professional judgment.

---

## 2. Platform AI Features

hitungbiz currently offers the following AI-assisted features:

- **OCR Receipt & Document Parsing**: Automatically extracts structured expense fields (supplier name, date, invoice number, line items, and totals) from scanned receipt images and PDF documents.
- **AI Financial Summaries**: Synthesizes company financial metrics, revenue trends, and operational performance into clear, human-readable executive summaries.
- **Spending & Expense Analysis**: Categorizes historical expenses, detects spending anomalies, and highlights areas for operational optimization.
- **Business Insights & Trend Spotting**: Identifies cash flow patterns, recurring subscription commitments, and client payment behaviors.
- **AI Tax Advisor Insights**: Summarizes tax deductions, tax payment schedules, and regulatory considerations relevant to company financial records.
- **Future AI Roadmap**: Intelligent bank statement reconciliation, predictive cash flow forecasting, and multi-currency automated expense matching.

---

## 3. Data Processed by AI

To fulfill specific user-initiated AI requests, hitungbiz processes only the minimum necessary data relevant to that operation:

- **Uploaded Images & Scans**: Receipt images, invoice documents, and bank statement uploads.
- **OCR Text Payloads**: Extracted text content derived from uploaded financial files.
- **Aggregated Financial Metrics**: Anonymized or aggregated revenue totals, expense totals, transaction counts, and category breakdowns.
- **User Prompts & Queries**: Specific textual questions or analysis requests submitted by authenticated users.

> **Principle of Minimization**: hitungbiz processes only data strictly required to execute the specific requested AI feature. Unrelated personal files or non-financial data are never transmitted to AI models.

---

## 4. Data Privacy & Multi-Tenant Isolation

Your company’s financial privacy is fundamental to our platform architecture.

- **Strict Tenant Isolation**: All AI requests remain isolated strictly to your authenticated company context. Data from one company is never visible to, mixed with, or accessible by another company.
- **No Cross-Customer Data Sharing**: Information submitted by your organization is never shared with other hitungbiz customers.
- **Integrated Security Controls**: AI features operate within hitungbiz’s existing role-based access control (RBAC), token authentication, and encryption protocols.

---

## 5. AI Model Training & Provider Commitments

- **Zero Unconsented Model Training**: Customer financial data processed via hitungbiz’s AI services is **NOT** used to train, retrain, or improve foundational AI models (whether owned by hitungbiz or third-party providers) unless your organization explicitly opts in.
- **Third-Party AI Providers**: When leveraging enterprise LLM API providers (such as DeepSeek), data transmission occurs over encrypted HTTPS connections using stateless API endpoints where zero-data-retention or strict zero-training policies apply.

---

## 6. AI Limitations & User Responsibilities

While hitungbiz’s AI models strive for high precision, AI technology has inherent limitations:

- **Potential for Inaccuracies**: AI models may occasionally misinterpret blurry receipt text, misclassify non-standard invoice terms, or generate incomplete analytical interpretations.
- **Recommendations Only**: All AI outputs—including parsed receipt fields, category assignments, and financial summary recommendations—must be treated as suggested drafts.
- **User Review Mandate**: Users remain responsible for reviewing, verifying, and approving all AI-generated fields before saving records to official accounting ledgers or submitting tax returns.

---

## 7. Professional Advice Disclaimer

> **IMPORTANT DISCLAIMER**:  
> AI-generated insights, tax summaries, financial reports, and expense classifications produced by hitungbiz are provided for **informational and organizational purposes only**.  
>  
> hitungbiz AI does **NOT** provide certified legal advice, accounting advice, tax filing advice, or regulated financial advice. hitungbiz is not a substitute for a Certified Public Accountant (CPA), registered tax advisor, or legal counsel. Always consult a qualified professional for official accounting, tax, or legal filings.

---

## 8. Responsible & Acceptable Use

Users must interact with hitungbiz’s AI capabilities in a responsible manner.

### Acceptable Use:
- Legitimate business bookkeeping and receipt digitizing.
- Company financial analysis and budgeting.
- Internal expense tracking and invoice processing.

### Prohibited Use:
- Submitting malicious prompts or jailbreak attempts designed to manipulate AI behavior.
- Reverse-engineering internal system prompts or security controls.
- Attempting to access or infer another company’s financial information.
- Using AI features for fraudulent financial reporting, money laundering, or illegal activities.

---

## 9. Technical AI Security Safeguards

hitungbiz enforces a comprehensive, defense-in-depth security framework around all AI services:

- **Prompt Injection Protection**: Real-time regex pattern detection blocks attempts to override system prompts or bypass application constraints.
- **Input Validation**: Enforces 10,000-character prompt limits, UTF-8 validation, and JSON depth checks (<=10 levels).
- **Output Sanitization**: Model responses are inspected for UTF-8 integrity and JSON validity. Secret keys or internal paths are automatically redacted (`[REDACTED_SECRET]`).
- **Rate Limiting & Concurrency Control**: Tier 4 rate limits (30 req/hr per user, 300 req/day per company) and a maximum limit of 2 active concurrent AI requests per user prevent denial-of-service or resource exhaustion.
- **Timeout Management**: Configurable 60-second timeouts safely cancel stalled model requests.
- **Audit Logging**: Privacy-preserving audit logs track user ID, company ID, endpoint, duration, model, and token usage without storing sensitive prompt text or raw financial numbers.

---

## 10. Service Availability & Performance

- **Operational Availability**: AI features depend on underlying cloud infrastructure and provider APIs, which may experience temporary maintenance or regional outages.
- **Model Evolution**: As foundational models evolve, hitungbiz may update model versions or parameters to improve accuracy, speed, and safety.
- **Graceful Fallbacks**: In the event of an AI service interruption, hitungbiz provides clear application status messages without crashing or exposing raw stack traces.

---

## 11. Transparency & Distinguishability

- **Clear Interface Indicators**: hitungbiz explicitly notifies users whenever content, category suggestions, or summaries are generated by AI.
- **Distinguishable Data Entry**: AI-suggested receipt fields require explicit user confirmation before becoming permanent accounting entries.
- **Policy Updates**: As regulations (such as the EU AI Act) and technical standards evolve, hitungbiz will update this policy to reflect new governance capabilities.

---

## 12. Future Governance Roadmap

hitungbiz is committed to continuously advancing AI transparency and governance. Our future roadmap includes:

- **AI Confidence Indicators**: Displaying probability confidence scores (e.g., 98% confidence) for OCR text parsing.
- **AI Explainability**: Providing breakdown explanations of how specific financial recommendations were derived.
- **Immutable AI Audit Logs**: Giving company administrators visibility into which team members executed AI actions and when.
- **Granular Organization Preferences**: Enabling administrators to toggle specific AI features or opt into custom data policies.
- **Model Version History**: Publishing model version release notes for institutional audit compliance.

---

## 13. Contact & Questions

If you have questions regarding this AI Usage Policy or hitungbiz’s security practices, please contact our compliance and security team at **security@fahmijaafar.com**.
