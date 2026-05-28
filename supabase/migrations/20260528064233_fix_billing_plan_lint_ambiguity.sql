-- BoxOps - Billing function lint ambiguity fix
-- Rewrites the two billing RPCs that used ON CONFLICT column names colliding
-- with RETURNS TABLE output column names. This is schema-only and does not
-- change plan permissions, RLS predicates, subscription data or billing state.

DO $$
DECLARE
  function_sql text;
BEGIN
  SELECT pg_get_functiondef(
    'public.create_billing_plan_draft_version(text,text,text,integer,integer,integer,text,integer,integer,integer,integer,text,jsonb,text,text,text)'::regprocedure
  )
  INTO function_sql;

  EXECUTE replace(
    function_sql,
    'ON CONFLICT (plan_code) DO UPDATE',
    'ON CONFLICT ON CONSTRAINT billing_plans_plan_code_key DO UPDATE'
  );

  SELECT pg_get_functiondef(
    'public.assign_organization_billing_plan_manual(uuid,text,integer,uuid[])'::regprocedure
  )
  INTO function_sql;

  EXECUTE replace(
    function_sql,
    'ON CONFLICT (organization_id) DO UPDATE',
    'ON CONFLICT ON CONSTRAINT organization_subscriptions_organization_id_key DO UPDATE'
  );
END;
$$;
