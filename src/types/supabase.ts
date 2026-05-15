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
          color: string | null
          created_at: string
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
          color?: string | null
          created_at?: string
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
          color?: string | null
          created_at?: string
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
          actor_membership_id: string
          actor_person_profile_id: string | null
          actor_user_id: string
          changed_fields: Json
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          organization_id: string
          result: string
          retain_until: string
        }
        Insert: {
          action: string
          actor_membership_id: string
          actor_person_profile_id?: string | null
          actor_user_id: string
          changed_fields?: Json
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          organization_id: string
          result?: string
          retain_until: string
        }
        Update: {
          action?: string
          actor_membership_id?: string
          actor_person_profile_id?: string | null
          actor_user_id?: string
          changed_fields?: Json
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          organization_id?: string
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
            foreignKeyName: "operational_audit_events_organization_id_actor_user_id_fkey"
            columns: ["organization_id", "actor_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "operational_audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
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
      can_access_document: {
        Args: {
          target_access_level?: string
          target_document_id: string
          target_document_version_id?: string
          target_organization_id: string
        }
        Returns: boolean
      }
      can_activate_time_location_settings: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      can_manage_change_requests: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      can_manage_document_by_id: {
        Args: { target_document_id: string; target_organization_id: string }
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
      can_manage_time_location_settings: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      can_manage_time_tracking: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      can_read_change_request: {
        Args: {
          target_change_request_id: string
          target_organization_id: string
        }
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
      get_active_membership_id: {
        Args: { target_organization_id: string }
        Returns: string
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
      has_document_capability: {
        Args: { target_capability: string; target_organization_id: string }
        Returns: boolean
      }
      has_org_role: {
        Args: { allowed_roles: string[]; target_organization_id: string }
        Returns: boolean
      }
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
      list_operational_audit_events: {
        Args: {
          target_entity_type?: string
          target_limit?: number
          target_organization_id: string
        }
        Returns: {
          action: string
          actor_membership_id: string
          actor_person_profile_id: string | null
          actor_user_id: string
          changed_fields: Json
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          organization_id: string
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
      purge_expired_operational_audit_events: {
        Args: { target_batch_size?: number }
        Returns: number
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
          actor_membership_id: string
          actor_person_profile_id: string | null
          actor_user_id: string
          changed_fields: Json
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          organization_id: string
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
      update_class_type_and_sync_defaults: {
        Args: {
          target_category: string
          target_class_type_id: string
          target_color: string | null
          target_effective_from?: string | null
          target_name: string
          target_organization_id: string
          target_required_coaches: number
          target_requires_certification: boolean
          target_slug: string
          target_status: string
        }
        Returns: Json
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
