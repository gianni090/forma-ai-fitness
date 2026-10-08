-- Only the trusted server connection may access Forma tables.
-- RLS without client policies also protects databases exposed by Supabase's Data API.
-- Table owners and server roles with BYPASSRLS retain access; API routes enforce ownership.
DO $$
DECLARE
  table_name text;
  client_role text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'User', 'Exercise', 'Program', 'PlanWorkout', 'PlanExercise',
    'WorkoutSession', 'SessionExercise', 'SetLog', 'ProgramVersion',
    'AiRun', 'RateLimit', 'Feedback', '_prisma_migrations'
  ] LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', current_schema(), table_name);
    -- Client roles exist on Supabase; ordinary PostgreSQL does not need them.
    FOR client_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
      EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM %I', current_schema(), table_name, client_role);
    END LOOP;
  END LOOP;
END
$$;
