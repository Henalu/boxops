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
          center_id: string | null
          created_at: string
          id: string
          metadata: Json
          name: string
          organization_id: string
          status: string
          template_type: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          center_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          organization_id: string
          status?: string
          template_type?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          center_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          organization_id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_org_role: {
        Args: { allowed_roles: string[]; target_organization_id: string }
        Returns: boolean
      }
      is_org_member: {
        Args: { target_organization_id: string }
        Returns: boolean
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

