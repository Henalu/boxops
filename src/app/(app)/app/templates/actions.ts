"use server";

import { redirect } from "next/navigation";

import { getLoginPath } from "@/lib/auth/redirects";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import {
  getSchedulePath,
  getScheduleTemplatesPath,
} from "@/lib/navigation/app-paths";
import { resolveWeek } from "@/lib/schedule-blocks";
import {
  isScheduleTemplateUuid,
  validateScheduleTemplateBlockForm,
  validateScheduleTemplateForm,
} from "@/lib/schedule-templates";
import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

function getRequiredFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getErrorPath(
  organizationId: string | null,
  week: string | null,
  error: string,
) {
  return getScheduleTemplatesPath({
    error,
    organizationId,
    week,
  });
}

async function getAdminActionContext(formData: FormData) {
  const organizationId = getRequiredFormString(formData, "organizationId");
  const rawWeekStart = getRequiredFormString(formData, "weekStart");
  const redirectPath = getScheduleTemplatesPath({
    organizationId,
    week: rawWeekStart || null,
  });
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath(redirectPath));
  }

  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(memberships, organizationId);

  if (!resolution.ok) {
    redirect(getErrorPath(organizationId, rawWeekStart || null, resolution.reason));
  }

  if (resolution.membership.role !== "admin") {
    redirect(getErrorPath(resolution.organization.id, rawWeekStart || null, "forbidden"));
  }

  const week = resolveWeek(rawWeekStart || undefined, resolution.organization.timezone);

  return {
    organization: resolution.organization,
    weekStart: week.weekStart,
  };
}

function getMutationError(errorCode?: string) {
  if (errorCode === "23503") {
    return "invalid-reference";
  }

  if (errorCode === "23514") {
    return "invalid-template-data";
  }

  return "save-failed";
}

async function validateOptionalCenterReference({
  centerId,
  organizationId,
  supabase,
}: {
  centerId: string | null;
  organizationId: string;
  supabase: SupabaseServerClient;
}) {
  if (!centerId) {
    return null;
  }

  const { data, error } = await supabase
    .from("centers")
    .select("id")
    .eq("id", centerId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  return error || !data ? "invalid-center" : null;
}

async function validateTemplateReference({
  organizationId,
  requireActive,
  supabase,
  templateId,
}: {
  organizationId: string;
  requireActive?: boolean;
  supabase: SupabaseServerClient;
  templateId: string;
}) {
  const { data: template, error } = await supabase
    .from("schedule_templates")
    .select("id, status, template_type")
    .eq("id", templateId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !template || template.template_type !== "weekly") {
    return {
      error: "invalid-template",
      template: null,
    };
  }

  if (template.status === "archived") {
    return {
      error: "template-archived",
      template: null,
    };
  }

  if (requireActive && template.status !== "active") {
    return {
      error: "template-not-active",
      template: null,
    };
  }

  return {
    error: null,
    template,
  };
}

async function validateAssignableCoach({
  coachProfileId,
  organizationId,
  supabase,
}: {
  coachProfileId: string;
  organizationId: string;
  supabase: SupabaseServerClient;
}) {
  const { data: coachProfile, error: coachError } = await supabase
    .from("coach_profiles")
    .select("id, person_profile_id, status, user_id")
    .eq("id", coachProfileId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (coachError || !coachProfile || coachProfile.status !== "active") {
    return "invalid-coach";
  }

  if (!coachProfile.user_id && !coachProfile.person_profile_id) {
    return "invalid-coach";
  }

  if (coachProfile.person_profile_id) {
    const { data: personProfile, error: personError } = await supabase
      .from("person_profiles")
      .select("id, status, visibility_status")
      .eq("id", coachProfile.person_profile_id)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (
      personError ||
      !personProfile ||
      personProfile.status !== "active" ||
      personProfile.visibility_status !== "visible"
    ) {
      return "invalid-coach";
    }
  }

  if (coachProfile.user_id) {
    const { data: membership, error: membershipError } = await supabase
      .from("organization_memberships")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("user_id", coachProfile.user_id)
      .eq("status", "active")
      .maybeSingle();

    if (membershipError || !membership) {
      return "invalid-coach";
    }
  }

  return null;
}

async function validateTemplateBlockReferences({
  centerId,
  classTypeId,
  defaultCoachProfileId,
  organizationId,
  supabase,
  templateId,
}: {
  centerId: string;
  classTypeId: string;
  defaultCoachProfileId: string | null;
  organizationId: string;
  supabase: SupabaseServerClient;
  templateId: string;
}) {
  const [templateResult, centerResult, classTypeResult] = await Promise.all([
    validateTemplateReference({
      organizationId,
      supabase,
      templateId,
    }),
    supabase
      .from("centers")
      .select("id")
      .eq("id", centerId)
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("class_types")
      .select("id")
      .eq("id", classTypeId)
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);

  if (templateResult.error) {
    return templateResult.error;
  }

  if (centerResult.error || !centerResult.data) {
    return "invalid-center";
  }

  if (classTypeResult.error || !classTypeResult.data) {
    return "invalid-class-type";
  }

  if (defaultCoachProfileId) {
    return validateAssignableCoach({
      coachProfileId: defaultCoachProfileId,
      organizationId,
      supabase,
    });
  }

  return null;
}

export async function createScheduleTemplate(formData: FormData) {
  const context = await getAdminActionContext(formData);
  const validation = validateScheduleTemplateForm(formData);

  if (!validation.ok) {
    redirect(getErrorPath(context.organization.id, context.weekStart, validation.error));
  }

  const supabase = await createClient();
  const centerError = await validateOptionalCenterReference({
    centerId: validation.values.centerId,
    organizationId: context.organization.id,
    supabase,
  });

  if (centerError) {
    redirect(getErrorPath(context.organization.id, context.weekStart, centerError));
  }

  const { error } = await supabase.from("schedule_templates").insert({
    center_id: validation.values.centerId,
    name: validation.values.name,
    organization_id: context.organization.id,
    status: validation.values.status,
    template_type: "weekly",
    valid_from: validation.values.validFrom,
    valid_until: validation.values.validUntil,
  });

  if (error) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        getMutationError(error.code),
      ),
    );
  }

  redirect(
    getScheduleTemplatesPath({
      organizationId: context.organization.id,
      status: "template-created",
      week: context.weekStart,
    }),
  );
}

