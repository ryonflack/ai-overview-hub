-- Collection methods (Direct API vs user-simulated), per-project location, and add-on pricing.
-- A run job is now one query on one source (engine + method), so the job and usage uniqueness keys include the method.
ALTER TABLE projects ADD COLUMN source_methods TEXT NOT NULL DEFAULT '{}';
ALTER TABLE projects ADD COLUMN location TEXT NOT NULL DEFAULT '{"country":"US","language":"en"}';
-- Price per additional collection method per query, in cents. NULL until add-on pricing is decided.
ALTER TABLE plans ADD COLUMN addon_unit_price INTEGER;

-- Existing rows: ChatGPT and Perplexity were API-only, the SerpApi engines were simulated.
ALTER TABLE run_queries ADD COLUMN method TEXT;
ALTER TABLE run_queries ADD COLUMN location TEXT;
UPDATE run_queries SET method=CASE WHEN provider_id IN ('perplexity','chatgpt') THEN 'api' ELSE 'simulated' END;
ALTER TABLE run_queries ALTER COLUMN method SET NOT NULL;
ALTER TABLE run_queries ADD CONSTRAINT run_queries_method_check CHECK(method IN ('api','simulated'));
ALTER TABLE run_queries DROP CONSTRAINT run_queries_run_id_query_id_provider_id_key;
ALTER TABLE run_queries ADD CONSTRAINT run_queries_run_id_query_id_provider_id_method_key UNIQUE(run_id,query_id,provider_id,method);

ALTER TABLE usage_events ADD COLUMN method TEXT;
ALTER TABLE usage_events ADD COLUMN addon INTEGER NOT NULL DEFAULT 0;
UPDATE usage_events SET method=CASE WHEN provider IN ('perplexity','chatgpt') THEN 'api' ELSE 'simulated' END;
ALTER TABLE usage_events ALTER COLUMN method SET NOT NULL;
ALTER TABLE usage_events ADD CONSTRAINT usage_events_method_check CHECK(method IN ('api','simulated'));
ALTER TABLE usage_events DROP CONSTRAINT usage_events_run_id_query_id_provider_key;
ALTER TABLE usage_events ADD CONSTRAINT usage_events_run_id_query_id_provider_method_key UNIQUE(run_id,query_id,provider,method);
CREATE INDEX usage_events_addon_idx ON usage_events(account_id,period_start,addon);
