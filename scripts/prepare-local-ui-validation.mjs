import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

process.loadEnvFile(".env.local");
if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin !== "http://127.0.0.1:55321") {
  throw new Error("UI fixtures require the BoxOps local Supabase on port 55321.");
}
if (!process.argv.includes("--create")) {
  throw new Error("Use --create to add a new isolated local fixture. Existing users are never reset.");
}
const id = () => randomUUID();
const start = new Date();
start.setUTCHours(12, 0, 0, 0);
start.setUTCDate(start.getUTCDate() + ((8 - start.getUTCDay()) % 7) + 28);
const week = start.toISOString().slice(0, 10);
const end = new Date(start);
end.setUTCDate(end.getUTCDate() + 6);
const weekEnd = end.toISOString().slice(0, 10);
const fixture = {
  organizationId: id(), foreignOrganizationId: id(), centerId: id(), secondCenterId: id(),
  foreignCenterId: id(), classTypeId: id(), foreignClassTypeId: id(), coachId: id(),
  blockId: id(), vacantBlockId: id(), zeroBlockId: id(), foreignBlockId: id(),
  documentId: id(), privateDocumentId: id(), foreignDocumentId: id(),
  templateId: id(), templateBlockId: id(), replacementTemplateId: id(), replacementBlockId: id(),
  platformAdminId: id(), week, roles: {},
};
const suffix = fixture.organizationId.slice(0, 8);
for (const role of ["owner", "admin", "manager", "coach", "athlete", "foreign", "support"]) {
  fixture.roles[role] = { id: id(), personId: id(), email: `ui-${suffix}-${role}@example.invalid`, password: randomBytes(24).toString("base64url") };
}
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const sql = ["BEGIN; SET LOCAL statement_timeout = '30s';"];
sql.push(readFileSync("supabase/migrations/20260907081226_atomic_schedule_template_week.sql", "utf8"));
for (const actor of Object.values(fixture.roles)) {
  sql.push(`INSERT INTO auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,confirmation_token,recovery_token,email_change_token_new,email_change,email_change_token_current,reauthentication_token,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    VALUES ('00000000-0000-0000-0000-000000000000',${q(actor.id)},'authenticated','authenticated',${q(actor.email)},extensions.crypt(${q(actor.password)},extensions.gen_salt('bf')),now(),'','','','','','','{"provider":"email","providers":["email"]}','{"boxopsLocalUI":true}',now(),now());
    INSERT INTO auth.identities (provider_id,user_id,identity_data,provider,created_at,updated_at)
    VALUES (${q(actor.id)},${q(actor.id)},jsonb_build_object('sub',${q(actor.id)},'email',${q(actor.email)},'email_verified',true),'email',now(),now());`);
}
sql.push(`INSERT INTO public.organizations(id,name,slug,status) VALUES
 (${q(fixture.organizationId)},'UI Validation A',${q(`ui-validation-a-${suffix}`)},'active'),
 (${q(fixture.foreignOrganizationId)},'UI Validation B',${q(`ui-validation-b-${suffix}`)},'active');`);