export async function updateScheduleTemplate(formData: FormData) {
  const context = await getAdminActionContext(formData);
  const templateId = getRequiredFormString(formData, "templateId");
  const validation = validateScheduleTemplateForm(formData);

  if (!templateId) {
    redirect(getErrorPath(context.organization.id, context.weekStart, "template-required"));
  }

  if (!isScheduleTemplateUuid(templateId)) {
    redirect(getErrorPath(context.organization.id, context.weekStart, "invalid-template"));
  }

  if (!validation.ok) {
    redirect(getErrorPath(context.organization.id, context.weekStart, validation.error));
  }

  const supabase = await createClient();
  const centerError = await validateOptionalCenterReference({
    centerId: validation.values.centerId,
    organizationId: context.organization.id,
    supabase,
  });

  if (centerError) {
    redirect(getErrorPath(context.organization.id, context.weekStart, centerError));
  }

  const { error } = await supabase
    .from("schedule_templates")
    .update({
      center_id: validation.values.centerId,
      name: validation.values.name,
      status: validation.values.status,
      valid_from: validation.values.validFrom,
      valid_until: validation.values.validUntil,
    })
    .eq("id", templateId)
    .eq("organization_id", context.organization.id)
    .eq("template_type", "weekly")
    .select("id")
    .single();

  if (error) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        getMutationError(error.code),
      ),
    );
  }

  redirect(
    getScheduleTemplatesPath({
      organizationId: context.organization.id,
      status: "template-updated",
      week: context.weekStart,
    }),
  );
}

