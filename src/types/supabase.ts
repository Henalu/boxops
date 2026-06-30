export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      absence_request_events: {
        Row: {
          absence_request_id: string
          actor_membership_id: string
          actor_person_profile_id: string | null
          actor_user_id: string
          changed_fields: Json
          created_at: string
          event_type: string
          id: string
          organization_id: string
          result: string
          retain_until: string
        }
        Insert: {
          absence_request_id: string
          actor_membership_id: string
          actor_person_profile_id?: string | null
          actor_user_id: string
          changed_fields?: Json
          created_at?: string
          event_type: string
          id?: string
          organization_id: string
          result?: string
          retain_until: string
        }
        Update: {
          absence_request_id?: string
          actor_membership_id?: string
          actor_person_profile_id?: string | null
          actor_user_id?: string
          changed_fields?: Json
          created_at?: string
          event_type?: string
          id?: string
          organization_id?: string
          result?: string
          retain_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "absence_request_events_absence_request_id_organization_id_fkey"
            columns: ["absence_request_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "absence_requests"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "absence_request_events_actor_membership_id_organization_id_fkey"
            columns: ["actor_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "absence_request_events_actor_person_profile_id_organizatio_fkey"
            columns: ["actor_person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "absence_request_events_organization_id_actor_user_id_fkey"
            columns: ["organization_id", "actor_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "absence_request_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      absence_request_periods: {
        Row: {
          absence_request_id: string
          all_day: boolean
          created_at: string
          ends_at: string
          id: string
          organization_id: string
          period_index: number
          starts_at: string
          timezone: string
        }
        Insert: {
          absence_request_id: string
          all_day?: boolean
          created_at?: string
          ends_at: string
          id?: string
          organization_id: string
          period_index?: number
          starts_at: string
          timezone: string
        }
        Update: {
          absence_request_id?: string
          all_day?: boolean
          created_at?: string
          ends_at?: string
          id?: string
          organization_id?: string
          period_index?: number
          starts_at?: string
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "absence_request_periods_absence_request_id_organization_id_fkey"
            columns: ["absence_request_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "absence_requests"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "absence_request_periods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      absence_requests: {
        Row: {
          absence_type: string
          cancelled_at: string | null
          created_at: string
          expired_at: string | null
          expires_at: string | null
          id: string
          organization_id: string
          reason_summary: string | null
          requested_at: string
          requested_by_membership_id: string
          requested_by_person_profile_id: string
          requested_by_user_id: string
          resolved_at: string | null
          retain_until: string
          review_required: boolean
          reviewed_at: string | null
          reviewed_by_membership_id: string | null
          reviewed_by_person_profile_id: string | null
          status: string
          subject_coach_profile_id: string | null
          subject_person_profile_id: string
          updated_at: string
        }
        Insert: {
          absence_type: string
          cancelled_at?: string | null
          created_at?: string
          expired_at?: string | null
          expires_at?: string | null
          id?: string
          organization_id: string
          reason_summary?: string | null
          requested_at?: string
          requested_by_membership_id: string
          requested_by_person_profile_id: string
          requested_by_user_id: string
          resolved_at?: string | null
          retain_until?: string
          review_required?: boolean
          reviewed_at?: string | null
          reviewed_by_membership_id?: string | null
          reviewed_by_person_profile_id?: string | null
          status?: string
          subject_coach_profile_id?: string | null
          subject_person_profile_id: string
          updated_at?: string
        }
        Update: {
          absence_type?: string
          cancelled_at?: string | null
          created_at?: string
          expired_at?: string | null
          expires_at?: string | null
          id?: string
          organization_id?: string
          reason_summary?: string | null
          requested_at?: string
          requested_by_membership_id?: string
          requested_by_person_profile_id?: string
          requested_by_user_id?: string
          resolved_at?: string | null
          retain_until?: string
          review_required?: boolean
          reviewed_at?: string | null
          reviewed_by_membership_id?: string | null
          reviewed_by_person_profile_id?: string | null
          status?: string
          subject_coach_profile_id?: string | null
          subject_person_profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "absence_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absence_requests_organization_id_requested_by_user_id_fkey"
            columns: ["organization_id", "requested_by_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "absence_requests_requested_by_membership_id_organization_i_fkey"
            columns: ["requested_by_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "absence_requests_requested_by_person_profile_id_organizati_fkey"
            columns: ["requested_by_person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "absence_requests_reviewed_by_membership_id_organization_id_fkey"
            columns: ["reviewed_by_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "absence_requests_reviewed_by_person_profile_id_organizatio_fkey"
            columns: ["reviewed_by_person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "absence_requests_subject_coach_profile_id_organization_id_fkey"
            columns: ["subject_coach_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "absence_requests_subject_person_profile_id_organization_id_fkey"
            columns: ["subject_person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      billing_plan_versions: {
        Row: {
          annual_price_cents: number | null
          archived_at: string | null
          billing_plan_id: string
          center_limit: number | null
          created_at: string
          created_by_platform_admin_id: string | null
          currency: string
          description: string
          display_name: string
          features: Json
          future_client_limit: number | null
          id: string
          monthly_price_cents: number | null
          plan_code: string
          published_at: string | null
          setup_description: string | null
          setup_price_cents: number | null
          staff_seat_limit: number | null
          status: string
          storage_gb: number | null
          stripe_annual_price_id: string | null
          stripe_monthly_price_id: string | null
          stripe_product_id: string | null
          support_level: string
          updated_at: string
          updated_by_platform_admin_id: string | null
          version: number
        }
        Insert: {
          annual_price_cents?: number | null
          archived_at?: string | null
          billing_plan_id: string
          center_limit?: number | null
          created_at?: string
          created_by_platform_admin_id?: string | null
          currency?: string
          description: string
          display_name: string
          features?: Json
          future_client_limit?: number | null
          id?: string
          monthly_price_cents?: number | null
          plan_code: string
          published_at?: string | null
          setup_description?: string | null
          setup_price_cents?: number | null
          staff_seat_limit?: number | null
          status?: string
          storage_gb?: number | null
          stripe_annual_price_id?: string | null
          stripe_monthly_price_id?: string | null
          stripe_product_id?: string | null
          support_level: string
          updated_at?: string
          updated_by_platform_admin_id?: string | null
          version: number
        }
        Update: {
          annual_price_cents?: number | null
          archived_at?: string | null
          billing_plan_id?: string
          center_limit?: number | null
          created_at?: string
          created_by_platform_admin_id?: string | null
          currency?: string
          description?: string
          display_name?: string
          features?: Json
          future_client_limit?: number | null
          id?: string
          monthly_price_cents?: number | null
          plan_code?: string
          published_at?: string | null
          setup_description?: string | null
          setup_price_cents?: number | null
          staff_seat_limit?: number | null
          status?: string
          storage_gb?: number | null
          stripe_annual_price_id?: string | null
          stripe_monthly_price_id?: string | null
          stripe_product_id?: string | null
          support_level?: string
          updated_at?: string
          updated_by_platform_admin_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "billing_plan_versions_billing_plan_id_plan_code_fkey"
            columns: ["billing_plan_id", "plan_code"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["id", "plan_code"]
          },
          {
            foreignKeyName: "billing_plan_versions_created_by_platform_admin_id_fkey"
            columns: ["created_by_platform_admin_id"]
            isOneToOne: false
            referencedRelation: "platform_admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_plan_versions_updated_by_platform_admin_id_fkey"
            columns: ["updated_by_platform_admin_id"]
            isOneToOne: false
            referencedRelation: "platform_admins"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_plans: {
        Row: {
          created_at: string
          id: string
          plan_code: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          plan_code: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          plan_code?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      center_time_location_settings: {
        Row: {
          activated_at: string | null
          center_id: string
          center_latitude: number
          center_longitude: number
          change_reason: string | null
          created_at: string
          created_by_membership_id: string
          created_by_user_id: string
          deactivated_at: string | null
          fallback_retention_days: number
          id: string
          max_accuracy_meters: number
          notice_text: string
          organization_id: string
          policy_version: number
          radius_meters: number
          retention_days: number
          status: string
          timezone: string
          updated_at: string
          updated_by_membership_id: string
          updated_by_user_id: string
        }
        Insert: {
          activated_at?: string | null
          center_id: string
          center_latitude: number
          center_longitude: number
          change_reason?: string | null
          created_at?: string
          created_by_membership_id: string
          created_by_user_id: string
          deactivated_at?: string | null
          fallback_retention_days?: number
          id?: string
          max_accuracy_meters?: number
          notice_text: string
          organization_id: string
          policy_version?: number
          radius_meters?: number
          retention_days?: number
          status?: string
          timezone?: string
          updated_at?: string
          updated_by_membership_id: string
          updated_by_user_id: string
        }
        Update: {
          activated_at?: string | null
          center_id?: string
          center_latitude?: number
          center_longitude?: number
          change_reason?: string | null
          created_at?: string
          created_by_membership_id?: string
          created_by_user_id?: string
          deactivated_at?: string | null
          fallback_retention_days?: number
          id?: string
          max_accuracy_meters?: number
          notice_text?: string
          organization_id?: string
          policy_version?: number
          radius_meters?: number
          retention_days?: number
          status?: string
          timezone?: string
          updated_at?: string
          updated_by_membership_id?: string
          updated_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "center_time_location_settings_center_id_organization_id_fkey"
            columns: ["center_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "center_time_location_settings_created_by_membership_id_org_fkey"
            columns: ["created_by_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "center_time_location_settings_organization_id_created_by_u_fkey"
            columns: ["organization_id", "created_by_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "center_time_location_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "center_time_location_settings_organization_id_updated_by_u_fkey"
            columns: ["organization_id", "updated_by_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "center_time_location_settings_updated_by_membership_id_org_fkey"
            columns: ["updated_by_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      centers: {
        Row: {
          address: string | null
          created_at: string
          geofence_radius_meters: number
          id: string
          latitude: number | null
          longitude: number | null
          metadata: Json
          name: string
          organization_id: string
          slug: string
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          geofence_radius_meters?: number
          id?: string
          latitude?: number | null
          longitude?: number | null
          metadata?: Json
          name: string
          organization_id: string
          slug: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          geofence_radius_meters?: number
          id?: string
          latitude?: number | null
          longitude?: number | null
          metadata?: Json
          name?: string
          organization_id?: string
          slug?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "centers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      certifications: {
        Row: {
          created_at: string
          description: string | null
          id: string
          metadata: Json
          organization_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "certifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chatgpt_connector_confirmations: {
        Row: {
          actor_user_id: string
          applied_at: string | null
          apply_request_id: string | null
          audit_event_id: string | null
          center_id: string
          created_assignment_count: number
          created_at: string
          created_block_count: number
          date_from: string
          date_to: string
          expires_at: string
          id: string
          idempotency_key_hash: string
          organization_id: string
          plan_hash: string
          plan_snapshot: Json
          prepare_request_id: string
          skipped_duplicate_count: number
          status: string
          template_id: string
          token_hash: string
          tool: string
          updated_at: string
        }
        Insert: {
          actor_user_id: string
          applied_at?: string | null
          apply_request_id?: string | null
          audit_event_id?: string | null
          center_id: string
          created_assignment_count?: number
          created_at?: string
          created_block_count?: number
          date_from: string
          date_to: string
          expires_at: string
          id?: string
          idempotency_key_hash: string
          organization_id: string
          plan_hash: string
          plan_snapshot: Json
          prepare_request_id: string
          skipped_duplicate_count?: number
          status?: string
          template_id: string
          token_hash: string
          tool: string
          updated_at?: string
        }
        Update: {
          actor_user_id?: string
          applied_at?: string | null
          apply_request_id?: string | null
          audit_event_id?: string | null
          center_id?: string
          created_assignment_count?: number
          created_at?: string
          created_block_count?: number
          date_from?: string
          date_to?: string
          expires_at?: string
          id?: string
          idempotency_key_hash?: string
          organization_id?: string
          plan_hash?: string
          plan_snapshot?: Json
          prepare_request_id?: string
          skipped_duplicate_count?: number
          status?: string
          template_id?: string
          token_hash?: string
          tool?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatgpt_connector_confirmations_center_id_organization_id_fkey"
            columns: ["center_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "chatgpt_connector_confirmations_organization_id_actor_user_id_fkey"
            columns: ["organization_id", "actor_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "chatgpt_connector_confirmations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatgpt_connector_confirmations_template_id_organization_id_fkey"
            columns: ["template_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "schedule_templates"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      change_request_events: {
        Row: {
          actor_coach_profile_id: string | null
          actor_membership_id: string
          actor_person_profile_id: string | null
          actor_user_id: string
          change_request_id: string
          change_request_target_id: string | null
          changed_fields: Json
          created_at: string
          event_type: string
          id: string
          organization_id: string
          result: string
          retain_until: string
        }
        Insert: {
          actor_coach_profile_id?: string | null
          actor_membership_id: string
          actor_person_profile_id?: string | null
          actor_user_id: string
          change_request_id: string
          change_request_target_id?: string | null
          changed_fields?: Json
          created_at?: string
          event_type: string
          id?: string
          organization_id: string
          result?: string
          retain_until: string
        }
        Update: {
          actor_coach_profile_id?: string | null
          actor_membership_id?: string
          actor_person_profile_id?: string | null
          actor_user_id?: string
          change_request_id?: string
          change_request_target_id?: string | null
          changed_fields?: Json
          created_at?: string
          event_type?: string
          id?: string
          organization_id?: string
          result?: string
          retain_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_request_events_actor_coach_profile_id_organization__fkey"
            columns: ["actor_coach_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "change_request_events_actor_membership_id_organization_id_fkey"
            columns: ["actor_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "change_request_events_actor_person_profile_id_organization_fkey"
            columns: ["actor_person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "change_request_events_change_request_id_organization_id_fkey"
            columns: ["change_request_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "change_requests"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "change_request_events_change_request_target_id_organizatio_fkey"
            columns: ["change_request_target_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "change_request_targets"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "change_request_events_organization_id_actor_user_id_fkey"
            columns: ["organization_id", "actor_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "change_request_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      change_request_targets: {
        Row: {
          change_request_id: string
          expires_at: string | null
          id: string
          offered_at: string
          organization_id: string
          responded_at: string | null
          response_note_summary: string | null
          status: string
          target_coach_profile_id: string
          target_type: string
        }
        Insert: {
          change_request_id: string
          expires_at?: string | null
          id?: string
          offered_at?: string
          organization_id: string
          responded_at?: string | null
          response_note_summary?: string | null
          status?: string
          target_coach_profile_id: string
          target_type?: string
        }
        Update: {
          change_request_id?: string
          expires_at?: string | null
          id?: string
          offered_at?: string
          organization_id?: string
          responded_at?: string | null
          response_note_summary?: string | null
          status?: string
          target_coach_profile_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_request_targets_change_request_id_organization_id_fkey"
            columns: ["change_request_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "change_requests"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "change_request_targets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_request_targets_target_coach_profile_id_organizatio_fkey"
            columns: ["target_coach_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      change_requests: {
        Row: {
          accepted_target_id: string | null
          applied_at: string | null
          applied_schedule_block_assignment_id: string | null
          approval_required: boolean
          created_at: string
          expires_at: string | null
          id: string
          organization_id: string
          reason_summary: string | null
          request_type: string
          requester_coach_profile_id: string
          requester_membership_id: string
          requester_person_profile_id: string
          resolved_at: string | null
          schedule_block_assignment_id: string
          schedule_block_id: string
          status: string
          updated_at: string
        }
        Insert: {
          accepted_target_id?: string | null
          applied_at?: string | null
          applied_schedule_block_assignment_id?: string | null
          approval_required?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          organization_id: string
          reason_summary?: string | null
          request_type: string
          requester_coach_profile_id: string
          requester_membership_id: string
          requester_person_profile_id: string
          resolved_at?: string | null
          schedule_block_assignment_id: string
          schedule_block_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_target_id?: string | null
          applied_at?: string | null
          applied_schedule_block_assignment_id?: string | null
          approval_required?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          organization_id?: string
          reason_summary?: string | null
          request_type?: string
          requester_coach_profile_id?: string
          requester_membership_id?: string
          requester_person_profile_id?: string
          resolved_at?: string | null
          schedule_block_assignment_id?: string
          schedule_block_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_requests_applied_schedule_block_assignment_id_organ_fkey"
            columns: ["applied_schedule_block_assignment_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "schedule_block_assignments"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "change_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_requests_requester_coach_profile_id_organization_id_fkey"
            columns: ["requester_coach_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "change_requests_requester_membership_id_organization_id_fkey"
            columns: ["requester_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "change_requests_requester_person_profile_id_organization_i_fkey"
            columns: ["requester_person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "change_requests_schedule_block_assignment_id_organization__fkey"
            columns: ["schedule_block_assignment_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "schedule_block_assignments"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "change_requests_schedule_block_id_organization_id_fkey"
            columns: ["schedule_block_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "schedule_blocks"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      class_types: {
        Row: {
          category: string
          certification_id: string | null
          color: string | null
          created_at: string
          icon_key: string
          id: string
          metadata: Json
          name: string
          organization_id: string
          required_coaches: number
          requires_certification: boolean
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          category?: string
          certification_id?: string | null
          color?: string | null
          created_at?: string
          icon_key?: string
          id?: string
          metadata?: Json
          name: string
          organization_id: string
          required_coaches?: number
          requires_certification?: boolean
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          certification_id?: string | null
          color?: string | null
          created_at?: string
          icon_key?: string
          id?: string
          metadata?: Json
          name?: string
          organization_id?: string
          required_coaches?: number
          requires_certification?: boolean
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_types_certification_fk"
            columns: ["certification_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "certifications"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "class_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_center_assignments: {
        Row: {
          center_id: string
          coach_profile_id: string
          created_at: string
          id: string
          is_primary: boolean
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          center_id: string
          coach_profile_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          center_id?: string
          coach_profile_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_center_assignments_center_id_organization_id_fkey"
            columns: ["center_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "coach_center_assignments_coach_profile_id_organization_id_fkey"
            columns: ["coach_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "coach_center_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_certifications: {
        Row: {
          certification_id: string
          coach_profile_id: string
          created_at: string
          id: string
          metadata: Json
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          certification_id: string
          coach_profile_id: string
          created_at?: string
          id?: string
          metadata?: Json
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          certification_id?: string
          coach_profile_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_certifications_certification_id_organization_id_fkey"
            columns: ["certification_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "certifications"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "coach_certifications_coach_profile_id_organization_id_fkey"
            columns: ["coach_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "coach_certifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_profiles: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          notes: string | null
          organization_id: string
          person_profile_id: string | null
          primary_center_id: string | null
          status: string
          updated_at: string
          user_id: string | null
          weekly_contracted_hours: number
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          notes?: string | null
          organization_id: string
          person_profile_id?: string | null
          primary_center_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          weekly_contracted_hours?: number
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          notes?: string | null
          organization_id?: string
          person_profile_id?: string | null
          primary_center_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          weekly_contracted_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "coach_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_profiles_organization_id_user_id_fkey"
            columns: ["organization_id", "user_id"]
            isOneToOne: true
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "coach_profiles_person_profile_id_organization_id_fkey"
            columns: ["person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "coach_profiles_primary_center_id_organization_id_fkey"
            columns: ["primary_center_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      document_access_events: {
        Row: {
          access_level: string | null
          actor_person_profile_id: string | null
          actor_user_id: string
          created_at: string
          document_id: string
          document_version_id: string | null
          event_type: string
          id: string
          metadata: Json
          organization_id: string
          organization_membership_id: string
          result: string
        }
        Insert: {
          access_level?: string | null
          actor_person_profile_id?: string | null
          actor_user_id: string
          created_at?: string
          document_id: string
          document_version_id?: string | null
          event_type: string
          id?: string
          metadata?: Json
          organization_id: string
          organization_membership_id: string
          result?: string
        }
        Update: {
          access_level?: string | null
          actor_person_profile_id?: string | null
          actor_user_id?: string
          created_at?: string
          document_id?: string
          document_version_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          organization_id?: string
          organization_membership_id?: string
          result?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_access_events_actor_person_profile_id_organizatio_fkey"
            columns: ["actor_person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "document_access_events_document_id_organization_id_fkey"
            columns: ["document_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "document_access_events_document_version_id_document_id_org_fkey"
            columns: ["document_version_id", "document_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id", "document_id", "organization_id"]
          },
          {
            foreignKeyName: "document_access_events_organization_id_actor_user_id_fkey"
            columns: ["organization_id", "actor_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "document_access_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_access_events_organization_membership_id_organiza_fkey"
            columns: ["organization_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      document_access_grants: {
        Row: {
          access_level: string
          capability: string | null
          created_at: string
          document_id: string
          document_version_id: string | null
          expires_at: string | null
          grant_status: string
          granted_by_user_id: string
          id: string
          metadata: Json
          organization_id: string
          organization_membership_id: string | null
          person_profile_id: string | null
          revoked_at: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          access_level?: string
          capability?: string | null
          created_at?: string
          document_id: string
          document_version_id?: string | null
          expires_at?: string | null
          grant_status?: string
          granted_by_user_id: string
          id?: string
          metadata?: Json
          organization_id: string
          organization_membership_id?: string | null
          person_profile_id?: string | null
          revoked_at?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          access_level?: string
          capability?: string | null
          created_at?: string
          document_id?: string
          document_version_id?: string | null
          expires_at?: string | null
          grant_status?: string
          granted_by_user_id?: string
          id?: string
          metadata?: Json
          organization_id?: string
          organization_membership_id?: string | null
          person_profile_id?: string | null
          revoked_at?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_access_grants_document_id_organization_id_fkey"
            columns: ["document_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "document_access_grants_document_version_id_document_id_org_fkey"
            columns: ["document_version_id", "document_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id", "document_id", "organization_id"]
          },
          {
            foreignKeyName: "document_access_grants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_access_grants_organization_id_granted_by_user_id_fkey"
            columns: ["organization_id", "granted_by_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "document_access_grants_organization_membership_id_organiza_fkey"
            columns: ["organization_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "document_access_grants_person_profile_id_organization_id_fkey"
            columns: ["person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      document_folder_access_grants: {
        Row: {
          access_level: string
          created_at: string
          expires_at: string | null
          folder_id: string
          grant_status: string
          granted_by_user_id: string
          id: string
          metadata: Json
          organization_id: string
          person_profile_id: string | null
          revoked_at: string | null
          role: string | null
          target_type: string
          updated_at: string
        }
        Insert: {
          access_level?: string
          created_at?: string
          expires_at?: string | null
          folder_id: string
          grant_status?: string
          granted_by_user_id: string
          id?: string
          metadata?: Json
          organization_id: string
          person_profile_id?: string | null
          revoked_at?: string | null
          role?: string | null
          target_type: string
          updated_at?: string
        }
        Update: {
          access_level?: string
          created_at?: string
          expires_at?: string | null
          folder_id?: string
          grant_status?: string
          granted_by_user_id?: string
          id?: string
          metadata?: Json
          organization_id?: string
          person_profile_id?: string | null
          revoked_at?: string | null
          role?: string | null
          target_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_folder_access_grants_folder_id_organization_id_fkey"
            columns: ["folder_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "document_folder_access_grants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_folder_access_grants_organization_id_granted_by_u_fkey"
            columns: ["organization_id", "granted_by_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "document_folder_access_grants_person_profile_id_organizati_fkey"
            columns: ["person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      document_folders: {
        Row: {
          created_at: string
          created_by_user_id: string
          description: string | null
          id: string
          metadata: Json
          name: string
          organization_id: string
          parent_folder_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          description?: string | null
          id?: string
          metadata?: Json
          name: string
          organization_id: string
          parent_folder_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          description?: string | null
          id?: string
          metadata?: Json
          name?: string
          organization_id?: string
          parent_folder_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_folders_organization_id_created_by_user_id_fkey"
            columns: ["organization_id", "created_by_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "document_folders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_folders_parent_folder_id_organization_id_fkey"
            columns: ["parent_folder_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      document_programming_links: {
        Row: {
          center_id: string | null
          class_type_id: string | null
          created_at: string
          created_by_user_id: string
          document_id: string
          document_version_id: string
          ends_on: string
          id: string
          organization_id: string
          schedule_block_id: string | null
          starts_on: string
          status: string
          updated_at: string
          updated_by_user_id: string
        }
        Insert: {
          center_id?: string | null
          class_type_id?: string | null
          created_at?: string
          created_by_user_id: string
          document_id: string
          document_version_id: string
          ends_on: string
          id?: string
          organization_id: string
          schedule_block_id?: string | null
          starts_on: string
          status?: string
          updated_at?: string
          updated_by_user_id: string
        }
        Update: {
          center_id?: string | null
          class_type_id?: string | null
          created_at?: string
          created_by_user_id?: string
          document_id?: string
          document_version_id?: string
          ends_on?: string
          id?: string
          organization_id?: string
          schedule_block_id?: string | null
          starts_on?: string
          status?: string
          updated_at?: string
          updated_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_programming_links_center_id_organization_id_fkey"
            columns: ["center_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "document_programming_links_class_type_id_organization_id_fkey"
            columns: ["class_type_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "class_types"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "document_programming_links_document_id_organization_id_fkey"
            columns: ["document_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "document_programming_links_document_version_id_document_id_fkey"
            columns: ["document_version_id", "document_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id", "document_id", "organization_id"]
          },
          {
            foreignKeyName: "document_programming_links_organization_id_created_by_user_fkey"
            columns: ["organization_id", "created_by_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "document_programming_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_programming_links_organization_id_updated_by_user_fkey"
            columns: ["organization_id", "updated_by_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "document_programming_links_schedule_block_id_organization__fkey"
            columns: ["schedule_block_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "schedule_blocks"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      document_subjects: {
        Row: {
          center_id: string | null
          class_type_id: string | null
          coach_profile_id: string | null
          created_at: string
          document_id: string
          id: string
          metadata: Json
          organization_id: string
          person_profile_id: string | null
          schedule_block_id: string | null
          status: string
          subject_type: string
          updated_at: string
        }
        Insert: {
          center_id?: string | null
          class_type_id?: string | null
          coach_profile_id?: string | null
          created_at?: string
          document_id: string
          id?: string
          metadata?: Json
          organization_id: string
          person_profile_id?: string | null
          schedule_block_id?: string | null
          status?: string
          subject_type: string
          updated_at?: string
        }
        Update: {
          center_id?: string | null
          class_type_id?: string | null
          coach_profile_id?: string | null
          created_at?: string
          document_id?: string
          id?: string
          metadata?: Json
          organization_id?: string
          person_profile_id?: string | null
          schedule_block_id?: string | null
          status?: string
          subject_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_subjects_center_id_organization_id_fkey"
            columns: ["center_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "document_subjects_class_type_id_organization_id_fkey"
            columns: ["class_type_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "class_types"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "document_subjects_coach_profile_id_organization_id_fkey"
            columns: ["coach_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "document_subjects_document_id_organization_id_fkey"
            columns: ["document_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "document_subjects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_subjects_person_profile_id_organization_id_fkey"
            columns: ["person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "document_subjects_schedule_block_id_organization_id_fkey"
            columns: ["schedule_block_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "schedule_blocks"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      document_versions: {
        Row: {
          activated_at: string | null
          archived_at: string | null
          created_at: string
          document_hash: string
          document_id: string
          id: string
          metadata: Json
          mime_type: string
          organization_id: string
          original_filename: string
          size_bytes: number
          status: string
          storage_bucket: string
          storage_path: string
          updated_at: string
          uploaded_by_user_id: string
          version_number: number
        }
        Insert: {
          activated_at?: string | null
          archived_at?: string | null
          created_at?: string
          document_hash: string
          document_id: string
          id?: string
          metadata?: Json
          mime_type: string
          organization_id: string
          original_filename: string
          size_bytes: number
          status?: string
          storage_bucket?: string
          storage_path: string
          updated_at?: string
          uploaded_by_user_id: string
          version_number: number
        }
        Update: {
          activated_at?: string | null
          archived_at?: string | null
          created_at?: string
          document_hash?: string
          document_id?: string
          id?: string
          metadata?: Json
          mime_type?: string
          organization_id?: string
          original_filename?: string
          size_bytes?: number
          status?: string
          storage_bucket?: string
          storage_path?: string
          updated_at?: string
          uploaded_by_user_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_organization_id_fkey"
            columns: ["document_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "document_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_organization_id_uploaded_by_user_id_fkey"
            columns: ["organization_id", "uploaded_by_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          created_by_user_id: string
          current_version_id: string | null
          description: string | null
          document_scope: string
          document_type: string
          folder_id: string | null
          id: string
          metadata: Json
          organization_id: string
          requires_signature: boolean
          sensitivity_level: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          current_version_id?: string | null
          description?: string | null
          document_scope: string
          document_type?: string
          folder_id?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          requires_signature?: boolean
          sensitivity_level?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          current_version_id?: string | null
          description?: string | null
          document_scope?: string
          document_type?: string
          folder_id?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          requires_signature?: boolean
          sensitivity_level?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_current_version_id_document_id_organization_id_fkey"
            columns: ["current_version_id", "id", "organization_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id", "document_id", "organization_id"]
          },
          {
            foreignKeyName: "documents_folder_fk"
            columns: ["folder_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "documents_organization_id_created_by_user_id_fkey"
            columns: ["organization_id", "created_by_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_audit_events: {
        Row: {
          action: string
          actor_membership_id: string | null
          actor_person_profile_id: string | null
          actor_user_id: string
          changed_fields: Json
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          organization_id: string
          platform_support_session_id: string | null
          result: string
          retain_until: string
        }
        Insert: {
          action: string
          actor_membership_id?: string | null
          actor_person_profile_id?: string | null
          actor_user_id: string
          changed_fields?: Json
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          organization_id: string
          platform_support_session_id?: string | null
          result?: string
          retain_until: string
        }
        Update: {
          action?: string
          actor_membership_id?: string | null
          actor_person_profile_id?: string | null
          actor_user_id?: string
          changed_fields?: Json
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          organization_id?: string
          platform_support_session_id?: string | null
          result?: string
          retain_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_audit_events_actor_membership_id_organization__fkey"
            columns: ["actor_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "operational_audit_events_actor_person_profile_id_organizat_fkey"
            columns: ["actor_person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "operational_audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_audit_events_platform_support_session_id_organizati"
            columns: ["platform_support_session_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "platform_support_sessions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      operational_events: {
        Row: {
          all_day: boolean
          archived_at: string | null
          cancelled_at: string | null
          center_id: string | null
          created_at: string
          created_by_membership_id: string | null
          ends_at: string | null
          event_type: string
          id: string
          impact_level: string
          notes: string | null
          organization_id: string
          retain_until: string
          starts_at: string
          status: string
          timezone: string
          title: string
          updated_at: string
          updated_by_membership_id: string | null
          visibility: string
        }
        Insert: {
          all_day?: boolean
          archived_at?: string | null
          cancelled_at?: string | null
          center_id?: string | null
          created_at?: string
          created_by_membership_id?: string | null
          ends_at?: string | null
          event_type: string
          id?: string
          impact_level?: string
          notes?: string | null
          organization_id: string
          retain_until?: string
          starts_at: string
          status?: string
          timezone: string
          title: string
          updated_at?: string
          updated_by_membership_id?: string | null
          visibility?: string
        }
        Update: {
          all_day?: boolean
          archived_at?: string | null
          cancelled_at?: string | null
          center_id?: string | null
          created_at?: string
          created_by_membership_id?: string | null
          ends_at?: string | null
          event_type?: string
          id?: string
          impact_level?: string
          notes?: string | null
          organization_id?: string
          retain_until?: string
          starts_at?: string
          status?: string
          timezone?: string
          title?: string
          updated_at?: string
          updated_by_membership_id?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_events_center_id_organization_id_fkey"
            columns: ["center_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "operational_events_created_by_membership_id_organization_i_fkey"
            columns: ["created_by_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "operational_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_events_updated_by_membership_id_organization_i_fkey"
            columns: ["updated_by_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          created_at: string
          id: string
          invited_at: string | null
          joined_at: string | null
          organization_id: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_at?: string | null
          joined_at?: string | null
          organization_id: string
          role?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_at?: string | null
          joined_at?: string | null
          organization_id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_subscriptions: {
        Row: {
          annual_price_cents: number | null
          billing_email: string | null
          billing_plan_version_id: string | null
          center_limit: number | null
          commercial_metadata: Json
          created_at: string
          created_by_platform_admin_id: string | null
          currency: string
          current_period_ends_at: string | null
          features: Json
          future_client_limit: number | null
          id: string
          monthly_price_cents: number | null
          organization_id: string
          plan_code: string
          plan_description: string | null
          plan_display_name: string | null
          plan_version: number | null
          provider: string
          provider_customer_ref: string | null
          provider_subscription_ref: string | null
          seat_limit: number | null
          setup_description: string | null
          setup_price_cents: number | null
          staff_seat_limit: number | null
          status: string
          storage_gb: number | null
          stripe_annual_price_id: string | null
          stripe_monthly_price_id: string | null
          stripe_product_id: string | null
          support_level: string | null
          trial_ends_at: string | null
          updated_at: string
          updated_by_platform_admin_id: string | null
        }
        Insert: {
          annual_price_cents?: number | null
          billing_email?: string | null
          billing_plan_version_id?: string | null
          center_limit?: number | null
          commercial_metadata?: Json
          created_at?: string
          created_by_platform_admin_id?: string | null
          currency?: string
          current_period_ends_at?: string | null
          features?: Json
          future_client_limit?: number | null
          id?: string
          monthly_price_cents?: number | null
          organization_id: string
          plan_code?: string
          plan_description?: string | null
          plan_display_name?: string | null
          plan_version?: number | null
          provider?: string
          provider_customer_ref?: string | null
          provider_subscription_ref?: string | null
          seat_limit?: number | null
          setup_description?: string | null
          setup_price_cents?: number | null
          staff_seat_limit?: number | null
          status?: string
          storage_gb?: number | null
          stripe_annual_price_id?: string | null
          stripe_monthly_price_id?: string | null
          stripe_product_id?: string | null
          support_level?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          updated_by_platform_admin_id?: string | null
        }
        Update: {
          annual_price_cents?: number | null
          billing_email?: string | null
          billing_plan_version_id?: string | null
          center_limit?: number | null
          commercial_metadata?: Json
          created_at?: string
          created_by_platform_admin_id?: string | null
          currency?: string
          current_period_ends_at?: string | null
          features?: Json
          future_client_limit?: number | null
          id?: string
          monthly_price_cents?: number | null
          organization_id?: string
          plan_code?: string
          plan_description?: string | null
          plan_display_name?: string | null
          plan_version?: number | null
          provider?: string
          provider_customer_ref?: string | null
          provider_subscription_ref?: string | null
          seat_limit?: number | null
          setup_description?: string | null
          setup_price_cents?: number | null
          staff_seat_limit?: number | null
          status?: string
          storage_gb?: number | null
          stripe_annual_price_id?: string | null
          stripe_monthly_price_id?: string | null
          stripe_product_id?: string | null
          support_level?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          updated_by_platform_admin_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_subscriptions_billing_plan_version_id_fkey"
            columns: ["billing_plan_version_id"]
            isOneToOne: false
            referencedRelation: "billing_plan_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_subscriptions_created_by_platform_admin_id_fkey"
            columns: ["created_by_platform_admin_id"]
            isOneToOne: false
            referencedRelation: "platform_admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_subscriptions_updated_by_platform_admin_id_fkey"
            columns: ["updated_by_platform_admin_id"]
            isOneToOne: false
            referencedRelation: "platform_admins"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          name: string
          slug: string
          status: string
          theme_config: Json
          time_tracking_config: Json
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          slug: string
          status?: string
          theme_config?: Json
          time_tracking_config?: Json
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          slug?: string
          status?: string
          theme_config?: Json
          time_tracking_config?: Json
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      overtime_candidate_events: {
        Row: {
          actor_membership_id: string
          actor_person_profile_id: string | null
          actor_user_id: string
          changed_fields: Json
          created_at: string
          event_type: string
          id: string
          new_status: string | null
          organization_id: string
          overtime_candidate_id: string
          previous_status: string | null
          result: string
          retain_until: string
        }
        Insert: {
          actor_membership_id: string
          actor_person_profile_id?: string | null
          actor_user_id: string
          changed_fields?: Json
          created_at?: string
          event_type: string
          id?: string
          new_status?: string | null
          organization_id: string
          overtime_candidate_id: string
          previous_status?: string | null
          result?: string
          retain_until?: string
        }
        Update: {
          actor_membership_id?: string
          actor_person_profile_id?: string | null
          actor_user_id?: string
          changed_fields?: Json
          created_at?: string
          event_type?: string
          id?: string
          new_status?: string | null
          organization_id?: string
          overtime_candidate_id?: string
          previous_status?: string | null
          result?: string
          retain_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "overtime_candidate_events_actor_membership_id_organization_fkey"
            columns: ["actor_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "overtime_candidate_events_actor_person_profile_id_organiza_fkey"
            columns: ["actor_person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "overtime_candidate_events_organization_id_actor_user_id_fkey"
            columns: ["organization_id", "actor_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "overtime_candidate_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_candidate_events_overtime_candidate_id_organizati_fkey"
            columns: ["overtime_candidate_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "overtime_candidates"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      overtime_candidate_sources: {
        Row: {
          created_at: string
          created_by_membership_id: string
          id: string
          organization_id: string
          overtime_candidate_id: string
          source_id: string | null
          source_type: string
        }
        Insert: {
          created_at?: string
          created_by_membership_id: string
          id?: string
          organization_id: string
          overtime_candidate_id: string
          source_id?: string | null
          source_type: string
        }
        Update: {
          created_at?: string
          created_by_membership_id?: string
          id?: string
          organization_id?: string
          overtime_candidate_id?: string
          source_id?: string | null
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "overtime_candidate_sources_created_by_membership_id_organi_fkey"
            columns: ["created_by_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "overtime_candidate_sources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_candidate_sources_overtime_candidate_id_organizat_fkey"
            columns: ["overtime_candidate_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "overtime_candidates"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      overtime_candidates: {
        Row: {
          candidate_minutes: number | null
          closed_at: string | null
          created_at: string
          created_by_membership_id: string
          detection_source: string
          id: string
          organization_id: string
          period_end_date: string
          period_start_date: string
          person_profile_id: string
          planned_minutes_snapshot: number
          retain_until: string
          reviewed_at: string | null
          reviewed_by_membership_id: string | null
          status: string
          timezone: string
          updated_at: string
          worked_minutes_snapshot: number
        }
        Insert: {
          candidate_minutes?: number | null
          closed_at?: string | null
          created_at?: string
          created_by_membership_id: string
          detection_source?: string
          id?: string
          organization_id: string
          period_end_date: string
          period_start_date: string
          person_profile_id: string
          planned_minutes_snapshot: number
          retain_until?: string
          reviewed_at?: string | null
          reviewed_by_membership_id?: string | null
          status?: string
          timezone: string
          updated_at?: string
          worked_minutes_snapshot: number
        }
        Update: {
          candidate_minutes?: number | null
          closed_at?: string | null
          created_at?: string
          created_by_membership_id?: string
          detection_source?: string
          id?: string
          organization_id?: string
          period_end_date?: string
          period_start_date?: string
          person_profile_id?: string
          planned_minutes_snapshot?: number
          retain_until?: string
          reviewed_at?: string | null
          reviewed_by_membership_id?: string | null
          status?: string
          timezone?: string
          updated_at?: string
          worked_minutes_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "overtime_candidates_created_by_membership_id_organization__fkey"
            columns: ["created_by_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "overtime_candidates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_candidates_person_profile_id_organization_id_fkey"
            columns: ["person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "overtime_candidates_reviewed_by_membership_id_organization_fkey"
            columns: ["reviewed_by_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      person_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          full_name: string | null
          id: string
          metadata: Json
          organization_id: string
          preferred_alias: string | null
          public_email: string | null
          status: string
          updated_at: string
          user_id: string | null
          visibility_status: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          full_name?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          preferred_alias?: string | null
          public_email?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          visibility_status?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          full_name?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          preferred_alias?: string | null
          public_email?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          visibility_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_profiles_organization_id_user_id_fkey"
            columns: ["organization_id", "user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          created_by_platform_admin_id: string | null
          display_name: string | null
          id: string
          notes: string | null
          role: string
          status: string
          updated_at: string
          updated_by_platform_admin_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by_platform_admin_id?: string | null
          display_name?: string | null
          id?: string
          notes?: string | null
          role: string
          status?: string
          updated_at?: string
          updated_by_platform_admin_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by_platform_admin_id?: string | null
          display_name?: string | null
          id?: string
          notes?: string | null
          role?: string
          status?: string
          updated_at?: string
          updated_by_platform_admin_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_admins_created_by_platform_admin_id_fkey"
            columns: ["created_by_platform_admin_id"]
            isOneToOne: false
            referencedRelation: "platform_admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_admins_updated_by_platform_admin_id_fkey"
            columns: ["updated_by_platform_admin_id"]
            isOneToOne: false
            referencedRelation: "platform_admins"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_audit_events: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          platform_admin_id: string
          result: string
          retain_until: string
          support_session_id: string | null
          target_organization_id: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          platform_admin_id: string
          result?: string
          retain_until?: string
          support_session_id?: string | null
          target_organization_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          platform_admin_id?: string
          result?: string
          retain_until?: string
          support_session_id?: string | null
          target_organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_audit_events_platform_admin_id_actor_user_id_fkey"
            columns: ["platform_admin_id", "actor_user_id"]
            isOneToOne: false
            referencedRelation: "platform_admins"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "platform_audit_events_support_session_id_target_organizati_fkey"
            columns: ["support_session_id", "target_organization_id"]
            isOneToOne: false
            referencedRelation: "platform_support_sessions"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "platform_audit_events_target_organization_id_fkey"
            columns: ["target_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_support_sessions: {
        Row: {
          actor_user_id: string
          created_at: string
          ended_at: string | null
          expires_at: string
          id: string
          metadata: Json
          organization_id: string
          platform_admin_id: string
          reason: string
          started_at: string
          status: string
          support_scope: string
          updated_at: string
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          ended_at?: string | null
          expires_at?: string
          id?: string
          metadata?: Json
          organization_id: string
          platform_admin_id: string
          reason: string
          started_at?: string
          status?: string
          support_scope?: string
          updated_at?: string
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          ended_at?: string | null
          expires_at?: string
          id?: string
          metadata?: Json
          organization_id?: string
          platform_admin_id?: string
          reason?: string
          started_at?: string
          status?: string
          support_scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_support_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_support_sessions_platform_admin_id_actor_user_id_fkey"
            columns: ["platform_admin_id", "actor_user_id"]
            isOneToOne: false
            referencedRelation: "platform_admins"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      profile_assets: {
        Row: {
          asset_hash: string
          asset_type: string
          created_at: string
          height: number | null
          id: string
          metadata: Json
          mime_type: string
          organization_id: string
          person_profile_id: string
          size_bytes: number
          status: string
          storage_bucket: string
          storage_path: string
          updated_at: string
          uploaded_by_user_id: string
          width: number | null
        }
        Insert: {
          asset_hash: string
          asset_type?: string
          created_at?: string
          height?: number | null
          id?: string
          metadata?: Json
          mime_type: string
          organization_id: string
          person_profile_id: string
          size_bytes: number
          status?: string
          storage_bucket?: string
          storage_path: string
          updated_at?: string
          uploaded_by_user_id: string
          width?: number | null
        }
        Update: {
          asset_hash?: string
          asset_type?: string
          created_at?: string
          height?: number | null
          id?: string
          metadata?: Json
          mime_type?: string
          organization_id?: string
          person_profile_id?: string
          size_bytes?: number
          status?: string
          storage_bucket?: string
          storage_path?: string
          updated_at?: string
          uploaded_by_user_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_assets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_assets_organization_id_uploaded_by_user_id_fkey"
            columns: ["organization_id", "uploaded_by_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "profile_assets_person_profile_id_organization_id_fkey"
            columns: ["person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      profile_signatures: {
        Row: {
          activated_at: string | null
          created_at: string
          height: number | null
          id: string
          metadata: Json
          mime_type: string
          organization_id: string
          person_profile_id: string
          signature_hash: string
          signature_version: number
          size_bytes: number
          status: string
          storage_bucket: string
          storage_path: string
          updated_at: string
          uploaded_by_user_id: string
          width: number | null
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          height?: number | null
          id?: string
          metadata?: Json
          mime_type?: string
          organization_id: string
          person_profile_id: string
          signature_hash: string
          signature_version: number
          size_bytes: number
          status?: string
          storage_bucket?: string
          storage_path: string
          updated_at?: string
          uploaded_by_user_id: string
          width?: number | null
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          height?: number | null
          id?: string
          metadata?: Json
          mime_type?: string
          organization_id?: string
          person_profile_id?: string
          signature_hash?: string
          signature_version?: number
          size_bytes?: number
          status?: string
          storage_bucket?: string
          storage_path?: string
          updated_at?: string
          uploaded_by_user_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_signatures_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_signatures_organization_id_uploaded_by_user_id_fkey"
            columns: ["organization_id", "uploaded_by_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "profile_signatures_person_profile_id_organization_id_fkey"
            columns: ["person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      schedule_block_assignments: {
        Row: {
          assignment_status: string
          coach_profile_id: string
          created_at: string
          id: string
          notes: string | null
          organization_id: string
          schedule_block_id: string
          source: string
          updated_at: string
        }
        Insert: {
          assignment_status?: string
          coach_profile_id: string
          created_at?: string
          id?: string
          notes?: string | null
          organization_id: string
          schedule_block_id: string
          source?: string
          updated_at?: string
        }
        Update: {
          assignment_status?: string
          coach_profile_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string
          schedule_block_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_block_assignments_coach_profile_id_organization_i_fkey"
            columns: ["coach_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "schedule_block_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_block_assignments_schedule_block_id_organization__fkey"
            columns: ["schedule_block_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "schedule_blocks"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      schedule_blocks: {
        Row: {
          center_id: string
          class_type_id: string
          created_at: string
          end_time: string
          id: string
          is_template_exception: boolean
          metadata: Json
          notes: string | null
          organization_id: string
          required_coaches: number
          service_date: string
          start_time: string
          status: string
          template_block_id: string | null
          template_id: string | null
          updated_at: string
        }
        Insert: {
          center_id: string
          class_type_id: string
          created_at?: string
          end_time: string
          id?: string
          is_template_exception?: boolean
          metadata?: Json
          notes?: string | null
          organization_id: string
          required_coaches?: number
          service_date: string
          start_time: string
          status?: string
          template_block_id?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          center_id?: string
          class_type_id?: string
          created_at?: string
          end_time?: string
          id?: string
          is_template_exception?: boolean
          metadata?: Json
          notes?: string | null
          organization_id?: string
          required_coaches?: number
          service_date?: string
          start_time?: string
          status?: string
          template_block_id?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_blocks_center_id_organization_id_fkey"
            columns: ["center_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "schedule_blocks_class_type_id_organization_id_fkey"
            columns: ["class_type_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "class_types"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "schedule_blocks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_blocks_template_block_id_organization_id_fkey"
            columns: ["template_block_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "schedule_template_blocks"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "schedule_blocks_template_id_organization_id_fkey"
            columns: ["template_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "schedule_templates"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      schedule_template_blocks: {
        Row: {
          center_id: string
          class_type_id: string
          created_at: string
          day_of_week: number
          default_coach_profile_id: string | null
          end_time: string
          id: string
          metadata: Json
          notes: string | null
          organization_id: string
          required_coaches: number
          start_time: string
          template_id: string
          updated_at: string
        }
        Insert: {
          center_id: string
          class_type_id: string
          created_at?: string
          day_of_week: number
          default_coach_profile_id?: string | null
          end_time: string
          id?: string
          metadata?: Json
          notes?: string | null
          organization_id: string
          required_coaches?: number
          start_time: string
          template_id: string
          updated_at?: string
        }
        Update: {
          center_id?: string
          class_type_id?: string
          created_at?: string
          day_of_week?: number
          default_coach_profile_id?: string | null
          end_time?: string
          id?: string
          metadata?: Json
          notes?: string | null
          organization_id?: string
          required_coaches?: number
          start_time?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_template_blocks_center_id_organization_id_fkey"
            columns: ["center_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "schedule_template_blocks_class_type_id_organization_id_fkey"
            columns: ["class_type_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "class_types"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "schedule_template_blocks_default_coach_profile_id_organiza_fkey"
            columns: ["default_coach_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "schedule_template_blocks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_template_blocks_template_id_organization_id_fkey"
            columns: ["template_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "schedule_templates"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      schedule_templates: {
        Row: {
          archived_at: string | null
          center_id: string | null
          created_at: string
          id: string
          metadata: Json
          name: string
          organization_id: string
          recoverable_until: string | null
          status: string
          template_type: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          archived_at?: string | null
          center_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          organization_id: string
          recoverable_until?: string | null
          status?: string
          template_type?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          archived_at?: string | null
          center_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          organization_id?: string
          recoverable_until?: string | null
          status?: string
          template_type?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_templates_center_id_organization_id_fkey"
            columns: ["center_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "schedule_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_work_windows: {
        Row: {
          center_id: string | null
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          notes: string | null
          organization_id: string
          person_profile_id: string
          start_time: string
          status: string
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          center_id?: string | null
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          notes?: string | null
          organization_id: string
          person_profile_id: string
          start_time: string
          status?: string
          updated_at?: string
          valid_from: string
          valid_until?: string | null
        }
        Update: {
          center_id?: string | null
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          notes?: string | null
          organization_id?: string
          person_profile_id?: string
          start_time?: string
          status?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_work_windows_center_id_organization_id_fkey"
            columns: ["center_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "staff_work_windows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_work_windows_person_profile_id_organization_id_fkey"
            columns: ["person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      team_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by_user_id: string | null
          coach_profile_id: string | null
          created_at: string
          email: string
          email_normalized: string
          expires_at: string
          id: string
          initial_access_status: string
          invited_by_membership_id: string | null
          invited_by_user_id: string | null
          last_error: string | null
          last_sent_at: string | null
          organization_id: string
          person_profile_id: string
          provider_message_id: string | null
          role: string
          send_count: number
          sent_at: string | null
          status: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          coach_profile_id?: string | null
          created_at?: string
          email: string
          email_normalized: string
          expires_at?: string
          id?: string
          initial_access_status?: string
          invited_by_membership_id?: string | null
          invited_by_user_id?: string | null
          last_error?: string | null
          last_sent_at?: string | null
          organization_id: string
          person_profile_id: string
          provider_message_id?: string | null
          role?: string
          send_count?: number
          sent_at?: string | null
          status?: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          coach_profile_id?: string | null
          created_at?: string
          email?: string
          email_normalized?: string
          expires_at?: string
          id?: string
          initial_access_status?: string
          invited_by_membership_id?: string | null
          invited_by_user_id?: string | null
          last_error?: string | null
          last_sent_at?: string | null
          organization_id?: string
          person_profile_id?: string
          provider_message_id?: string | null
          role?: string
          send_count?: number
          sent_at?: string | null
          status?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_coach_profile_id_organization_id_fkey"
            columns: ["coach_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "team_invitations_invited_by_membership_id_organization_id_fkey"
            columns: ["invited_by_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "team_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invitations_person_profile_id_organization_id_fkey"
            columns: ["person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      time_audit_events: {
        Row: {
          actor_membership_id: string | null
          actor_person_profile_id: string | null
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json
          organization_id: string
          result: string
          target_person_profile_id: string | null
          time_export_id: string | null
          time_punch_id: string | null
          time_record_correction_id: string | null
          time_record_id: string | null
          time_weekly_approval_id: string | null
        }
        Insert: {
          actor_membership_id?: string | null
          actor_person_profile_id?: string | null
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          organization_id: string
          result?: string
          target_person_profile_id?: string | null
          time_export_id?: string | null
          time_punch_id?: string | null
          time_record_correction_id?: string | null
          time_record_id?: string | null
          time_weekly_approval_id?: string | null
        }
        Update: {
          actor_membership_id?: string | null
          actor_person_profile_id?: string | null
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          organization_id?: string
          result?: string
          target_person_profile_id?: string | null
          time_export_id?: string | null
          time_punch_id?: string | null
          time_record_correction_id?: string | null
          time_record_id?: string | null
          time_weekly_approval_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_audit_events_actor_membership_id_organization_id_fkey"
            columns: ["actor_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_audit_events_actor_person_profile_id_organization_id_fkey"
            columns: ["actor_person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_audit_events_organization_id_actor_user_id_fkey"
            columns: ["organization_id", "actor_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "time_audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_audit_events_target_person_profile_id_organization_id_fkey"
            columns: ["target_person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_audit_events_time_export_id_organization_id_fkey"
            columns: ["time_export_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "time_exports"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_audit_events_time_punch_id_organization_id_fkey"
            columns: ["time_punch_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "time_punches"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_audit_events_time_record_correction_id_organization_i_fkey"
            columns: ["time_record_correction_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "time_record_corrections"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_audit_events_time_record_id_organization_id_fkey"
            columns: ["time_record_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "time_records"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_audit_events_time_weekly_approval_id_organization_id_fkey"
            columns: ["time_weekly_approval_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "time_weekly_approvals"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      time_exports: {
        Row: {
          center_id: string | null
          created_at: string
          date_from: string
          date_to: string
          export_format: string
          export_scope: string
          failure_reason: string | null
          generated_at: string | null
          id: string
          metadata: Json
          organization_id: string
          person_profile_id: string | null
          requested_by_membership_id: string | null
          requested_by_user_id: string
          row_count: number | null
          status: string
          updated_at: string
        }
        Insert: {
          center_id?: string | null
          created_at?: string
          date_from: string
          date_to: string
          export_format?: string
          export_scope?: string
          failure_reason?: string | null
          generated_at?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          person_profile_id?: string | null
          requested_by_membership_id?: string | null
          requested_by_user_id: string
          row_count?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          center_id?: string | null
          created_at?: string
          date_from?: string
          date_to?: string
          export_format?: string
          export_scope?: string
          failure_reason?: string | null
          generated_at?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          person_profile_id?: string | null
          requested_by_membership_id?: string | null
          requested_by_user_id?: string
          row_count?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_exports_center_id_organization_id_fkey"
            columns: ["center_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_exports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_exports_organization_id_requested_by_user_id_fkey"
            columns: ["organization_id", "requested_by_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "time_exports_person_profile_id_organization_id_fkey"
            columns: ["person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_exports_requested_by_membership_id_organization_id_fkey"
            columns: ["requested_by_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      time_location_events: {
        Row: {
          accuracy_bucket: string
          actor_membership_id: string | null
          actor_person_profile_id: string | null
          actor_user_id: string | null
          assist_result: string
          availability_status: string
          captured_at: string
          center_id: string | null
          center_time_location_setting_id: string | null
          created_at: string
          distance_bucket: string
          fallback_reason: string | null
          id: string
          organization_id: string
          person_profile_id: string | null
          policy_version: number | null
          purpose: string
          retain_until: string
          time_punch_id: string | null
          time_record_id: string | null
        }
        Insert: {
          accuracy_bucket?: string
          actor_membership_id?: string | null
          actor_person_profile_id?: string | null
          actor_user_id?: string | null
          assist_result: string
          availability_status: string
          captured_at?: string
          center_id?: string | null
          center_time_location_setting_id?: string | null
          created_at?: string
          distance_bucket?: string
          fallback_reason?: string | null
          id?: string
          organization_id: string
          person_profile_id?: string | null
          policy_version?: number | null
          purpose?: string
          retain_until: string
          time_punch_id?: string | null
          time_record_id?: string | null
        }
        Update: {
          accuracy_bucket?: string
          actor_membership_id?: string | null
          actor_person_profile_id?: string | null
          actor_user_id?: string | null
          assist_result?: string
          availability_status?: string
          captured_at?: string
          center_id?: string | null
          center_time_location_setting_id?: string | null
          created_at?: string
          distance_bucket?: string
          fallback_reason?: string | null
          id?: string
          organization_id?: string
          person_profile_id?: string | null
          policy_version?: number | null
          purpose?: string
          retain_until?: string
          time_punch_id?: string | null
          time_record_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_location_events_actor_membership_id_organization_id_fkey"
            columns: ["actor_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_location_events_actor_person_profile_id_organization__fkey"
            columns: ["actor_person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_location_events_center_id_organization_id_fkey"
            columns: ["center_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_location_events_center_time_location_setting_id_organ_fkey"
            columns: ["center_time_location_setting_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "center_time_location_settings"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_location_events_organization_id_actor_user_id_fkey"
            columns: ["organization_id", "actor_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "time_location_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_location_events_person_profile_id_organization_id_fkey"
            columns: ["person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_location_events_time_punch_id_organization_id_fkey"
            columns: ["time_punch_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "time_punches"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_location_events_time_record_id_organization_id_fkey"
            columns: ["time_record_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "time_records"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      time_punches: {
        Row: {
          center_id: string | null
          created_at: string
          created_by_membership_id: string | null
          created_by_user_id: string
          id: string
          metadata: Json
          notes: string | null
          occurred_at: string
          organization_id: string
          person_profile_id: string
          punch_type: string
          schedule_block_assignment_id: string | null
          schedule_block_id: string | null
          source: string
          status: string
          time_record_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          center_id?: string | null
          created_at?: string
          created_by_membership_id?: string | null
          created_by_user_id: string
          id?: string
          metadata?: Json
          notes?: string | null
          occurred_at: string
          organization_id: string
          person_profile_id: string
          punch_type: string
          schedule_block_assignment_id?: string | null
          schedule_block_id?: string | null
          source?: string
          status?: string
          time_record_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          center_id?: string | null
          created_at?: string
          created_by_membership_id?: string | null
          created_by_user_id?: string
          id?: string
          metadata?: Json
          notes?: string | null
          occurred_at?: string
          organization_id?: string
          person_profile_id?: string
          punch_type?: string
          schedule_block_assignment_id?: string | null
          schedule_block_id?: string | null
          source?: string
          status?: string
          time_record_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_punches_center_id_organization_id_fkey"
            columns: ["center_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_punches_created_by_membership_id_organization_id_fkey"
            columns: ["created_by_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_punches_organization_id_created_by_user_id_fkey"
            columns: ["organization_id", "created_by_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "time_punches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_punches_person_profile_id_organization_id_fkey"
            columns: ["person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_punches_schedule_block_assignment_id_organization_id_fkey"
            columns: ["schedule_block_assignment_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "schedule_block_assignments"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_punches_schedule_block_id_organization_id_fkey"
            columns: ["schedule_block_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "schedule_blocks"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_punches_time_record_id_organization_id_fkey"
            columns: ["time_record_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "time_records"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      time_record_corrections: {
        Row: {
          after_snapshot: Json
          applied_at: string | null
          before_snapshot: Json
          correction_type: string
          created_at: string
          id: string
          metadata: Json
          organization_id: string
          person_profile_id: string
          reason: string
          requested_by_membership_id: string | null
          requested_by_person_profile_id: string | null
          requested_by_user_id: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by_membership_id: string | null
          reviewed_by_person_profile_id: string | null
          reviewed_by_user_id: string | null
          status: string
          time_punch_id: string | null
          time_record_id: string
          updated_at: string
        }
        Insert: {
          after_snapshot: Json
          applied_at?: string | null
          before_snapshot?: Json
          correction_type?: string
          created_at?: string
          id?: string
          metadata?: Json
          organization_id: string
          person_profile_id: string
          reason: string
          requested_by_membership_id?: string | null
          requested_by_person_profile_id?: string | null
          requested_by_user_id: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by_membership_id?: string | null
          reviewed_by_person_profile_id?: string | null
          reviewed_by_user_id?: string | null
          status?: string
          time_punch_id?: string | null
          time_record_id: string
          updated_at?: string
        }
        Update: {
          after_snapshot?: Json
          applied_at?: string | null
          before_snapshot?: Json
          correction_type?: string
          created_at?: string
          id?: string
          metadata?: Json
          organization_id?: string
          person_profile_id?: string
          reason?: string
          requested_by_membership_id?: string | null
          requested_by_person_profile_id?: string | null
          requested_by_user_id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by_membership_id?: string | null
          reviewed_by_person_profile_id?: string | null
          reviewed_by_user_id?: string | null
          status?: string
          time_punch_id?: string | null
          time_record_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_record_corrections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_record_corrections_organization_id_requested_by_user__fkey"
            columns: ["organization_id", "requested_by_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "time_record_corrections_organization_id_reviewed_by_user_i_fkey"
            columns: ["organization_id", "reviewed_by_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "time_record_corrections_person_profile_id_organization_id_fkey"
            columns: ["person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_record_corrections_requested_by_membership_id_organiz_fkey"
            columns: ["requested_by_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_record_corrections_requested_by_person_profile_id_org_fkey"
            columns: ["requested_by_person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_record_corrections_reviewed_by_membership_id_organiza_fkey"
            columns: ["reviewed_by_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_record_corrections_reviewed_by_person_profile_id_orga_fkey"
            columns: ["reviewed_by_person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_record_corrections_time_punch_id_time_record_id_organ_fkey"
            columns: ["time_punch_id", "time_record_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "time_punches"
            referencedColumns: ["id", "time_record_id", "organization_id"]
          },
          {
            foreignKeyName: "time_record_corrections_time_record_id_organization_id_fkey"
            columns: ["time_record_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "time_records"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      time_records: {
        Row: {
          center_id: string | null
          created_at: string
          created_by_membership_id: string | null
          created_by_user_id: string
          id: string
          local_work_date: string
          metadata: Json
          organization_id: string
          person_profile_id: string
          planned_end_at: string | null
          planned_start_at: string | null
          schedule_block_assignment_id: string | null
          schedule_block_id: string | null
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          center_id?: string | null
          created_at?: string
          created_by_membership_id?: string | null
          created_by_user_id: string
          id?: string
          local_work_date: string
          metadata?: Json
          organization_id: string
          person_profile_id: string
          planned_end_at?: string | null
          planned_start_at?: string | null
          schedule_block_assignment_id?: string | null
          schedule_block_id?: string | null
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          center_id?: string | null
          created_at?: string
          created_by_membership_id?: string | null
          created_by_user_id?: string
          id?: string
          local_work_date?: string
          metadata?: Json
          organization_id?: string
          person_profile_id?: string
          planned_end_at?: string | null
          planned_start_at?: string | null
          schedule_block_assignment_id?: string | null
          schedule_block_id?: string | null
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_records_center_id_organization_id_fkey"
            columns: ["center_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_records_created_by_membership_id_organization_id_fkey"
            columns: ["created_by_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_records_organization_id_created_by_user_id_fkey"
            columns: ["organization_id", "created_by_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "time_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_records_person_profile_id_organization_id_fkey"
            columns: ["person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_records_schedule_block_assignment_id_organization_id_fkey"
            columns: ["schedule_block_assignment_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "schedule_block_assignments"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_records_schedule_block_id_organization_id_fkey"
            columns: ["schedule_block_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "schedule_blocks"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      time_weekly_approvals: {
        Row: {
          approval_note: string | null
          approval_signature_profile_signature_id: string | null
          approval_signature_snapshot: Json
          approved_at: string | null
          approved_by_membership_id: string | null
          approved_by_person_profile_id: string | null
          approved_by_user_id: string | null
          created_at: string
          created_by_membership_id: string | null
          created_by_user_id: string | null
          id: string
          metadata: Json
          notes: string | null
          organization_id: string
          person_profile_id: string
          rejected_at: string | null
          rejected_by_membership_id: string | null
          rejected_by_person_profile_id: string | null
          rejected_by_user_id: string | null
          rejection_note: string | null
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by_membership_id: string | null
          reopened_by_person_profile_id: string | null
          reopened_by_user_id: string | null
          snapshot: Json
          status: string
          submission_source: string
          submitted_at: string | null
          submitted_by_membership_id: string | null
          submitted_by_person_profile_id: string | null
          submitted_by_user_id: string | null
          updated_at: string
          week_start_date: string
        }
        Insert: {
          approval_note?: string | null
          approval_signature_profile_signature_id?: string | null
          approval_signature_snapshot?: Json
          approved_at?: string | null
          approved_by_membership_id?: string | null
          approved_by_person_profile_id?: string | null
          approved_by_user_id?: string | null
          created_at?: string
          created_by_membership_id?: string | null
          created_by_user_id?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          organization_id: string
          person_profile_id: string
          rejected_at?: string | null
          rejected_by_membership_id?: string | null
          rejected_by_person_profile_id?: string | null
          rejected_by_user_id?: string | null
          rejection_note?: string | null
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by_membership_id?: string | null
          reopened_by_person_profile_id?: string | null
          reopened_by_user_id?: string | null
          snapshot?: Json
          status?: string
          submission_source?: string
          submitted_at?: string | null
          submitted_by_membership_id?: string | null
          submitted_by_person_profile_id?: string | null
          submitted_by_user_id?: string | null
          updated_at?: string
          week_start_date: string
        }
        Update: {
          approval_note?: string | null
          approval_signature_profile_signature_id?: string | null
          approval_signature_snapshot?: Json
          approved_at?: string | null
          approved_by_membership_id?: string | null
          approved_by_person_profile_id?: string | null
          approved_by_user_id?: string | null
          created_at?: string
          created_by_membership_id?: string | null
          created_by_user_id?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          organization_id?: string
          person_profile_id?: string
          rejected_at?: string | null
          rejected_by_membership_id?: string | null
          rejected_by_person_profile_id?: string | null
          rejected_by_user_id?: string | null
          rejection_note?: string | null
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by_membership_id?: string | null
          reopened_by_person_profile_id?: string | null
          reopened_by_user_id?: string | null
          snapshot?: Json
          status?: string
          submission_source?: string
          submitted_at?: string | null
          submitted_by_membership_id?: string | null
          submitted_by_person_profile_id?: string | null
          submitted_by_user_id?: string | null
          updated_at?: string
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_weekly_approvals_approved_by_membership_id_organizati_fkey"
            columns: ["approved_by_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_weekly_approvals_approved_by_person_fkey"
            columns: ["approved_by_person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_weekly_approvals_created_by_membership_id_organizatio_fkey"
            columns: ["created_by_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_weekly_approvals_organization_id_approved_by_user_id_fkey"
            columns: ["organization_id", "approved_by_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "time_weekly_approvals_organization_id_created_by_user_id_fkey"
            columns: ["organization_id", "created_by_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "time_weekly_approvals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_weekly_approvals_organization_id_reopened_by_user_id_fkey"
            columns: ["organization_id", "reopened_by_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "time_weekly_approvals_person_profile_id_organization_id_fkey"
            columns: ["person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_weekly_approvals_rejected_by_membership_fkey"
            columns: ["rejected_by_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_weekly_approvals_rejected_by_person_fkey"
            columns: ["rejected_by_person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_weekly_approvals_rejected_by_user_fkey"
            columns: ["organization_id", "rejected_by_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "time_weekly_approvals_reopened_by_membership_id_organizati_fkey"
            columns: ["reopened_by_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_weekly_approvals_reopened_by_person_fkey"
            columns: ["reopened_by_person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_weekly_approvals_signature_fkey"
            columns: [
              "approval_signature_profile_signature_id",
              "organization_id",
            ]
            isOneToOne: false
            referencedRelation: "profile_signatures"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_weekly_approvals_submitted_by_membership_fkey"
            columns: ["submitted_by_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_weekly_approvals_submitted_by_person_fkey"
            columns: ["submitted_by_person_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_weekly_approvals_submitted_by_user_fkey"
            columns: ["organization_id", "submitted_by_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      absence_request_changed_fields_is_safe: {
        Args: { target_changed_fields: Json }
        Returns: boolean
      }
      absence_request_summary_is_safe: {
        Args: { target_summary: string }
        Returns: boolean
      }
      accept_team_invitation: {
        Args: { raw_invitation_token: string; target_invitation_id: string }
        Returns: {
          organization_id: string
        }[]
      }
      activate_document_version_upload: {
        Args: { target_document_version_id: string }
        Returns: {
          activated_at: string | null
          archived_at: string | null
          created_at: string
          document_hash: string
          document_id: string
          id: string
          metadata: Json
          mime_type: string
          organization_id: string
          original_filename: string
          size_bytes: number
          status: string
          storage_bucket: string
          storage_path: string
          updated_at: string
          uploaded_by_user_id: string
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "document_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      activate_own_profile_avatar_asset: {
        Args: { target_asset_id: string }
        Returns: {
          asset_hash: string
          asset_type: string
          created_at: string
          height: number | null
          id: string
          metadata: Json
          mime_type: string
          organization_id: string
          person_profile_id: string
          size_bytes: number
          status: string
          storage_bucket: string
          storage_path: string
          updated_at: string
          uploaded_by_user_id: string
          width: number | null
        }
        SetofOptions: {
          from: "*"
          to: "profile_assets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      activate_own_profile_signature: {
        Args: { target_signature_id: string }
        Returns: {
          activated_at: string | null
          created_at: string
          height: number | null
          id: string
          metadata: Json
          mime_type: string
          organization_id: string
          person_profile_id: string
          signature_hash: string
          signature_version: number
          size_bytes: number
          status: string
          storage_bucket: string
          storage_path: string
          updated_at: string
          uploaded_by_user_id: string
          width: number | null
        }
        SetofOptions: {
          from: "*"
          to: "profile_signatures"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_overtime_candidate_source: {
        Args: {
          target_organization_id: string
          target_overtime_candidate_id: string
          target_source_id?: string
          target_source_type: string
        }
        Returns: {
          created_at: string
          created_by_membership_id: string
          id: string
          organization_id: string
          overtime_candidate_id: string
          source_id: string | null
          source_type: string
        }
        SetofOptions: {
          from: "*"
          to: "overtime_candidate_sources"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_chatgpt_schedule_template_application: {
        Args: {
          target_center_id: string
          target_confirmation_id: string
          target_date_from: string
          target_date_to: string
          target_idempotency_key_hash: string
          target_organization_id: string
          target_plan_hash: string
          target_request_id: string
          target_template_id: string
          target_token_hash: string
        }
        Returns: Json
      }
      apply_approved_change_request: {
        Args: {
          target_change_request_id: string
          target_organization_id: string
        }
        Returns: {
          accepted_target_id: string | null
          applied_at: string | null
          applied_schedule_block_assignment_id: string | null
          approval_required: boolean
          created_at: string
          expires_at: string | null
          id: string
          organization_id: string
          reason_summary: string | null
          request_type: string
          requester_coach_profile_id: string
          requester_membership_id: string
          requester_person_profile_id: string
          resolved_at: string | null
          schedule_block_assignment_id: string
          schedule_block_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "change_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_time_record_correction: {
        Args: { target_correction_id: string; target_organization_id: string }
        Returns: {
          after_snapshot: Json
          applied_at: string | null
          before_snapshot: Json
          correction_type: string
          created_at: string
          id: string
          metadata: Json
          organization_id: string
          person_profile_id: string
          reason: string
          requested_by_membership_id: string | null
          requested_by_person_profile_id: string | null
          requested_by_user_id: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by_membership_id: string | null
          reviewed_by_person_profile_id: string | null
          reviewed_by_user_id: string | null
          status: string
          time_punch_id: string | null
          time_record_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "time_record_corrections"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_change_request: {
        Args: {
          target_change_request_id: string
          target_organization_id: string
        }
        Returns: {
          accepted_target_id: string | null
          applied_at: string | null
          applied_schedule_block_assignment_id: string | null
          approval_required: boolean
          created_at: string
          expires_at: string | null
          id: string
          organization_id: string
          reason_summary: string | null
          request_type: string
          requester_coach_profile_id: string
          requester_membership_id: string
          requester_person_profile_id: string
          resolved_at: string | null
          schedule_block_assignment_id: string
          schedule_block_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "change_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_time_weekly_approval: {
        Args: {
          target_approval_note?: string
          target_organization_id: string
          target_weekly_approval_id: string
        }
        Returns: {
          approval_note: string | null
          approval_signature_profile_signature_id: string | null
          approval_signature_snapshot: Json
          approved_at: string | null
          approved_by_membership_id: string | null
          approved_by_person_profile_id: string | null
          approved_by_user_id: string | null
          created_at: string
          created_by_membership_id: string | null
          created_by_user_id: string | null
          id: string
          metadata: Json
          notes: string | null
          organization_id: string
          person_profile_id: string
          rejected_at: string | null
          rejected_by_membership_id: string | null
          rejected_by_person_profile_id: string | null
          rejected_by_user_id: string | null
          rejection_note: string | null
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by_membership_id: string | null
          reopened_by_person_profile_id: string | null
          reopened_by_user_id: string | null
          snapshot: Json
          status: string
          submission_source: string
          submitted_at: string | null
          submitted_by_membership_id: string | null
          submitted_by_person_profile_id: string | null
          submitted_by_user_id: string | null
          updated_at: string
          week_start_date: string
        }
        SetofOptions: {
          from: "*"
          to: "time_weekly_approvals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      archive_billing_plan: {
        Args: { target_plan_code: string }
        Returns: {
          billing_plan_id: string
          plan_code: string
          status: string
        }[]
      }
      assign_organization_billing_plan_manual: {
        Args: {
          target_keep_center_ids?: string[]
          target_organization_id: string
          target_plan_code: string
          target_version?: number
        }
        Returns: {
          active_centers_count: number
          deactivated_centers_count: number
          organization_id: string
          plan_code: string
          plan_version: number
          subscription_id: string
        }[]
      }
      begin_document_version_upload: {
        Args: {
          target_document_hash: string
          target_document_id: string
          target_file_extension: string
          target_metadata?: Json
          target_mime_type: string
          target_organization_id: string
          target_original_filename: string
          target_size_bytes: number
        }
        Returns: {
          activated_at: string | null
          archived_at: string | null
          created_at: string
          document_hash: string
          document_id: string
          id: string
          metadata: Json
          mime_type: string
          organization_id: string
          original_filename: string
          size_bytes: number
          status: string
          storage_bucket: string
          storage_path: string
          updated_at: string
          uploaded_by_user_id: string
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "document_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      begin_own_profile_avatar_upload: {
        Args: {
          target_asset_hash: string
          target_file_extension: string
          target_height?: number
          target_mime_type: string
          target_organization_id: string
          target_size_bytes: number
          target_width?: number
        }
        Returns: {
          asset_hash: string
          asset_type: string
          created_at: string
          height: number | null
          id: string
          metadata: Json
          mime_type: string
          organization_id: string
          person_profile_id: string
          size_bytes: number
          status: string
          storage_bucket: string
          storage_path: string
          updated_at: string
          uploaded_by_user_id: string
          width: number | null
        }
        SetofOptions: {
          from: "*"
          to: "profile_assets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      begin_own_profile_signature_upload: {
        Args: {
          target_height?: number
          target_organization_id: string
          target_signature_hash: string
          target_size_bytes: number
          target_width?: number
        }
        Returns: {
          activated_at: string | null
          created_at: string
          height: number | null
          id: string
          metadata: Json
          mime_type: string
          organization_id: string
          person_profile_id: string
          signature_hash: string
          signature_version: number
          size_bytes: number
          status: string
          storage_bucket: string
          storage_path: string
          updated_at: string
          uploaded_by_user_id: string
          width: number | null
        }
        SetofOptions: {
          from: "*"
          to: "profile_signatures"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      billing_plan_features_are_safe: {
        Args: { target_features: Json }
        Returns: boolean
      }
      billing_plan_text_is_safe: {
        Args: { max_length: number; min_length: number; target_text: string }
        Returns: boolean
      }
      billing_stripe_price_ref_is_safe: {
        Args: { target_reference: string }
        Returns: boolean
      }
      billing_stripe_product_ref_is_safe: {
        Args: { target_reference: string }
        Returns: boolean
      }
      calculate_organization_billing_usage: {
        Args: { target_organization_id: string }
        Returns: {
          active_centers_count: number
          active_staff_count: number
          organization_id: string
          storage_used_gb: number
        }[]
      }
      can_access_document: {
        Args: {
          target_access_level?: string
          target_document_id: string
          target_document_version_id?: string
          target_organization_id: string
        }
        Returns: boolean
      }
      can_access_document_folder: {
        Args: {
          target_access_level?: string
          target_folder_id: string
          target_organization_id: string
        }
        Returns: boolean
      }
      can_activate_time_location_settings: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      can_change_organization_billing: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      can_manage_absence_requests: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      can_manage_billing_plan_catalog: { Args: never; Returns: boolean }
      can_manage_change_requests: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      can_manage_document_by_id: {
        Args: { target_document_id: string; target_organization_id: string }
        Returns: boolean
      }
      can_manage_document_folder_by_id: {
        Args: { target_folder_id: string; target_organization_id: string }
        Returns: boolean
      }
      can_manage_document_folder_metadata: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      can_manage_document_metadata: {
        Args: {
          target_document_scope: string
          target_organization_id: string
          target_sensitivity_level: string
        }
        Returns: boolean
      }
      can_manage_document_programming_link: {
        Args: {
          target_document_id: string
          target_document_version_id: string
          target_organization_id: string
        }
        Returns: boolean
      }
      can_manage_operational_events: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      can_manage_time_location_settings: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      can_manage_time_tracking: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      can_read_absence_request: {
        Args: {
          target_absence_request_id: string
          target_organization_id: string
        }
        Returns: boolean
      }
      can_read_billing_plan_catalog: { Args: never; Returns: boolean }
      can_read_change_request: {
        Args: {
          target_change_request_id: string
          target_organization_id: string
        }
        Returns: boolean
      }
      can_read_coverage_trace_events: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      can_read_document_access_events: {
        Args: { target_document_id: string; target_organization_id: string }
        Returns: boolean
      }
      can_read_operational_audit_events: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      can_read_operational_event: {
        Args: {
          target_operational_event_id: string
          target_organization_id: string
        }
        Returns: boolean
      }
      can_read_organization_billing: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      can_read_overtime_candidate: {
        Args: {
          target_organization_id: string
          target_overtime_candidate_id: string
        }
        Returns: boolean
      }
      can_read_platform_admin_row: {
        Args: { target_platform_admin_user_id: string }
        Returns: boolean
      }
      can_read_platform_audit_events: { Args: never; Returns: boolean }
      can_read_platform_subscription_rows: { Args: never; Returns: boolean }
      can_read_platform_support_sessions: { Args: never; Returns: boolean }
      can_review_overtime_candidates: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      can_use_absence_self_service: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      cancel_absence_request: {
        Args: {
          target_absence_request_id: string
          target_organization_id: string
        }
        Returns: {
          absence_type: string
          cancelled_at: string | null
          created_at: string
          expired_at: string | null
          expires_at: string | null
          id: string
          organization_id: string
          reason_summary: string | null
          requested_at: string
          requested_by_membership_id: string
          requested_by_person_profile_id: string
          requested_by_user_id: string
          resolved_at: string | null
          retain_until: string
          review_required: boolean
          reviewed_at: string | null
          reviewed_by_membership_id: string | null
          reviewed_by_person_profile_id: string | null
          status: string
          subject_coach_profile_id: string | null
          subject_person_profile_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "absence_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_change_request: {
        Args: {
          target_change_request_id: string
          target_organization_id: string
        }
        Returns: {
          accepted_target_id: string | null
          applied_at: string | null
          applied_schedule_block_assignment_id: string | null
          approval_required: boolean
          created_at: string
          expires_at: string | null
          id: string
          organization_id: string
          reason_summary: string | null
          request_type: string
          requester_coach_profile_id: string
          requester_membership_id: string
          requester_person_profile_id: string
          resolved_at: string | null
          schedule_block_assignment_id: string
          schedule_block_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "change_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_document_version_upload: {
        Args: { target_document_version_id: string }
        Returns: undefined
      }
      cancel_own_profile_avatar_upload: {
        Args: { target_asset_id: string }
        Returns: undefined
      }
      cancel_own_profile_signature_upload: {
        Args: { target_signature_id: string }
        Returns: undefined
      }
      change_request_changed_fields_is_safe: {
        Args: { target_changed_fields: Json }
        Returns: boolean
      }
      change_request_coach_belongs_to_current_user: {
        Args: {
          target_coach_profile_id: string
          target_organization_id: string
        }
        Returns: boolean
      }
      change_request_coach_has_block_overlap: {
        Args: {
          target_coach_profile_id: string
          target_organization_id: string
          target_schedule_block_id: string
        }
        Returns: boolean
      }
      change_request_coach_is_assignable: {
        Args: {
          target_coach_profile_id: string
          target_organization_id: string
        }
        Returns: boolean
      }
      change_request_current_actor_is_requester: {
        Args: {
          target_change_request_id: string
          target_organization_id: string
        }
        Returns: boolean
      }
      change_request_summary_is_safe: {
        Args: { target_summary: string }
        Returns: boolean
      }
      create_and_apply_own_time_record_correction: {
        Args: {
          target_after_snapshot: Json
          target_before_snapshot: Json
          target_correction_type: string
          target_metadata?: Json
          target_organization_id: string
          target_reason: string
          target_time_punch_id: string
          target_time_record_id: string
        }
        Returns: {
          after_snapshot: Json
          applied_at: string | null
          before_snapshot: Json
          correction_type: string
          created_at: string
          id: string
          metadata: Json
          organization_id: string
          person_profile_id: string
          reason: string
          requested_by_membership_id: string | null
          requested_by_person_profile_id: string | null
          requested_by_user_id: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by_membership_id: string | null
          reviewed_by_person_profile_id: string | null
          reviewed_by_user_id: string | null
          status: string
          time_punch_id: string | null
          time_record_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "time_record_corrections"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_billing_plan_draft_version: {
        Args: {
          target_annual_price_cents?: number
          target_center_limit?: number
          target_description: string
          target_display_name: string
          target_features?: Json
          target_future_client_limit?: number
          target_monthly_price_cents?: number
          target_plan_code: string
          target_setup_description?: string
          target_setup_price_cents?: number
          target_staff_seat_limit?: number
          target_storage_gb?: number
          target_stripe_annual_price_id?: string
          target_stripe_monthly_price_id?: string
          target_stripe_product_id?: string
          target_support_level?: string
        }
        Returns: {
          billing_plan_version_id: string
          plan_code: string
          status: string
          version: number
        }[]
      }
      create_document_programming_link: {
        Args: {
          target_center_id?: string
          target_class_type_id?: string
          target_document_id: string
          target_document_version_id: string
          target_ends_on?: string
          target_organization_id: string
          target_schedule_block_id?: string
          target_starts_on: string
        }
        Returns: {
          center_id: string | null
          class_type_id: string | null
          created_at: string
          created_by_user_id: string
          document_id: string
          document_version_id: string
          ends_on: string
          id: string
          organization_id: string
          schedule_block_id: string | null
          starts_on: string
          status: string
          updated_at: string
          updated_by_user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "document_programming_links"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_managed_change_request_with_targets: {
        Args: {
          target_expires_at?: string
          target_organization_id: string
          target_reason_summary?: string
          target_request_type?: string
          target_schedule_block_assignment_id: string
          target_schedule_block_id: string
          target_target_coach_profile_ids: string[]
        }
        Returns: {
          accepted_target_id: string | null
          applied_at: string | null
          applied_schedule_block_assignment_id: string | null
          approval_required: boolean
          created_at: string
          expires_at: string | null
          id: string
          organization_id: string
          reason_summary: string | null
          request_type: string
          requester_coach_profile_id: string
          requester_membership_id: string
          requester_person_profile_id: string
          resolved_at: string | null
          schedule_block_assignment_id: string
          schedule_block_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "change_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_operational_event: {
        Args: {
          target_all_day?: boolean
          target_center_id?: string
          target_ends_at?: string
          target_event_type: string
          target_impact_level?: string
          target_notes?: string
          target_organization_id: string
          target_starts_at: string
          target_timezone?: string
          target_title: string
          target_visibility?: string
        }
        Returns: {
          all_day: boolean
          archived_at: string | null
          cancelled_at: string | null
          center_id: string | null
          created_at: string
          created_by_membership_id: string | null
          ends_at: string | null
          event_type: string
          id: string
          impact_level: string
          notes: string | null
          organization_id: string
          retain_until: string
          starts_at: string
          status: string
          timezone: string
          title: string
          updated_at: string
          updated_by_membership_id: string | null
          visibility: string
        }
        SetofOptions: {
          from: "*"
          to: "operational_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_overtime_candidate_signal: {
        Args: {
          target_detection_source?: string
          target_organization_id: string
          target_period_end_date: string
          target_period_start_date: string
          target_person_profile_id: string
          target_planned_minutes?: number
          target_timezone?: string
          target_worked_minutes?: number
        }
        Returns: {
          candidate_minutes: number | null
          closed_at: string | null
          created_at: string
          created_by_membership_id: string
          detection_source: string
          id: string
          organization_id: string
          period_end_date: string
          period_start_date: string
          person_profile_id: string
          planned_minutes_snapshot: number
          retain_until: string
          reviewed_at: string | null
          reviewed_by_membership_id: string | null
          status: string
          timezone: string
          updated_at: string
          worked_minutes_snapshot: number
        }
        SetofOptions: {
          from: "*"
          to: "overtime_candidates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_own_absence_request: {
        Args: {
          target_absence_type: string
          target_all_day?: boolean
          target_ends_at: string
          target_expires_at?: string
          target_organization_id: string
          target_reason_summary?: string
          target_starts_at: string
          target_timezone?: string
        }
        Returns: {
          absence_type: string
          cancelled_at: string | null
          created_at: string
          expired_at: string | null
          expires_at: string | null
          id: string
          organization_id: string
          reason_summary: string | null
          requested_at: string
          requested_by_membership_id: string
          requested_by_person_profile_id: string
          requested_by_user_id: string
          resolved_at: string | null
          retain_until: string
          review_required: boolean
          reviewed_at: string | null
          reviewed_by_membership_id: string | null
          reviewed_by_person_profile_id: string | null
          status: string
          subject_coach_profile_id: string | null
          subject_person_profile_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "absence_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_own_change_request: {
        Args: {
          target_expires_at?: string
          target_organization_id: string
          target_reason_summary?: string
          target_request_type?: string
          target_schedule_block_assignment_id: string
          target_schedule_block_id: string
        }
        Returns: {
          accepted_target_id: string | null
          applied_at: string | null
          applied_schedule_block_assignment_id: string | null
          approval_required: boolean
          created_at: string
          expires_at: string | null
          id: string
          organization_id: string
          reason_summary: string | null
          request_type: string
          requester_coach_profile_id: string
          requester_membership_id: string
          requester_person_profile_id: string
          resolved_at: string | null
          schedule_block_assignment_id: string
          schedule_block_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "change_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_own_change_request_with_targets: {
        Args: {
          target_expires_at?: string
          target_organization_id: string
          target_reason_summary?: string
          target_request_type?: string
          target_schedule_block_assignment_id: string
          target_schedule_block_id: string
          target_target_coach_profile_ids: string[]
        }
        Returns: {
          accepted_target_id: string | null
          applied_at: string | null
          applied_schedule_block_assignment_id: string | null
          approval_required: boolean
          created_at: string
          expires_at: string | null
          id: string
          organization_id: string
          reason_summary: string | null
          request_type: string
          requester_coach_profile_id: string
          requester_membership_id: string
          requester_person_profile_id: string
          resolved_at: string | null
          schedule_block_assignment_id: string
          schedule_block_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "change_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_own_time_punch: {
        Args: {
          punch_metadata?: Json
          punch_notes?: string
          target_center_id?: string
          target_local_work_date?: string
          target_occurred_at?: string
          target_organization_id: string
          target_punch_type: string
          target_schedule_block_assignment_id?: string
          target_schedule_block_id?: string
        }
        Returns: {
          center_id: string | null
          created_at: string
          created_by_membership_id: string | null
          created_by_user_id: string
          id: string
          metadata: Json
          notes: string | null
          occurred_at: string
          organization_id: string
          person_profile_id: string
          punch_type: string
          schedule_block_assignment_id: string | null
          schedule_block_id: string | null
          source: string
          status: string
          time_record_id: string
          timezone: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "time_punches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_platform_organization_with_owner: {
        Args: {
          target_allow_platform_actor_as_owner?: boolean
          target_center_limit?: number
          target_organization_name: string
          target_organization_slug: string
          target_organization_status: string
          target_organization_timezone: string
          target_owner_display_name?: string
          target_owner_email: string
          target_owner_user_id?: string
          target_plan_code?: string
          target_seat_limit?: number
          target_subscription_status?: string
        }
        Returns: {
          created_membership_id: string
          created_organization_id: string
          created_person_profile_id: string
          created_subscription_id: string
          resolved_owner_user_id: string
        }[]
      }
      create_platform_support_session: {
        Args: {
          target_duration_minutes?: number
          target_organization_id: string
          target_reason: string
        }
        Returns: {
          audit_event_id: string
          expires_at: string
          organization_id: string
          organization_name: string
          started_at: string
          support_session_id: string
        }[]
      }
      document_access_event_metadata_is_safe: {
        Args: { target_metadata: Json }
        Returns: boolean
      }
      document_access_level_rank: {
        Args: { target_access_level: string }
        Returns: number
      }
      document_file_extension_matches_mime: {
        Args: { target_file_extension: string; target_mime_type: string }
        Returns: boolean
      }
      end_platform_support_session: {
        Args: { target_support_session_id: string }
        Returns: {
          audit_event_id: string
          ended_at: string
          ended_status: string
          organization_id: string
          support_session_id: string
        }[]
      }
      expire_absence_request: {
        Args: {
          target_absence_request_id: string
          target_organization_id: string
        }
        Returns: {
          absence_type: string
          cancelled_at: string | null
          created_at: string
          expired_at: string | null
          expires_at: string | null
          id: string
          organization_id: string
          reason_summary: string | null
          requested_at: string
          requested_by_membership_id: string
          requested_by_person_profile_id: string
          requested_by_user_id: string
          resolved_at: string | null
          retain_until: string
          review_required: boolean
          reviewed_at: string | null
          reviewed_by_membership_id: string | null
          reviewed_by_person_profile_id: string | null
          status: string
          subject_coach_profile_id: string | null
          subject_person_profile_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "absence_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      expire_change_request: {
        Args: {
          target_change_request_id: string
          target_organization_id: string
        }
        Returns: {
          accepted_target_id: string | null
          applied_at: string | null
          applied_schedule_block_assignment_id: string | null
          approval_required: boolean
          created_at: string
          expires_at: string | null
          id: string
          organization_id: string
          reason_summary: string | null
          request_type: string
          requester_coach_profile_id: string
          requester_membership_id: string
          requester_person_profile_id: string
          resolved_at: string | null
          schedule_block_assignment_id: string
          schedule_block_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "change_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_due_staff_work_window_auto_time_punches: {
        Args: { target_now?: string; target_organization_id?: string }
        Returns: {
          clock_in_punch_id: string
          clock_out_punch_id: string
          inserted_clock_in: boolean
          inserted_clock_out: boolean
          local_work_date: string
          organization_id: string
          skipped_reason: string
          staff_work_window_id: string
          time_record_id: string
        }[]
      }
      generate_schedule_auto_time_punches: {
        Args: {
          target_date_from: string
          target_date_to: string
          target_organization_id: string
          target_person_profile_id?: string
        }
        Returns: {
          clock_in_punch_id: string
          clock_out_punch_id: string
          inserted_clock_in: boolean
          inserted_clock_out: boolean
          schedule_block_assignment_id: string
          skipped_reason: string
          time_record_id: string
        }[]
      }
      generate_staff_work_window_auto_time_punches: {
        Args: {
          target_date_from: string
          target_date_to: string
          target_due_at?: string
          target_invocation_source?: string
          target_organization_id: string
          target_person_profile_id?: string
        }
        Returns: {
          clock_in_punch_id: string
          clock_out_punch_id: string
          inserted_clock_in: boolean
          inserted_clock_out: boolean
          local_work_date: string
          skipped_reason: string
          staff_work_window_id: string
          time_record_id: string
        }[]
      }
      get_active_membership_id: {
        Args: { target_organization_id: string }
        Returns: string
      }
      get_active_platform_admin_id: { Args: never; Returns: string }
      get_active_platform_support_session: {
        Args: { target_support_session_id: string }
        Returns: {
          actor_user_id: string
          expires_at: string
          organization_id: string
          organization_name: string
          organization_slug: string
          organization_status: string
          organization_theme_config: Json
          organization_time_tracking_config: Json
          organization_timezone: string
          platform_admin_id: string
          platform_role: string
          started_at: string
          support_scope: string
          support_session_id: string
        }[]
      }
      get_organization_billing_overview: {
        Args: { target_organization_id: string }
        Returns: {
          active_centers_count: number
          active_staff_count: number
          annual_price_cents: number
          billing_email: string
          billing_plan_version_id: string
          center_limit: number
          currency: string
          current_period_ends_at: string
          description: string
          display_name: string
          effective_center_limit: number
          effective_staff_seat_limit: number
          features: Json
          future_client_limit: number
          monthly_price_cents: number
          organization_id: string
          plan_code: string
          plan_version: number
          provider: string
          setup_description: string
          setup_price_cents: number
          staff_seat_limit: number
          storage_gb: number
          storage_used_gb: number
          subscription_id: string
          subscription_status: string
          support_level: string
          trial_ends_at: string
          updated_at: string
        }[]
      }
      get_own_person_profile_id: {
        Args: { target_organization_id: string }
        Returns: string
      }
      get_team_invitation_public: {
        Args: { raw_invitation_token: string; target_invitation_id: string }
        Returns: {
          display_name: string
          email: string
          expires_at: string
          id: string
          organization_id: string
          organization_name: string
          status: string
        }[]
      }
      has_active_coach_certification: {
        Args: {
          target_certification_id: string
          target_coach_profile_id: string
          target_organization_id: string
        }
        Returns: boolean
      }
      has_active_platform_support_session: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      has_any_tenant_billing_role: { Args: never; Returns: boolean }
      has_document_capability: {
        Args: { target_capability: string; target_organization_id: string }
        Returns: boolean
      }
      has_org_role: {
        Args: { allowed_roles: string[]; target_organization_id: string }
        Returns: boolean
      }
      has_platform_role: { Args: { allowed_roles: string[] }; Returns: boolean }
      is_active_platform_admin: { Args: never; Returns: boolean }
      is_org_member: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      is_schedule_auto_generation_context: { Args: never; Returns: boolean }
      is_time_correction_application_context: { Args: never; Returns: boolean }
      is_time_correction_direct_application_context: {
        Args: never
        Returns: boolean
      }
      is_time_weekly_approval_management_context: {
        Args: never
        Returns: boolean
      }
      list_absence_schedule_impacts: {
        Args: {
          target_absence_request_id: string
          target_organization_id: string
        }
        Returns: {
          absence_request_id: string
          absence_request_period_id: string
          impact_status: string
          organization_id: string
          schedule_block_assignment_id: string
          schedule_block_id: string
          subject_coach_profile_id: string
        }[]
      }
      list_accessible_document_folders: {
        Args: { target_organization_id: string }
        Returns: {
          can_manage: boolean
          created_at: string
          description: string
          document_count: number
          folder_id: string
          name: string
          organization_id: string
          parent_folder_id: string
          status: string
          updated_at: string
        }[]
      }
      list_accessible_document_versions: {
        Args: {
          target_document_scope?: string
          target_folder_id?: string
          target_limit?: number
          target_organization_id: string
        }
        Returns: {
          activated_at: string
          archived_at: string
          can_download: boolean
          can_preview: boolean
          description: string
          document_id: string
          document_scope: string
          document_status: string
          document_type: string
          document_updated_at: string
          document_version_id: string
          folder_id: string
          folder_name: string
          mime_type: string
          organization_id: string
          original_filename: string
          sensitivity_level: string
          size_bytes: number
          title: string
          version_number: number
          version_status: string
          version_updated_at: string
        }[]
      }
      list_billing_active_centers: {
        Args: { target_organization_id: string }
        Returns: {
          center_id: string
          center_name: string
          center_slug: string
        }[]
      }
      list_console_billing_plan_versions: {
        Args: never
        Returns: {
          annual_price_cents: number
          archived_at: string
          billing_plan_id: string
          billing_plan_status: string
          billing_plan_version_id: string
          center_limit: number
          created_at: string
          currency: string
          description: string
          display_name: string
          features: Json
          future_client_limit: number
          monthly_price_cents: number
          plan_code: string
          published_at: string
          setup_description: string
          setup_price_cents: number
          staff_seat_limit: number
          status: string
          storage_gb: number
          stripe_annual_price_id: string
          stripe_monthly_price_id: string
          stripe_product_id: string
          support_level: string
          updated_at: string
          version: number
        }[]
      }
      list_coverage_trace_audit_events: {
        Args: {
          target_limit?: number
          target_organization_id: string
          target_schedule_block_ids?: string[]
        }
        Returns: {
          action: string
          actor_membership_id: string | null
          actor_person_profile_id: string | null
          actor_user_id: string
          changed_fields: Json
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          organization_id: string
          platform_support_session_id: string | null
          result: string
          retain_until: string
        }[]
        SetofOptions: {
          from: "*"
          to: "operational_audit_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_document_access_events_for_document: {
        Args: {
          target_document_id: string
          target_limit?: number
          target_organization_id: string
        }
        Returns: {
          access_level: string | null
          actor_person_profile_id: string | null
          actor_user_id: string
          created_at: string
          document_id: string
          document_version_id: string | null
          event_type: string
          id: string
          metadata: Json
          organization_id: string
          organization_membership_id: string
          result: string
        }[]
        SetofOptions: {
          from: "*"
          to: "document_access_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_document_programming_for_block: {
        Args: {
          target_access_level?: string
          target_limit?: number
          target_organization_id: string
          target_schedule_block_id: string
        }
        Returns: {
          can_download: boolean
          can_preview: boolean
          center_id: string
          class_type_id: string
          created_at: string
          document_id: string
          document_status: string
          document_title: string
          document_type: string
          document_version_id: string
          ends_on: string
          link_status: string
          mime_type: string
          organization_id: string
          original_filename: string
          programming_link_id: string
          schedule_block_id: string
          size_bytes: number
          starts_on: string
          updated_at: string
          version_number: number
          version_status: string
        }[]
      }
      list_document_programming_for_context: {
        Args: {
          target_access_level?: string
          target_center_id?: string
          target_class_type_id?: string
          target_limit?: number
          target_organization_id: string
          target_service_date: string
        }
        Returns: {
          can_download: boolean
          can_preview: boolean
          center_id: string
          class_type_id: string
          created_at: string
          document_id: string
          document_status: string
          document_title: string
          document_type: string
          document_version_id: string
          ends_on: string
          link_status: string
          mime_type: string
          organization_id: string
          original_filename: string
          programming_link_id: string
          schedule_block_id: string
          size_bytes: number
          starts_on: string
          updated_at: string
          version_number: number
          version_status: string
        }[]
      }
      list_operational_audit_events: {
        Args: {
          target_entity_type?: string
          target_limit?: number
          target_organization_id: string
        }
        Returns: {
          action: string
          actor_membership_id: string | null
          actor_person_profile_id: string | null
          actor_user_id: string
          changed_fields: Json
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          organization_id: string
          platform_support_session_id: string | null
          result: string
          retain_until: string
        }[]
        SetofOptions: {
          from: "*"
          to: "operational_audit_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_overtime_candidates: {
        Args: {
          target_limit?: number
          target_organization_id: string
          target_period_end_date?: string
          target_period_start_date?: string
          target_person_profile_id?: string
          target_status?: string
        }
        Returns: {
          candidate_minutes: number | null
          closed_at: string | null
          created_at: string
          created_by_membership_id: string
          detection_source: string
          id: string
          organization_id: string
          period_end_date: string
          period_start_date: string
          person_profile_id: string
          planned_minutes_snapshot: number
          retain_until: string
          reviewed_at: string | null
          reviewed_by_membership_id: string | null
          status: string
          timezone: string
          updated_at: string
          worked_minutes_snapshot: number
        }[]
        SetofOptions: {
          from: "*"
          to: "overtime_candidates"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_own_time_location_events: {
        Args: {
          target_captured_from?: string
          target_captured_to?: string
          target_limit?: number
          target_organization_id: string
        }
        Returns: {
          accuracy_bucket: string
          actor_membership_id: string | null
          actor_person_profile_id: string | null
          actor_user_id: string | null
          assist_result: string
          availability_status: string
          captured_at: string
          center_id: string | null
          center_time_location_setting_id: string | null
          created_at: string
          distance_bucket: string
          fallback_reason: string | null
          id: string
          organization_id: string
          person_profile_id: string | null
          policy_version: number | null
          purpose: string
          retain_until: string
          time_punch_id: string | null
          time_record_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "time_location_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_platform_organization_summaries: {
        Args: {
          target_limit?: number
          target_status?: string
          target_subscription_status?: string
        }
        Returns: {
          active_centers_count: number
          active_coaches_count: number
          active_users_count: number
          center_limit: number
          current_period_ends_at: string
          organization_created_at: string
          organization_id: string
          organization_name: string
          organization_slug: string
          organization_status: string
          plan_code: string
          seat_limit: number
          subscription_status: string
          trial_ends_at: string
        }[]
      }
      list_published_billing_plan_versions: {
        Args: never
        Returns: {
          annual_price_cents: number
          billing_plan_id: string
          billing_plan_version_id: string
          center_limit: number
          currency: string
          description: string
          display_name: string
          features: Json
          future_client_limit: number
          monthly_price_cents: number
          plan_code: string
          published_at: string
          setup_description: string
          setup_price_cents: number
          staff_seat_limit: number
          storage_gb: number
          stripe_annual_price_id: string
          stripe_monthly_price_id: string
          stripe_product_id: string
          support_level: string
          version: number
        }[]
      }
      list_time_location_events_for_record: {
        Args: {
          target_limit?: number
          target_organization_id: string
          target_time_record_id: string
        }
        Returns: {
          accuracy_bucket: string
          actor_membership_id: string | null
          actor_person_profile_id: string | null
          actor_user_id: string | null
          assist_result: string
          availability_status: string
          captured_at: string
          center_id: string | null
          center_time_location_setting_id: string | null
          created_at: string
          distance_bucket: string
          fallback_reason: string | null
          id: string
          organization_id: string
          person_profile_id: string | null
          policy_version: number | null
          purpose: string
          retain_until: string
          time_punch_id: string | null
          time_record_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "time_location_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      lock_schedule_coach_assignment_window: {
        Args: {
          target_coach_profile_id: string
          target_organization_id: string
          target_service_date: string
        }
        Returns: undefined
      }
      lock_staff_work_window_person_day: {
        Args: {
          target_day_of_week: number
          target_organization_id: string
          target_person_profile_id: string
        }
        Returns: undefined
      }
      offer_change_request_to_coach: {
        Args: {
          target_change_request_id: string
          target_coach_profile_id: string
          target_expires_at?: string
          target_organization_id: string
          target_target_type?: string
        }
        Returns: {
          change_request_id: string
          expires_at: string | null
          id: string
          offered_at: string
          organization_id: string
          responded_at: string | null
          response_note_summary: string | null
          status: string
          target_coach_profile_id: string
          target_type: string
        }
        SetofOptions: {
          from: "*"
          to: "change_request_targets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      operational_audit_changed_fields_is_safe: {
        Args: { target_changed_fields: Json }
        Returns: boolean
      }
      operational_audit_entity_action_is_allowed: {
        Args: { target_action: string; target_entity_type: string }
        Returns: boolean
      }
      operational_audit_entity_exists: {
        Args: {
          target_entity_id: string
          target_entity_type: string
          target_organization_id: string
        }
        Returns: boolean
      }
      operational_audit_retention_days: {
        Args: { target_entity_type: string }
        Returns: number
      }
      operational_event_notes_are_safe: {
        Args: { target_notes: string }
        Returns: boolean
      }
      operational_event_retain_until: {
        Args: {
          target_closed_at?: string
          target_ends_at: string
          target_starts_at: string
          target_status: string
        }
        Returns: string
      }
      operational_event_title_is_safe: {
        Args: { target_title: string }
        Returns: boolean
      }
      overtime_candidate_changed_fields_is_safe: {
        Args: { target_changed_fields: Json }
        Returns: boolean
      }
      overtime_candidate_source_belongs_to_org: {
        Args: {
          target_organization_id: string
          target_overtime_candidate_id: string
          target_source_id: string
          target_source_type: string
        }
        Returns: boolean
      }
      platform_metadata_is_safe: {
        Args: { target_metadata: Json }
        Returns: boolean
      }
      platform_reason_is_safe: {
        Args: { target_reason: string }
        Returns: boolean
      }
      platform_ref_is_safe: {
        Args: { target_reference: string }
        Returns: boolean
      }
      publish_billing_plan_version: {
        Args: { target_billing_plan_version_id: string }
        Returns: {
          billing_plan_version_id: string
          plan_code: string
          status: string
          version: number
        }[]
      }
      purge_expired_operational_audit_events: {
        Args: { target_batch_size?: number }
        Returns: number
      }
      record_absence_request_event_internal: {
        Args: {
          target_absence_request_id: string
          target_changed_fields: Json
          target_event_type: string
          target_organization_id: string
          target_result: string
        }
        Returns: {
          absence_request_id: string
          actor_membership_id: string
          actor_person_profile_id: string | null
          actor_user_id: string
          changed_fields: Json
          created_at: string
          event_type: string
          id: string
          organization_id: string
          result: string
          retain_until: string
        }
        SetofOptions: {
          from: "*"
          to: "absence_request_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_change_request_application_failure_internal: {
        Args: {
          target_change_request_id: string
          target_change_request_target_id: string
          target_changed_fields?: Json
          target_failure_code: string
          target_failure_stage: string
          target_organization_id: string
        }
        Returns: {
          accepted_target_id: string | null
          applied_at: string | null
          applied_schedule_block_assignment_id: string | null
          approval_required: boolean
          created_at: string
          expires_at: string | null
          id: string
          organization_id: string
          reason_summary: string | null
          request_type: string
          requester_coach_profile_id: string
          requester_membership_id: string
          requester_person_profile_id: string
          resolved_at: string | null
          schedule_block_assignment_id: string
          schedule_block_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "change_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_change_request_event: {
        Args: {
          target_change_request_id: string
          target_change_request_target_id?: string
          target_changed_fields?: Json
          target_event_type: string
          target_organization_id: string
          target_result?: string
        }
        Returns: {
          actor_coach_profile_id: string | null
          actor_membership_id: string
          actor_person_profile_id: string | null
          actor_user_id: string
          change_request_id: string
          change_request_target_id: string | null
          changed_fields: Json
          created_at: string
          event_type: string
          id: string
          organization_id: string
          result: string
          retain_until: string
        }
        SetofOptions: {
          from: "*"
          to: "change_request_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_change_request_event_internal: {
        Args: {
          target_actor_coach_profile_id: string
          target_change_request_id: string
          target_change_request_target_id: string
          target_changed_fields: Json
          target_event_type: string
          target_organization_id: string
          target_result: string
        }
        Returns: {
          actor_coach_profile_id: string | null
          actor_membership_id: string
          actor_person_profile_id: string | null
          actor_user_id: string
          change_request_id: string
          change_request_target_id: string | null
          changed_fields: Json
          created_at: string
          event_type: string
          id: string
          organization_id: string
          result: string
          retain_until: string
        }
        SetofOptions: {
          from: "*"
          to: "change_request_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_document_access_event: {
        Args: {
          target_access_level?: string
          target_document_id: string
          target_document_version_id: string
          target_event_type: string
          target_metadata?: Json
          target_organization_id: string
          target_result?: string
        }
        Returns: {
          access_level: string | null
          actor_person_profile_id: string | null
          actor_user_id: string
          created_at: string
          document_id: string
          document_version_id: string | null
          event_type: string
          id: string
          metadata: Json
          organization_id: string
          organization_membership_id: string
          result: string
        }
        SetofOptions: {
          from: "*"
          to: "document_access_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_operational_audit_event: {
        Args: {
          target_action: string
          target_changed_fields?: Json
          target_entity_id: string
          target_entity_type: string
          target_organization_id: string
          target_result?: string
        }
        Returns: {
          action: string
          actor_membership_id: string | null
          actor_person_profile_id: string | null
          actor_user_id: string
          changed_fields: Json
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          organization_id: string
          platform_support_session_id: string | null
          result: string
          retain_until: string
        }
        SetofOptions: {
          from: "*"
          to: "operational_audit_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_overtime_candidate_event_internal: {
        Args: {
          target_changed_fields?: Json
          target_event_type: string
          target_new_status?: string
          target_organization_id: string
          target_overtime_candidate_id: string
          target_previous_status?: string
          target_result?: string
        }
        Returns: {
          actor_membership_id: string
          actor_person_profile_id: string | null
          actor_user_id: string
          changed_fields: Json
          created_at: string
          event_type: string
          id: string
          new_status: string | null
          organization_id: string
          overtime_candidate_id: string
          previous_status: string | null
          result: string
          retain_until: string
        }
        SetofOptions: {
          from: "*"
          to: "overtime_candidate_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_own_time_location_event: {
        Args: {
          target_accuracy_bucket?: string
          target_assist_result: string
          target_availability_status: string
          target_captured_at?: string
          target_center_id?: string
          target_distance_bucket?: string
          target_fallback_reason?: string
          target_organization_id: string
          target_purpose?: string
          target_time_punch_id?: string
          target_time_record_id?: string
        }
        Returns: {
          accuracy_bucket: string
          actor_membership_id: string | null
          actor_person_profile_id: string | null
          actor_user_id: string | null
          assist_result: string
          availability_status: string
          captured_at: string
          center_id: string | null
          center_time_location_setting_id: string | null
          created_at: string
          distance_bucket: string
          fallback_reason: string | null
          id: string
          organization_id: string
          person_profile_id: string | null
          policy_version: number | null
          purpose: string
          retain_until: string
          time_punch_id: string | null
          time_record_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "time_location_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_platform_audit_event: {
        Args: {
          target_action: string
          target_entity_id?: string
          target_entity_type: string
          target_metadata?: Json
          target_result?: string
          target_support_session_id?: string
          target_target_organization_id?: string
        }
        Returns: {
          action: string
          actor_user_id: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          platform_admin_id: string
          result: string
          retain_until: string
          support_session_id: string | null
          target_organization_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "platform_audit_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_change_request: {
        Args: {
          target_change_request_id: string
          target_organization_id: string
        }
        Returns: {
          accepted_target_id: string | null
          applied_at: string | null
          applied_schedule_block_assignment_id: string | null
          approval_required: boolean
          created_at: string
          expires_at: string | null
          id: string
          organization_id: string
          reason_summary: string | null
          request_type: string
          requester_coach_profile_id: string
          requester_membership_id: string
          requester_person_profile_id: string
          resolved_at: string | null
          schedule_block_assignment_id: string
          schedule_block_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "change_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_time_weekly_approval: {
        Args: {
          target_organization_id: string
          target_rejection_note: string
          target_rejection_status?: string
          target_weekly_approval_id: string
        }
        Returns: {
          approval_note: string | null
          approval_signature_profile_signature_id: string | null
          approval_signature_snapshot: Json
          approved_at: string | null
          approved_by_membership_id: string | null
          approved_by_person_profile_id: string | null
          approved_by_user_id: string | null
          created_at: string
          created_by_membership_id: string | null
          created_by_user_id: string | null
          id: string
          metadata: Json
          notes: string | null
          organization_id: string
          person_profile_id: string
          rejected_at: string | null
          rejected_by_membership_id: string | null
          rejected_by_person_profile_id: string | null
          rejected_by_user_id: string | null
          rejection_note: string | null
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by_membership_id: string | null
          reopened_by_person_profile_id: string | null
          reopened_by_user_id: string | null
          snapshot: Json
          status: string
          submission_source: string
          submitted_at: string | null
          submitted_by_membership_id: string | null
          submitted_by_person_profile_id: string | null
          submitted_by_user_id: string | null
          updated_at: string
          week_start_date: string
        }
        SetofOptions: {
          from: "*"
          to: "time_weekly_approvals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reopen_time_weekly_approval: {
        Args: {
          target_organization_id: string
          target_reopen_reason: string
          target_weekly_approval_id: string
        }
        Returns: {
          approval_note: string | null
          approval_signature_profile_signature_id: string | null
          approval_signature_snapshot: Json
          approved_at: string | null
          approved_by_membership_id: string | null
          approved_by_person_profile_id: string | null
          approved_by_user_id: string | null
          created_at: string
          created_by_membership_id: string | null
          created_by_user_id: string | null
          id: string
          metadata: Json
          notes: string | null
          organization_id: string
          person_profile_id: string
          rejected_at: string | null
          rejected_by_membership_id: string | null
          rejected_by_person_profile_id: string | null
          rejected_by_user_id: string | null
          rejection_note: string | null
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by_membership_id: string | null
          reopened_by_person_profile_id: string | null
          reopened_by_user_id: string | null
          snapshot: Json
          status: string
          submission_source: string
          submitted_at: string | null
          submitted_by_membership_id: string | null
          submitted_by_person_profile_id: string | null
          submitted_by_user_id: string | null
          updated_at: string
          week_start_date: string
        }
        SetofOptions: {
          from: "*"
          to: "time_weekly_approvals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_time_record_for_correction_punch: {
        Args: {
          target_center_id: string
          target_correction_id: string
          target_local_work_date: string
          target_membership_id: string
          target_organization_id: string
          target_person_profile_id: string
          target_source: string
          target_timezone: string
          target_user_id: string
        }
        Returns: {
          center_id: string | null
          created_at: string
          created_by_membership_id: string | null
          created_by_user_id: string
          id: string
          local_work_date: string
          metadata: Json
          organization_id: string
          person_profile_id: string
          planned_end_at: string | null
          planned_start_at: string | null
          schedule_block_assignment_id: string | null
          schedule_block_id: string | null
          status: string
          timezone: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "time_records"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_to_change_request_target: {
        Args: {
          target_change_request_target_id: string
          target_organization_id: string
          target_response: string
          target_response_note_summary?: string
        }
        Returns: {
          change_request_id: string
          expires_at: string | null
          id: string
          offered_at: string
          organization_id: string
          responded_at: string | null
          response_note_summary: string | null
          status: string
          target_coach_profile_id: string
          target_type: string
        }
        SetofOptions: {
          from: "*"
          to: "change_request_targets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_absence_request: {
        Args: {
          target_absence_request_id: string
          target_decision: string
          target_organization_id: string
        }
        Returns: {
          absence_type: string
          cancelled_at: string | null
          created_at: string
          expired_at: string | null
          expires_at: string | null
          id: string
          organization_id: string
          reason_summary: string | null
          requested_at: string
          requested_by_membership_id: string
          requested_by_person_profile_id: string
          requested_by_user_id: string
          resolved_at: string | null
          retain_until: string
          review_required: boolean
          reviewed_at: string | null
          reviewed_by_membership_id: string | null
          reviewed_by_person_profile_id: string | null
          status: string
          subject_coach_profile_id: string | null
          subject_person_profile_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "absence_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      schedule_block_accepts_active_assignment: {
        Args: { target_status: string }
        Returns: boolean
      }
      set_center_time_location_setting_status: {
        Args: {
          target_center_id: string
          target_change_reason?: string
          target_organization_id: string
          target_status: string
        }
        Returns: {
          activated_at: string | null
          center_id: string
          center_latitude: number
          center_longitude: number
          change_reason: string | null
          created_at: string
          created_by_membership_id: string
          created_by_user_id: string
          deactivated_at: string | null
          fallback_retention_days: number
          id: string
          max_accuracy_meters: number
          notice_text: string
          organization_id: string
          policy_version: number
          radius_meters: number
          retention_days: number
          status: string
          timezone: string
          updated_at: string
          updated_by_membership_id: string
          updated_by_user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "center_time_location_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_document_programming_link_status: {
        Args: {
          target_document_programming_link_id: string
          target_organization_id: string
          target_status: string
        }
        Returns: {
          center_id: string | null
          class_type_id: string | null
          created_at: string
          created_by_user_id: string
          document_id: string
          document_version_id: string
          ends_on: string
          id: string
          organization_id: string
          schedule_block_id: string | null
          starts_on: string
          status: string
          updated_at: string
          updated_by_user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "document_programming_links"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_operational_event_status: {
        Args: {
          target_operational_event_id: string
          target_organization_id: string
          target_status: string
        }
        Returns: {
          all_day: boolean
          archived_at: string | null
          cancelled_at: string | null
          center_id: string | null
          created_at: string
          created_by_membership_id: string | null
          ends_at: string | null
          event_type: string
          id: string
          impact_level: string
          notes: string | null
          organization_id: string
          retain_until: string
          starts_at: string
          status: string
          timezone: string
          title: string
          updated_at: string
          updated_by_membership_id: string | null
          visibility: string
        }
        SetofOptions: {
          from: "*"
          to: "operational_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_overtime_candidate_status: {
        Args: {
          target_organization_id: string
          target_overtime_candidate_id: string
          target_status: string
        }
        Returns: {
          candidate_minutes: number | null
          closed_at: string | null
          created_at: string
          created_by_membership_id: string
          detection_source: string
          id: string
          organization_id: string
          period_end_date: string
          period_start_date: string
          person_profile_id: string
          planned_minutes_snapshot: number
          retain_until: string
          reviewed_at: string | null
          reviewed_by_membership_id: string | null
          status: string
          timezone: string
          updated_at: string
          worked_minutes_snapshot: number
        }
        SetofOptions: {
          from: "*"
          to: "overtime_candidates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_platform_organization_access_status: {
        Args: {
          target_next_status: string
          target_organization_id: string
          target_reason: string
        }
        Returns: {
          audit_event_id: string
          new_status: string
          organization_id: string
          previous_status: string
        }[]
      }
      submit_due_time_weekly_approvals: {
        Args: { target_now?: string; target_organization_id?: string }
        Returns: {
          organization_id: string
          person_profile_id: string
          skipped_reason: string
          status: string
          submitted_at: string
          week_start_date: string
          weekly_approval_id: string
        }[]
      }
      submit_time_weekly_approval: {
        Args: {
          target_organization_id: string
          target_person_profile_id: string
          target_submission_source?: string
          target_week_start_date: string
        }
        Returns: {
          approval_note: string | null
          approval_signature_profile_signature_id: string | null
          approval_signature_snapshot: Json
          approved_at: string | null
          approved_by_membership_id: string | null
          approved_by_person_profile_id: string | null
          approved_by_user_id: string | null
          created_at: string
          created_by_membership_id: string | null
          created_by_user_id: string | null
          id: string
          metadata: Json
          notes: string | null
          organization_id: string
          person_profile_id: string
          rejected_at: string | null
          rejected_by_membership_id: string | null
          rejected_by_person_profile_id: string | null
          rejected_by_user_id: string | null
          rejection_note: string | null
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by_membership_id: string | null
          reopened_by_person_profile_id: string | null
          reopened_by_user_id: string | null
          snapshot: Json
          status: string
          submission_source: string
          submitted_at: string | null
          submitted_by_membership_id: string | null
          submitted_by_person_profile_id: string | null
          submitted_by_user_id: string | null
          updated_at: string
          week_start_date: string
        }
        SetofOptions: {
          from: "*"
          to: "time_weekly_approvals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      time_audit_event_metadata_is_safe: {
        Args: { target_metadata: Json }
        Returns: boolean
      }
      time_correction_approval_is_required: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      time_schedule_auto_is_enabled: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      time_schedule_context_is_valid: {
        Args: {
          target_center_id?: string
          target_organization_id: string
          target_person_profile_id: string
          target_schedule_block_assignment_id?: string
          target_schedule_block_id?: string
        }
        Returns: boolean
      }
      time_tracking_config_boolean: {
        Args: {
          default_value?: boolean
          target_config: Json
          target_key: string
        }
        Returns: boolean
      }
      time_week_is_approved: {
        Args: {
          target_organization_id: string
          target_person_profile_id: string
          target_work_date: string
        }
        Returns: boolean
      }
      time_week_start: { Args: { target_date: string }; Returns: string }
      time_weekly_approval_snapshot: {
        Args: {
          target_organization_id: string
          target_person_profile_id: string
          target_submission_source: string
          target_week_start_date: string
        }
        Returns: Json
      }
      update_billing_plan_draft_version: {
        Args: {
          target_annual_price_cents?: number
          target_billing_plan_version_id: string
          target_center_limit?: number
          target_description: string
          target_display_name: string
          target_features?: Json
          target_future_client_limit?: number
          target_monthly_price_cents?: number
          target_plan_code: string
          target_setup_description?: string
          target_setup_price_cents?: number
          target_staff_seat_limit?: number
          target_storage_gb?: number
          target_stripe_annual_price_id?: string
          target_stripe_monthly_price_id?: string
          target_stripe_product_id?: string
          target_support_level?: string
        }
        Returns: {
          billing_plan_version_id: string
          plan_code: string
          status: string
          version: number
        }[]
      }
      update_class_type_and_sync_defaults: {
        Args: {
          target_category: string
          target_certification_id?: string
          target_class_type_id: string
          target_color: string
          target_effective_from?: string
          target_icon_key?: string
          target_name: string
          target_organization_id: string
          target_required_coaches: number
          target_requires_certification: boolean
          target_slug: string
          target_status: string
        }
        Returns: Json
      }
      update_operational_event: {
        Args: {
          target_all_day?: boolean
          target_center_id?: string
          target_ends_at?: string
          target_event_type: string
          target_impact_level?: string
          target_notes?: string
          target_operational_event_id: string
          target_organization_id: string
          target_starts_at: string
          target_timezone?: string
          target_title: string
          target_visibility?: string
        }
        Returns: {
          all_day: boolean
          archived_at: string | null
          cancelled_at: string | null
          center_id: string | null
          created_at: string
          created_by_membership_id: string | null
          ends_at: string | null
          event_type: string
          id: string
          impact_level: string
          notes: string | null
          organization_id: string
          retain_until: string
          starts_at: string
          status: string
          timezone: string
          title: string
          updated_at: string
          updated_by_membership_id: string | null
          visibility: string
        }
        SetofOptions: {
          from: "*"
          to: "operational_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_organization_time_tracking_config: {
        Args: {
          target_organization_id: string
          target_time_tracking_config: Json
        }
        Returns: undefined
      }
      upsert_center_time_location_setting: {
        Args: {
          target_center_id: string
          target_center_latitude: number
          target_center_longitude: number
          target_change_reason?: string
          target_fallback_retention_days?: number
          target_max_accuracy_meters: number
          target_notice_text: string
          target_organization_id: string
          target_policy_version: number
          target_radius_meters: number
          target_retention_days?: number
          target_status: string
          target_timezone: string
        }
        Returns: {
          activated_at: string | null
          center_id: string
          center_latitude: number
          center_longitude: number
          change_reason: string | null
          created_at: string
          created_by_membership_id: string
          created_by_user_id: string
          deactivated_at: string | null
          fallback_retention_days: number
          id: string
          max_accuracy_meters: number
          notice_text: string
          organization_id: string
          policy_version: number
          radius_meters: number
          retention_days: number
          status: string
          timezone: string
          updated_at: string
          updated_by_membership_id: string
          updated_by_user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "center_time_location_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
