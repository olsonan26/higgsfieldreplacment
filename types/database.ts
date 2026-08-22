export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      assets: {
        Row: {
          archived_at: string | null;
          byte_size: number;
          created_at: string;
          created_by: string;
          id: string;
          lifecycle_state: Database["public"]["Enums"]["asset_lifecycle_state"];
          media_kind: Database["public"]["Enums"]["media_kind"];
          metadata: Json;
          mime_type: string;
          original_filename: string;
          safe_filename: string;
          sha256: string | null;
          storage_bucket: string;
          storage_path: string;
          thumbnail_path: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          archived_at?: string | null;
          byte_size: number;
          created_at?: string;
          created_by: string;
          id?: string;
          lifecycle_state?: Database["public"]["Enums"]["asset_lifecycle_state"];
          media_kind: Database["public"]["Enums"]["media_kind"];
          metadata?: Json;
          mime_type: string;
          original_filename: string;
          safe_filename: string;
          sha256?: string | null;
          storage_bucket: string;
          storage_path: string;
          thumbnail_path?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          archived_at?: string | null;
          byte_size?: number;
          created_at?: string;
          created_by?: string;
          id?: string;
          lifecycle_state?: Database["public"]["Enums"]["asset_lifecycle_state"];
          media_kind?: Database["public"]["Enums"]["media_kind"];
          metadata?: Json;
          mime_type?: string;
          original_filename?: string;
          safe_filename?: string;
          sha256?: string | null;
          storage_bucket?: string;
          storage_path?: string;
          thumbnail_path?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assets_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assets_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          correlation_id: string | null;
          created_at: string;
          id: number;
          metadata: Json;
          target_id: string | null;
          target_type: string;
          workspace_id: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          correlation_id?: string | null;
          created_at?: string;
          id?: never;
          metadata?: Json;
          target_id?: string | null;
          target_type: string;
          workspace_id: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          correlation_id?: string | null;
          created_at?: string;
          id?: never;
          metadata?: Json;
          target_id?: string | null;
          target_type?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_logs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      favorites: {
        Row: {
          asset_id: string;
          created_at: string;
          project_id: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          asset_id: string;
          created_at?: string;
          project_id: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          asset_id?: string;
          created_at?: string;
          project_id?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "favorites_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "favorites_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "favorites_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "favorites_workspace_id_asset_id_fkey";
            columns: ["workspace_id", "asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "favorites_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "favorites_workspace_id_project_id_fkey";
            columns: ["workspace_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      generation_assets: {
        Row: {
          asset_id: string;
          created_at: string;
          direction: string;
          generation_id: string;
          role: Database["public"]["Enums"]["asset_role"];
          sort_order: number;
          workspace_id: string;
        };
        Insert: {
          asset_id: string;
          created_at?: string;
          direction: string;
          generation_id: string;
          role: Database["public"]["Enums"]["asset_role"];
          sort_order?: number;
          workspace_id: string;
        };
        Update: {
          asset_id?: string;
          created_at?: string;
          direction?: string;
          generation_id?: string;
          role?: Database["public"]["Enums"]["asset_role"];
          sort_order?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "generation_assets_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generation_assets_generation_id_fkey";
            columns: ["generation_id"];
            isOneToOne: false;
            referencedRelation: "generations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generation_assets_workspace_id_asset_id_fkey";
            columns: ["workspace_id", "asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "generation_assets_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generation_assets_workspace_id_generation_id_fkey";
            columns: ["workspace_id", "generation_id"];
            isOneToOne: false;
            referencedRelation: "generations";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      generation_batches: {
        Row: {
          created_at: string;
          created_by: string;
          estimated_credits: number;
          id: string;
          idempotency_key: string;
          project_id: string;
          request_hash: string;
          requested_count: number;
          state: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          estimated_credits?: number;
          id?: string;
          idempotency_key: string;
          project_id: string;
          request_hash: string;
          requested_count: number;
          state?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          estimated_credits?: number;
          id?: string;
          idempotency_key?: string;
          project_id?: string;
          request_hash?: string;
          requested_count?: number;
          state?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "generation_batches_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generation_batches_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generation_batches_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generation_batches_workspace_id_project_id_fkey";
            columns: ["workspace_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      generation_skill_snapshots: {
        Row: {
          content_sha256: string;
          created_at: string;
          generation_id: string;
          id: string;
          markdown_content_snapshot: string;
          media_scope_snapshot: Database["public"]["Enums"]["generation_skill_scope"];
          name_snapshot: string;
          position: number;
          skill_id: string;
          skill_version_id: string;
          workspace_id: string;
        };
        Insert: {
          content_sha256: string;
          created_at?: string;
          generation_id: string;
          id?: string;
          markdown_content_snapshot: string;
          media_scope_snapshot: Database["public"]["Enums"]["generation_skill_scope"];
          name_snapshot: string;
          position: number;
          skill_id: string;
          skill_version_id: string;
          workspace_id: string;
        };
        Update: {
          content_sha256?: string;
          created_at?: string;
          generation_id?: string;
          id?: string;
          markdown_content_snapshot?: string;
          media_scope_snapshot?: Database["public"]["Enums"]["generation_skill_scope"];
          name_snapshot?: string;
          position?: number;
          skill_id?: string;
          skill_version_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "generation_skill_snapshots_generation_id_fkey";
            columns: ["generation_id"];
            isOneToOne: false;
            referencedRelation: "generations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generation_skill_snapshots_skill_id_fkey";
            columns: ["skill_id"];
            isOneToOne: false;
            referencedRelation: "generation_skills";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generation_skill_snapshots_skill_version_id_fkey";
            columns: ["skill_version_id"];
            isOneToOne: false;
            referencedRelation: "generation_skill_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generation_skill_snapshots_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      generation_skill_versions: {
        Row: {
          content_sha256: string;
          created_at: string;
          created_by: string;
          id: string;
          markdown_content: string;
          metadata: Json;
          original_filename: string;
          skill_id: string;
          version: number;
          workspace_id: string;
        };
        Insert: {
          content_sha256: string;
          created_at?: string;
          created_by: string;
          id?: string;
          markdown_content: string;
          metadata?: Json;
          original_filename: string;
          skill_id: string;
          version: number;
          workspace_id: string;
        };
        Update: {
          content_sha256?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          markdown_content?: string;
          metadata?: Json;
          original_filename?: string;
          skill_id?: string;
          version?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "generation_skill_versions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generation_skill_versions_skill_workspace_fk";
            columns: ["skill_id", "workspace_id"];
            isOneToOne: false;
            referencedRelation: "generation_skills";
            referencedColumns: ["id", "workspace_id"];
          },
        ];
      };
      generation_skills: {
        Row: {
          active_version_id: string | null;
          archived_at: string | null;
          created_at: string;
          created_by: string;
          description: string;
          id: string;
          media_scope: Database["public"]["Enums"]["generation_skill_scope"];
          name: string;
          slug: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          active_version_id?: string | null;
          archived_at?: string | null;
          created_at?: string;
          created_by: string;
          description?: string;
          id?: string;
          media_scope?: Database["public"]["Enums"]["generation_skill_scope"];
          name: string;
          slug: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          active_version_id?: string | null;
          archived_at?: string | null;
          created_at?: string;
          created_by?: string;
          description?: string;
          id?: string;
          media_scope?: Database["public"]["Enums"]["generation_skill_scope"];
          name?: string;
          slug?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "generation_skills_active_version_fk";
            columns: ["active_version_id", "id"];
            isOneToOne: false;
            referencedRelation: "generation_skill_versions";
            referencedColumns: ["id", "skill_id"];
          },
          {
            foreignKeyName: "generation_skills_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generation_skills_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      generation_state_history: {
        Row: {
          created_at: string;
          display_error_code: string | null;
          generation_id: string;
          id: number;
          progress: number;
          source: string;
          state: Database["public"]["Enums"]["generation_state"];
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          display_error_code?: string | null;
          generation_id: string;
          id?: never;
          progress: number;
          source: string;
          state: Database["public"]["Enums"]["generation_state"];
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          display_error_code?: string | null;
          generation_id?: string;
          id?: never;
          progress?: number;
          source?: string;
          state?: Database["public"]["Enums"]["generation_state"];
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "generation_state_history_generation_id_fkey";
            columns: ["generation_id"];
            isOneToOne: false;
            referencedRelation: "generations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generation_state_history_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generation_state_history_workspace_id_generation_id_fkey";
            columns: ["workspace_id", "generation_id"];
            isOneToOne: false;
            referencedRelation: "generations";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      generations: {
        Row: {
          archived_at: string | null;
          attempt_number: number;
          batch_id: string;
          callback_token_hash: string;
          capability_snapshot: Json;
          capability_version: number;
          compiled_prompt: string;
          completed_at: string | null;
          created_at: string;
          created_by: string;
          display_error_code: string | null;
          display_error_message: string | null;
          estimated_credits: number;
          id: string;
          last_reconciled_at: string | null;
          model_capability_id: string;
          next_reconcile_at: string | null;
          ordinal: number;
          parent_generation_id: string | null;
          progress: number;
          project_id: string;
          provider_result_metadata: Json;
          provider_task_id: string | null;
          raw_prompt: string;
          reconciliation_attempts: number;
          recorded_credits: number | null;
          request_hash: string;
          sanitized_request_snapshot: Json;
          settings_snapshot: Json;
          state: Database["public"]["Enums"]["generation_state"];
          submitted_at: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          archived_at?: string | null;
          attempt_number?: number;
          batch_id: string;
          callback_token_hash: string;
          capability_snapshot: Json;
          capability_version: number;
          compiled_prompt: string;
          completed_at?: string | null;
          created_at?: string;
          created_by: string;
          display_error_code?: string | null;
          display_error_message?: string | null;
          estimated_credits?: number;
          id?: string;
          last_reconciled_at?: string | null;
          model_capability_id: string;
          next_reconcile_at?: string | null;
          ordinal: number;
          parent_generation_id?: string | null;
          progress?: number;
          project_id: string;
          provider_result_metadata?: Json;
          provider_task_id?: string | null;
          raw_prompt: string;
          reconciliation_attempts?: number;
          recorded_credits?: number | null;
          request_hash: string;
          sanitized_request_snapshot: Json;
          settings_snapshot: Json;
          state?: Database["public"]["Enums"]["generation_state"];
          submitted_at?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          archived_at?: string | null;
          attempt_number?: number;
          batch_id?: string;
          callback_token_hash?: string;
          capability_snapshot?: Json;
          capability_version?: number;
          compiled_prompt?: string;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string;
          display_error_code?: string | null;
          display_error_message?: string | null;
          estimated_credits?: number;
          id?: string;
          last_reconciled_at?: string | null;
          model_capability_id?: string;
          next_reconcile_at?: string | null;
          ordinal?: number;
          parent_generation_id?: string | null;
          progress?: number;
          project_id?: string;
          provider_result_metadata?: Json;
          provider_task_id?: string | null;
          raw_prompt?: string;
          reconciliation_attempts?: number;
          recorded_credits?: number | null;
          request_hash?: string;
          sanitized_request_snapshot?: Json;
          settings_snapshot?: Json;
          state?: Database["public"]["Enums"]["generation_state"];
          submitted_at?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "generations_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "generation_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generations_model_capability_id_fkey";
            columns: ["model_capability_id"];
            isOneToOne: false;
            referencedRelation: "model_capabilities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generations_parent_generation_id_fkey";
            columns: ["parent_generation_id"];
            isOneToOne: false;
            referencedRelation: "generations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generations_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generations_workspace_id_batch_id_fkey";
            columns: ["workspace_id", "batch_id"];
            isOneToOne: false;
            referencedRelation: "generation_batches";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "generations_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generations_workspace_id_project_id_fkey";
            columns: ["workspace_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      idempotency_keys: {
        Row: {
          actor_id: string;
          created_at: string;
          expires_at: string;
          id: string;
          key: string;
          request_hash: string;
          resource_id: string | null;
          resource_type: string | null;
          response_body: Json | null;
          response_status: number | null;
          scope: string;
          workspace_id: string;
        };
        Insert: {
          actor_id: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          key: string;
          request_hash: string;
          resource_id?: string | null;
          resource_type?: string | null;
          response_body?: Json | null;
          response_status?: number | null;
          scope: string;
          workspace_id: string;
        };
        Update: {
          actor_id?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          key?: string;
          request_hash?: string;
          resource_id?: string | null;
          resource_type?: string | null;
          response_body?: Json | null;
          response_status?: number | null;
          scope?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "idempotency_keys_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "idempotency_keys_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      model_capabilities: {
        Row: {
          app_model_key: string;
          created_at: string;
          enabled: boolean;
          fixture_hash: string;
          id: string;
          manifest: Json;
          media_kind: Database["public"]["Enums"]["media_kind"];
          provider_schema_version: string;
          source_url: string;
          verified_at: string;
          version: number;
        };
        Insert: {
          app_model_key: string;
          created_at?: string;
          enabled?: boolean;
          fixture_hash: string;
          id?: string;
          manifest: Json;
          media_kind: Database["public"]["Enums"]["media_kind"];
          provider_schema_version: string;
          source_url: string;
          verified_at: string;
          version: number;
        };
        Update: {
          app_model_key?: string;
          created_at?: string;
          enabled?: boolean;
          fixture_hash?: string;
          id?: string;
          manifest?: Json;
          media_kind?: Database["public"]["Enums"]["media_kind"];
          provider_schema_version?: string;
          source_url?: string;
          verified_at?: string;
          version?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_path: string | null;
          created_at: string;
          display_name: string;
          id: string;
          updated_at: string;
        };
        Insert: {
          avatar_path?: string | null;
          created_at?: string;
          display_name?: string;
          id: string;
          updated_at?: string;
        };
        Update: {
          avatar_path?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      project_assets: {
        Row: {
          asset_id: string;
          created_at: string;
          created_by: string;
          project_id: string;
          role: Database["public"]["Enums"]["asset_role"];
          role_label: string | null;
          sort_order: number;
          workspace_id: string;
        };
        Insert: {
          asset_id: string;
          created_at?: string;
          created_by: string;
          project_id: string;
          role: Database["public"]["Enums"]["asset_role"];
          role_label?: string | null;
          sort_order?: number;
          workspace_id: string;
        };
        Update: {
          asset_id?: string;
          created_at?: string;
          created_by?: string;
          project_id?: string;
          role?: Database["public"]["Enums"]["asset_role"];
          role_label?: string | null;
          sort_order?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_assets_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_assets_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_assets_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_assets_workspace_id_asset_id_fkey";
            columns: ["workspace_id", "asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "project_assets_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_assets_workspace_id_project_id_fkey";
            columns: ["workspace_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      project_generation_skills: {
        Row: {
          created_at: string;
          created_by: string;
          enabled: boolean;
          project_id: string;
          skill_id: string;
          sort_order: number;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          enabled?: boolean;
          project_id: string;
          skill_id: string;
          sort_order?: number;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          enabled?: boolean;
          project_id?: string;
          skill_id?: string;
          sort_order?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_generation_skills_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_generation_skills_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_generation_skills_project_workspace_fk";
            columns: ["workspace_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "project_generation_skills_skill_id_fkey";
            columns: ["skill_id"];
            isOneToOne: false;
            referencedRelation: "generation_skills";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_generation_skills_skill_workspace_fk";
            columns: ["skill_id", "workspace_id"];
            isOneToOne: false;
            referencedRelation: "generation_skills";
            referencedColumns: ["id", "workspace_id"];
          },
          {
            foreignKeyName: "project_generation_skills_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      project_settings: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          project_id: string;
          settings: Json;
          version: number;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          project_id: string;
          settings: Json;
          version: number;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          project_id?: string;
          settings?: Json;
          version?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_settings_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_settings_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_settings_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_settings_workspace_id_project_id_fkey";
            columns: ["workspace_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      projects: {
        Row: {
          archived_at: string | null;
          created_at: string;
          created_by: string;
          deleted_at: string | null;
          description: string;
          id: string;
          name: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          created_by: string;
          deleted_at?: string | null;
          description?: string;
          id?: string;
          name: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          created_by?: string;
          deleted_at?: string | null;
          description?: string;
          id?: string;
          name?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "projects_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      prompt_versions: {
        Row: {
          compiled_prompt: string;
          created_at: string;
          created_by: string;
          creative_direction: Json;
          id: string;
          model_capability_id: string | null;
          project_id: string;
          raw_prompt: string;
          restored_from_id: string | null;
          technical_settings: Json;
          version: number;
          workspace_id: string;
        };
        Insert: {
          compiled_prompt?: string;
          created_at?: string;
          created_by: string;
          creative_direction?: Json;
          id?: string;
          model_capability_id?: string | null;
          project_id: string;
          raw_prompt?: string;
          restored_from_id?: string | null;
          technical_settings?: Json;
          version: number;
          workspace_id: string;
        };
        Update: {
          compiled_prompt?: string;
          created_at?: string;
          created_by?: string;
          creative_direction?: Json;
          id?: string;
          model_capability_id?: string | null;
          project_id?: string;
          raw_prompt?: string;
          restored_from_id?: string | null;
          technical_settings?: Json;
          version?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prompt_versions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prompt_versions_model_capability_id_fkey";
            columns: ["model_capability_id"];
            isOneToOne: false;
            referencedRelation: "model_capabilities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prompt_versions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prompt_versions_restored_from_id_fkey";
            columns: ["restored_from_id"];
            isOneToOne: false;
            referencedRelation: "prompt_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prompt_versions_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prompt_versions_workspace_id_project_id_fkey";
            columns: ["workspace_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      provider_webhook_events: {
        Row: {
          body_hash: string;
          display_error_code: string | null;
          event_key: string;
          generation_id: string;
          id: string;
          payload_summary: Json;
          processed_at: string | null;
          received_at: string;
          state: Database["public"]["Enums"]["webhook_event_state"];
          workspace_id: string;
        };
        Insert: {
          body_hash: string;
          display_error_code?: string | null;
          event_key: string;
          generation_id: string;
          id?: string;
          payload_summary?: Json;
          processed_at?: string | null;
          received_at?: string;
          state?: Database["public"]["Enums"]["webhook_event_state"];
          workspace_id: string;
        };
        Update: {
          body_hash?: string;
          display_error_code?: string | null;
          event_key?: string;
          generation_id?: string;
          id?: string;
          payload_summary?: Json;
          processed_at?: string | null;
          received_at?: string;
          state?: Database["public"]["Enums"]["webhook_event_state"];
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_webhook_events_generation_id_fkey";
            columns: ["generation_id"];
            isOneToOne: false;
            referencedRelation: "generations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_webhook_events_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_webhook_events_workspace_id_generation_id_fkey";
            columns: ["workspace_id", "generation_id"];
            isOneToOne: false;
            referencedRelation: "generations";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      usage_ledger: {
        Row: {
          actor_id: string;
          authoritative: boolean;
          batch_id: string | null;
          created_at: string;
          credits: number;
          entry_kind: Database["public"]["Enums"]["ledger_entry_kind"];
          external_record_hash: string | null;
          generation_id: string | null;
          id: string;
          metadata: Json;
          workspace_id: string;
        };
        Insert: {
          actor_id: string;
          authoritative?: boolean;
          batch_id?: string | null;
          created_at?: string;
          credits: number;
          entry_kind: Database["public"]["Enums"]["ledger_entry_kind"];
          external_record_hash?: string | null;
          generation_id?: string | null;
          id?: string;
          metadata?: Json;
          workspace_id: string;
        };
        Update: {
          actor_id?: string;
          authoritative?: boolean;
          batch_id?: string | null;
          created_at?: string;
          credits?: number;
          entry_kind?: Database["public"]["Enums"]["ledger_entry_kind"];
          external_record_hash?: string | null;
          generation_id?: string | null;
          id?: string;
          metadata?: Json;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "usage_ledger_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "usage_ledger_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "generation_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "usage_ledger_generation_id_fkey";
            columns: ["generation_id"];
            isOneToOne: false;
            referencedRelation: "generations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "usage_ledger_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspace_memberships: {
        Row: {
          created_at: string;
          daily_generation_limit: number | null;
          generation_allowed: boolean;
          monthly_credit_limit: number | null;
          role: Database["public"]["Enums"]["workspace_role"];
          updated_at: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          daily_generation_limit?: number | null;
          generation_allowed?: boolean;
          monthly_credit_limit?: number | null;
          role: Database["public"]["Enums"]["workspace_role"];
          updated_at?: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          daily_generation_limit?: number | null;
          generation_allowed?: boolean;
          monthly_credit_limit?: number | null;
          role?: Database["public"]["Enums"]["workspace_role"];
          updated_at?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workspace_memberships_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspace_model_spend_policies: {
        Row: {
          created_at: string;
          created_by: string;
          enabled: boolean;
          estimated_credit_reserve: number;
          model_capability_id: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          enabled?: boolean;
          estimated_credit_reserve: number;
          model_capability_id: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          enabled?: boolean;
          estimated_credit_reserve?: number;
          model_capability_id?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_model_spend_policies_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workspace_model_spend_policies_model_capability_id_fkey";
            columns: ["model_capability_id"];
            isOneToOne: false;
            referencedRelation: "model_capabilities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workspace_model_spend_policies_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspaces: {
        Row: {
          created_at: string;
          daily_generation_limit: number;
          id: string;
          max_concurrent_generations: number;
          monthly_credit_limit: number;
          name: string;
          owner_id: string;
          retention_days: number;
          slug: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          daily_generation_limit?: number;
          id?: string;
          max_concurrent_generations?: number;
          monthly_credit_limit?: number;
          name: string;
          owner_id: string;
          retention_days?: number;
          slug: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          daily_generation_limit?: number;
          id?: string;
          max_concurrent_generations?: number;
          monthly_credit_limit?: number;
          name?: string;
          owner_id?: string;
          retention_days?: number;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspaces_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_generation_skill_version: {
        Args: {
          content_sha256_value: string;
          markdown_content_value: string;
          original_filename_value: string;
          target_skill_id: string;
          target_workspace_id: string;
        };
        Returns: Json;
      };
      create_external_reference_asset: {
        Args: {
          external_id_value: string;
          reference_label: string;
          requested_role: Database["public"]["Enums"]["asset_role"];
          target_project_id: string;
          target_workspace_id: string;
        };
        Returns: Json;
      };
      create_generation_skill: {
        Args: {
          content_sha256_value: string;
          markdown_content_value: string;
          original_filename_value: string;
          skill_description: string;
          skill_media_scope: Database["public"]["Enums"]["generation_skill_scope"];
          skill_name: string;
          skill_slug: string;
          target_workspace_id: string;
        };
        Returns: Json;
      };
      reserve_generation_batch: {
        Args: {
          idempotency_key_value: string;
          items: Json;
          request_hash_value: string;
          target_project_id: string;
          target_workspace_id: string;
        };
        Returns: Json;
      };
      reserve_source_asset: {
        Args: {
          byte_size_value: number;
          mime_type_value: string;
          original_filename_value: string;
          requested_role: Database["public"]["Enums"]["asset_role"];
          safe_filename_value: string;
          target_project_id: string;
          target_workspace_id: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      asset_lifecycle_state:
        | "uploading"
        | "ready"
        | "quarantined"
        | "archived"
        | "deleted";
      asset_role:
        | "source"
        | "reference_image"
        | "reference_video"
        | "reference_audio"
        | "first_frame"
        | "last_frame"
        | "character"
        | "element"
        | "generated_output"
        | "thumbnail";
      generation_skill_scope: "image" | "video" | "both";
      generation_state:
        | "reserved"
        | "submitting"
        | "submitted"
        | "queued"
        | "running"
        | "ingesting"
        | "succeeded"
        | "failed"
        | "cancel_requested"
        | "cancelled"
        | "timed_out";
      ledger_entry_kind:
        | "estimate_reserved"
        | "estimate_released"
        | "usage_recorded"
        | "adjustment";
      media_kind: "image" | "video" | "audio" | "document" | "other";
      webhook_event_state:
        | "received"
        | "processing"
        | "processed"
        | "rejected"
        | "failed";
      workspace_role: "owner" | "admin" | "editor" | "viewer";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      asset_lifecycle_state: [
        "uploading",
        "ready",
        "quarantined",
        "archived",
        "deleted",
      ],
      asset_role: [
        "source",
        "reference_image",
        "reference_video",
        "reference_audio",
        "first_frame",
        "last_frame",
        "character",
        "element",
        "generated_output",
        "thumbnail",
      ],
      generation_skill_scope: ["image", "video", "both"],
      generation_state: [
        "reserved",
        "submitting",
        "submitted",
        "queued",
        "running",
        "ingesting",
        "succeeded",
        "failed",
        "cancel_requested",
        "cancelled",
        "timed_out",
      ],
      ledger_entry_kind: [
        "estimate_reserved",
        "estimate_released",
        "usage_recorded",
        "adjustment",
      ],
      media_kind: ["image", "video", "audio", "document", "other"],
      webhook_event_state: [
        "received",
        "processing",
        "processed",
        "rejected",
        "failed",
      ],
      workspace_role: ["owner", "admin", "editor", "viewer"],
    },
  },
} as const;