export async function createScheduleTemplateBlock(formData: FormData) {
  const context = await getAdminActionContext(formData);
  const validation = validateScheduleTemplateBlockForm(formData);

  if (!validation.ok) {
    redirect(getErrorPath(context.organization.id, context.weekStart, validation.error));
  }

  const supabase = await createClient();
  const referenceError = await validateTemplateBlockReferences({
    centerId: validation.values.centerId,
    classTypeId: validation.values.classTypeId,
    defaultCoachProfileId: validation.values.defaultCoachProfileId,
    organizationId: context.organization.id,
    supabase,
    templateId: validation.values.templateId,
  });

  if (referenceError) {
    redirect(getErrorPath(context.organization.id, context.weekStart, referenceError));
  }

  const { error } = await supabase.from("schedule_template_blocks").insert({
    center_id: validation.values.centerId,
    class_type_id: validation.values.classTypeId,
    day_of_week: validation.values.dayOfWeek,
    default_coach_profile_id: validation.values.defaultCoachProfileId,
    end_time: validation.values.endTime,
    notes: validation.values.notes,
    organization_id: context.organization.id,
    required_coaches: validation.values.requiredCoaches,
    start_time: validation.values.startTime,
    template_id: validation.values.templateId,
  });

  if (error) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        getMutationError(error.code),
      ),
    );
  }

  redirect(
    getScheduleTemplatesPath({
      organizationId: context.organization.id,
      status: "template-block-created",
      week: context.weekStart,
    }),
  );
}

export async function updateScheduleTemplateBlock(formData: FormData) {
  const context = await getAdminActionContext(formData);
  const templateBlockId = getRequiredFormString(formData, "templateBlockId");
  const validation = validateScheduleTemplateBlockForm(formData);

  if (!templateBlockId) {
    redirect(
      getErrorPath(context.organization.id, context.weekStart, "template-block-required"),
    );
  }

  if (!isScheduleTemplateUuid(templateBlockId)) {
    redirect(
      getErrorPath(context.organization.id, context.weekStart, "invalid-template-block"),
    );
  }

  if (!validation.ok) {
    redirect(getErrorPath(context.organization.id, context.weekStart, validation.error));
  }

  const supabase = await createClient();
  const { data: existingBlock, error: existingError } = await supabase
    .from("schedule_template_blocks")
    .select("id, template_id")
    .eq("id", templateBlockId)
    .eq("organization_id", context.organization.id)
    .maybeSingle();

  if (
    existingError ||
    !existingBlock ||
    existingBlock.template_id !== validation.values.templateId
  ) {
    redirect(
      getErrorPath(context.organization.id, context.weekStart, "invalid-template-block"),
    );
  }

  const referenceError = await validateTemplateBlockReferences({
    centerId: validation.values.centerId,
    classTypeId: validation.values.classTypeId,
    defaultCoachProfileId: validation.values.defaultCoachProfileId,
    organizationId: context.organization.id,
    supabase,
    templateId: validation.values.templateId,
  });

  if (referenceError) {
    redirect(getErrorPath(context.organization.id, context.weekStart, referenceError));
  }

  const { error } = await supabase
    .from("schedule_template_blocks")
    .update({
      center_id: validation.values.centerId,
      class_type_id: validation.values.classTypeId,
      day_of_week: validation.values.dayOfWeek,
      default_coach_profile_id: validation.values.defaultCoachProfileId,
      end_time: validation.values.endTime,
      notes: validation.values.notes,
      required_coaches: validation.values.requiredCoaches,
      start_time: validation.values.startTime,
    })
    .eq("id", templateBlockId)
    .eq("organization_id", context.organization.id)
    .select("id")
    .single();

  if (error) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        getMutationError(error.code),
      ),
    );
  }

  redirect(
    getScheduleTemplatesPath({
      organizationId: context.organization.id,
      status: "template-block-updated",
      week: context.weekStart,
    }),
  );
}

