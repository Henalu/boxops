const DEFAULT_APP_PATH = "/app";

type AppPathOptions = {
  blockId?: string | null;
  blockStatus?: string | null;
  centerId?: string | null;
  classTypeId?: string | null;
  coachProfileId?: string | null;
  coverageState?: string | null;
  day?: string | null;
  organizationId?: string | null;
  error?: string | null;
  editTemplateBlockId?: string | null;
  mineOnly?: boolean | null;
  risksOnly?: boolean | null;
  status?: string | null;
  view?: string | null;
  week?: string | null;
};

export function getAppPath(path = DEFAULT_APP_PATH, options: AppPathOptions = {}) {
  const params = new URLSearchParams();

  if (options.organizationId) {
    params.set("organizationId", options.organizationId);
  }

  if (options.status) {
    params.set("status", options.status);
  }

  if (options.blockId) {
    params.set("block_id", options.blockId);
  }

  if (options.error) {
    params.set("error", options.error);
  }

  if (options.editTemplateBlockId) {
    params.set("edit_block_id", options.editTemplateBlockId);
  }

  if (options.week) {
    params.set("week", options.week);
  }

  if (options.day) {
    params.set("day", options.day);
  }

  if (options.view) {
    params.set("view", options.view);
  }

  if (options.centerId) {
    params.set("center_id", options.centerId);
  }

  if (options.coachProfileId) {
    params.set("coach_profile_id", options.coachProfileId);
  }

  if (options.classTypeId) {
    params.set("class_type_id", options.classTypeId);
  }

  if (options.blockStatus) {
    params.set("block_status", options.blockStatus);
  }

  if (options.coverageState) {
    params.set("coverage_state", options.coverageState);
  }

  if (options.mineOnly) {
    params.set("mine", "1");
  }

  if (options.risksOnly) {
    params.set("risks_only", "1");
  }

  const query = params.toString();

  return query ? `${path}?${query}` : path;
}

export function getCentersPath(options: AppPathOptions = {}) {
  return getAppPath("/app/centers", options);
}

export function getCoachesPath(options: AppPathOptions = {}) {
  return getAppPath("/app/coaches", options);
}

export function getClassTypesPath(options: AppPathOptions = {}) {
  return getAppPath("/app/class-types", options);
}

export function getSchedulePath(options: AppPathOptions = {}) {
  return getAppPath("/app/schedule", options);
}

export function getCoveragePath(options: AppPathOptions = {}) {
  return getAppPath("/app/coverage", options);
}

export function getScheduleTemplatesPath(options: AppPathOptions = {}) {
  return getAppPath("/app/templates", options);
}

export function getMorePath(options: AppPathOptions = {}) {
  return getAppPath("/app/more", options);
}
