# Providers

Each SerpApi engine implements `AIVisibilityProvider`. It runs a query and converts provider-specific answer/reference paths into `NormalizedAIResult`. Google AI Overview follows a returned short-lived page token immediately. Raw payloads remain intact for schema evolution. HTTP 429 and 5xx responses are categorized for bounded retry; malformed responses normalize to an answer-free result rather than exposing internals. Mock adapters exercise the complete local workflow.