export async function applyScheduleTemplateToWeek(formData: FormData) {
  const context = await getAdminActionContext(formData);
  const templateId = getRequiredFormString(formData, "templateId");

  if (!templateId || !isScheduleTemplateUuid(templateId)) {
    redirect(getErrorPath(context.organization.id, context.weekStart, "invalid-template"));
  }

  const supabase = await createClient();
  const templateResult = await validateTemplateReference({
    organizationId: context.organization.id,
    requireActive: true,
    supabase,
    templateId,
  });

  if (templateResult.error) {
    redirect(getErrorPath(context.organization.id, context.weekStart, templateResult.error));
  }

  const { data: templateBlocks, error: templateBlocksError } = await supabase
    .from("schedule_template_blocks")
    .select(
      "id, center_id, class_type_id, day_of_week, start_time, end_time, required_coaches, default_coach_profile_id, notes",
    )
    .eq("organization_id", context.organization.id)
    .eq("template_id", templateId)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });

  if (templateBlocksError) {
    redirect(getErrorPath(context.organization.id, context.weekStart, "save-failed"));
  }

  if (templateBlocks.length === 0) {
    redirect(getErrorPath(context.organization.id, context.weekStart, "template-empty"));
  }

  const defaultCoachProfileIds = [
    ...new Set(
      templateBlocks.flatMap((block) =>
        block.default_coach_profile_id ? [block.default_coach_profile_id] : [],
      ),
    ),
  ];

  for (const coachProfileId of defaultCoachProfileIds) {
    const coachError = await validateAssignableCoach({
      coachProfileId,
      organizationId: context.organization.id,
      supabase,
    });

    if (coachError) {
      redirect(getErrorPath(context.organization.id, context.weekStart, coachError));
    }
  }

  const week = resolveWeek(context.weekStart, context.organization.timezone);
  const templateBlockIds = templateBlocks.map((block) => block.id);
  const { data: existingBlocks, error: existingBlocksError } = await supabase
    .from("schedule_blocks")
    .select("template_block_id, service_date")
    .eq("organization_id", context.organization.id)
    .eq("template_id", templateId)
    .gte("service_date", context.weekStart)
    .lte("service_date", week.weekEnd)
    .in("template_block_id", templateBlockIds);

  if (existingBlocksError) {
    redirect(getErrorPath(context.organization.id, context.weekStart, "save-failed"));
  }

  const existingKeys = new Set(
    existingBlocks.map(
      (block) => `${block.template_block_id ?? ""}:${block.service_date}`,
    ),
  );
  const blockDatesByTemplateBlockId = new Map(
    templateBlocks.map((block) => [
      block.id,
      week.days[block.day_of_week - 1] ?? week.weekStart,
    ]),
  );
  const blocksToInsert = templateBlocks.flatMap((block) => {
    const serviceDate = blockDatesByTemplateBlockId.get(block.id);

    if (!serviceDate || existingKeys.has(`${block.id}:${serviceDate}`)) {
      return [];
    }

    return [
      {
        center_id: block.center_id,
        class_type_id: block.class_type_id,
        end_time: block.end_time,
        is_template_exception: false,
        notes: block.notes,
        organization_id: context.organization.id,
        required_coaches: block.required_coaches,
        service_date: serviceDate,
        start_time: block.start_time,
        status: "scheduled",
        template_block_id: block.id,
        template_id: templateId,
      },
    ];
  });

  if (blocksToInsert.length === 0) {
    redirect(
      getSchedulePath({
        organizationId: context.organization.id,
        status: "template-already-applied",
        week: week.weekStart,
      }),
    );
  }

  const { data: insertedBlocks, error: insertError } = await supabase
    .from("schedule_blocks")
    .insert(blocksToInsert)
    .select("id, template_block_id");

  if (insertError) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        getMutationError(insertError.code),
      ),
    );
  }

  const defaultCoachByTemplateBlockId = new Map(
    templateBlocks.flatMap((block) =>
      block.default_coach_profile_id
        ? [[block.id, block.default_coach_profile_id] as const]
        : [],
    ),
  );
  const assignmentsToInsert = insertedBlocks.flatMap((block) => {
    const templateBlockId = block.template_block_id;
    const coachProfileId = templateBlockId
      ? defaultCoachByTemplateBlockId.get(templateBlockId)
      : null;

    if (!coachProfileId) {
      return [];
    }

    return [
      {
        assignment_status: "assigned",
        coach_profile_id: coachProfileId,
        organization_id: context.organization.id,
        schedule_block_id: block.id,
        source: "template",
      },
    ];
  });

  if (assignmentsToInsert.length > 0) {
    const { error: assignmentsError } = await supabase
      .from("schedule_block_assignments")
      .insert(assignmentsToInsert);

    if (assignmentsError) {
      redirect(
        getErrorPath(
          context.organization.id,
          context.weekStart,
          getMutationError(assignmentsError.code),
        ),
      );
    }
  }

  redirect(
    getSchedulePath({
      organizationId: context.organization.id,
      status: "template-applied",
      week: week.weekStart,
    }),
  );
}
