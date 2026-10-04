-- Collection methods (Direct API vs user-simulated), per-project location, and add-on pricing.
-- A run job is now one query on one source (engine + method), so the job and usage uniqueness keys include the method.
PRAGMA defer_foreign_keys = ON;

ALTER TABLE projects ADD COLUMN source_methods TEXT NOT NULL DEFAULT '{}';
ALTER TABLE projects ADD COLUMN location TEXT NOT NULL DEFAULT '{"country":"US","language":"en"}';
-- Price per additional collection method per query, in cents. NULL until add-on pricing is decided.
ALTER TABLE plans ADD COLUMN addon_unit_price INTEGER;

-- Rebuild run_queries with its dependents (provider_results, citations) so no parent table holding referenced rows is ever dropped:
-- new tables are created against each other, the old ones are dropped child-first, and RENAME rewrites the new foreign keys.
CREATE TABLE run_queries_new (id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES runs(id),query_id TEXT NOT NULL REFERENCES queries(id),provider_id TEXT NOT NULL REFERENCES providers(id),method TEXT NOT NULL CHECK(method IN ('api','simulated')),location TEXT,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,error_code TEXT,error_message TEXT,UNIQUE(run_id,query_id,provider_id,method));
INSERT INTO run_queries_new (id,run_id,query_id,provider_id,method,status,attempts,error_code,error_message)
  SELECT id,run_id,query_id,provider_id,CASE WHEN provider_id IN ('perplexity','chatgpt') THEN 'api' ELSE 'simulated' END,status,attempts,error_code,error_message FROM run_queries;
CREATE TABLE provider_results_new (id TEXT PRIMARY KEY,run_query_id TEXT NOT NULL UNIQUE REFERENCES run_queries_new(id),answer_present INTEGER NOT NULL,answer_text TEXT,cited INTEGER NOT NULL,mentioned INTEGER NOT NULL,citation_position INTEGER,search_id TEXT,raw_object_key TEXT,normalized_json TEXT NOT NULL,executed_at TEXT NOT NULL);
INSERT INTO provider_results_new SELECT id,run_query_id,answer_present,answer_text,cited,mentioned,citation_position,search_id,raw_object_key,normalized_json,executed_at FROM provider_results;
CREATE TABLE citations_new (id TEXT PRIMARY KEY,provider_result_id TEXT NOT NULL REFERENCES provider_results_new(id),url TEXT NOT NULL,domain TEXT NOT NULL,title TEXT,position INTEGER NOT NULL);
INSERT INTO citations_new SELECT id,provider_result_id,url,domain,title,position FROM citations;
DROP TABLE citations;
DROP TABLE provider_results;
DROP TABLE run_queries;
ALTER TABLE run_queries_new RENAME TO run_queries;
ALTER TABLE provider_results_new RENAME TO provider_results;
ALTER TABLE citations_new RENAME TO citations;

CREATE TABLE usage_events_new (id TEXT PRIMARY KEY,account_id TEXT NOT NULL,subscription_id TEXT NOT NULL,run_id TEXT NOT NULL,query_id TEXT NOT NULL,provider TEXT NOT NULL,method TEXT NOT NULL CHECK(method IN ('api','simulated')),addon INTEGER NOT NULL DEFAULT 0,units INTEGER NOT NULL,period_start TEXT NOT NULL,period_end TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(run_id,query_id,provider,method));
INSERT INTO usage_events_new (id,account_id,subscription_id,run_id,query_id,provider,method,units,period_start,period_end,created_at)
  SELECT id,account_id,subscription_id,run_id,query_id,provider,CASE WHEN provider IN ('perplexity','chatgpt') THEN 'api' ELSE 'simulated' END,units,period_start,period_end,created_at FROM usage_events;
DROP TABLE usage_events;
ALTER TABLE usage_events_new RENAME TO usage_events;
CREATE INDEX usage_events_addon_idx ON usage_events(account_id,period_start,addon);
