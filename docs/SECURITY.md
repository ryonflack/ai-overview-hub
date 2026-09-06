# Security

Use a proven Cloudflare-compatible auth provider with verified email, short-lived secure HttpOnly SameSite cookies, CSRF protection, and account-scoped authorization. Turnstile protects registration, login, recovery, checkout, and sensitive public forms. WAF/rate limits supplement account quotas. Export access always checks ownership.

Aikido covers SAST, SCA, secrets, malicious packages, DAST/API and attack-surface monitoring; Sentry covers runtime failures. Telemetry is scrubbed. CI blocks on tests, lint, types, high-severity dependency findings, and configured Aikido findings. Counsel must review all policy placeholders. The pre-launch review must also validate auth bypass, quota races, webhook replay, tenant isolation, upload limits, headers, and production secret storage.