for (const [role, actor] of Object.entries(fixture.roles)) {
  if (role === "support") continue;
  const org = role === "foreign" ? fixture.foreignOrganizationId : fixture.organizationId;
  sql.push(`INSERT INTO public.organization_memberships(organization_id,user_id,role,status) VALUES (${q(org)},${q(actor.id)},${q(role === "foreign" ? "owner" : role)},'active');
    INSERT INTO public.person_profiles(id,organization_id,user_id,full_name,display_name) VALUES (${q(actor.personId)},${q(org)},${q(actor.id)},${q(`UI ${role}`)},${q(`UI ${role}`)});`);
}
sql.push(`INSERT INTO public.centers(id,organization_id,name,slug) VALUES
 (${q(fixture.centerId)},${q(fixture.organizationId)},'UI Norte','ui-norte'),
 (${q(fixture.secondCenterId)},${q(fixture.organizationId)},'UI Sur','ui-sur'),
 (${q(fixture.foreignCenterId)},${q(fixture.foreignOrganizationId)},'Centro exclusivo B','ui-b');
 INSERT INTO public.class_types(id,organization_id,name,slug) VALUES
 (${q(fixture.classTypeId)},${q(fixture.organizationId)},'UI Entrenamiento','ui-training'),
 (${q(fixture.foreignClassTypeId)},${q(fixture.foreignOrganizationId)},'Actividad exclusiva B','ui-b');
 INSERT INTO public.coach_profiles(id,organization_id,user_id,person_profile_id) VALUES
 (${q(fixture.coachId)},${q(fixture.organizationId)},${q(fixture.roles.coach.id)},${q(fixture.roles.coach.personId)});
 INSERT INTO public.schedule_blocks(id,organization_id,center_id,class_type_id,service_date,start_time,end_time,required_coaches,notes) VALUES
 (${q(fixture.blockId)},${q(fixture.organizationId)},${q(fixture.centerId)},${q(fixture.classTypeId)},${q(fixture.week)},'09:00','10:00',1,'UI bloque asignado'),
 (${q(fixture.vacantBlockId)},${q(fixture.organizationId)},${q(fixture.centerId)},${q(fixture.classTypeId)},${q(fixture.week)},'11:00','12:00',1,'UI bloque vacante'),
 (${q(fixture.zeroBlockId)},${q(fixture.organizationId)},${q(fixture.secondCenterId)},${q(fixture.classTypeId)},${q(fixture.week)},'13:00','14:00',0,'UI sin requisito'),
 (${q(fixture.foreignBlockId)},${q(fixture.foreignOrganizationId)},${q(fixture.foreignCenterId)},${q(fixture.foreignClassTypeId)},${q(fixture.week)},'09:00','10:00',1,'Nota exclusiva B');
 INSERT INTO public.schedule_block_assignments(organization_id,schedule_block_id,coach_profile_id) VALUES
 (${q(fixture.organizationId)},${q(fixture.blockId)},${q(fixture.coachId)});
 INSERT INTO public.schedule_templates(id,organization_id,center_id,name,status,valid_from,valid_until) VALUES
 (${q(fixture.templateId)},${q(fixture.organizationId)},${q(fixture.centerId)},'UI Plantilla base','draft',${q(fixture.week)},${q(weekEnd)}),
 (${q(fixture.replacementTemplateId)},${q(fixture.organizationId)},${q(fixture.centerId)},'UI Plantilla reemplazo','draft',${q(fixture.week)},${q(weekEnd)});
 INSERT INTO public.schedule_template_blocks(id,organization_id,template_id,center_id,class_type_id,day_of_week,start_time,end_time,default_coach_profile_id,required_coaches) VALUES
 (${q(fixture.templateBlockId)},${q(fixture.organizationId)},${q(fixture.templateId)},${q(fixture.centerId)},${q(fixture.classTypeId)},1,'07:00','08:00',${q(fixture.coachId)},1),
 (${q(fixture.replacementBlockId)},${q(fixture.organizationId)},${q(fixture.replacementTemplateId)},${q(fixture.centerId)},${q(fixture.classTypeId)},1,'09:00','10:00',${q(fixture.coachId)},1);
 INSERT INTO public.documents(id,organization_id,created_by_user_id,title,document_scope,sensitivity_level,status) VALUES
 (${q(fixture.documentId)},${q(fixture.organizationId)},${q(fixture.roles.owner.id)},'UI Documento compartido','company','public_internal','active'),
 (${q(fixture.privateDocumentId)},${q(fixture.organizationId)},${q(fixture.roles.owner.id)},'UI Documento privado owner','person_private','restricted','active'),
 (${q(fixture.foreignDocumentId)},${q(fixture.foreignOrganizationId)},${q(fixture.roles.foreign.id)},'Documento exclusivo B','company','public_internal','active');
 INSERT INTO public.platform_admins(id,user_id,role,display_name) VALUES
 (${q(fixture.platformAdminId)},${q(fixture.roles.support.id)},'support','UI Support');
 NOTIFY pgrst, 'reload schema'; COMMIT;`);
const result = spawnSync("docker", ["exec","-i","supabase_db_boxops","psql","-U","postgres","-d","postgres","-X","-q","-v","ON_ERROR_STOP=1"], {input: sql.join("\n"), encoding:"utf8", timeout:60_000});
if (result.status !== 0) {
  // SQL may contain freshly generated passwords; do not print statements on failure.
  console.error(result.stderr?.split(/\r?\n/).filter(line => line.startsWith("ERROR:")).join("\n") || "Local fixture creation failed.");
  process.exit(1);
}
mkdirSync(".local-evidence/ui-validation", {recursive:true});
writeFileSync(".local-evidence/ui-validation/fixture.json", JSON.stringify(fixture, null, 2));
console.log(`Created isolated local UI fixtures: ${suffix}; seven users, two tenants. Migration active locally only.`);
