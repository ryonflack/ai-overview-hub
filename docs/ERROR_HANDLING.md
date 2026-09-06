# Error handling

Public errors use `{success:false,error:{code,message,requestId}}`. They never include stack traces, keys, SQL, or infrastructure detail. Correlation IDs flow through HTTP, run, queue, provider, export, and audit records. Validation is permanent; timeouts, network failures, 429, 502, 503, and 504 are retryable with bounded exponential backoff. Partial provider success remains useful. Exhausted jobs retain attempts, timestamps, category, customer/project/query/provider, and request ID for an audited administrator retry.
