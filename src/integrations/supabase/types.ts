export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      queue_items: {
        Row: {
          added_by: string
          channel: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          position: number
          room_id: string
          singer_id: string | null
          status: Database["public"]["Enums"]["queue_status"]
          thumbnail_url: string | null
          title: string
          youtube_id: string
        }
        Insert: {
          added_by: string
          channel?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          position?: number
          room_id: string
          singer_id?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          thumbnail_url?: string | null
          title: string
          youtube_id: string
        }
        Update: {
          added_by?: string
          channel?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          position?: number
          room_id?: string
          singer_id?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          thumbnail_url?: string | null
          title?: string
          youtube_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_items_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_members: {
        Row: {
          joined_at: string
          room_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          room_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          code: string
          created_at: string
          current_item_id: string | null
          host_id: string
          id: string
          name: string
          playback_state: Database["public"]["Enums"]["playback_state"]
          playback_updated_at: string
          position_seconds: number
        }
        Insert: {
          code: string
          created_at?: string
          current_item_id?: string | null
          host_id: string
          id?: string
          name?: string
          playback_state?: Database["public"]["Enums"]["playback_state"]
          playback_updated_at?: string
          position_seconds?: number
        }
        Update: {
          code?: string
          created_at?: string
          current_item_id?: string | null
          host_id?: string
          id?: string
          name?: string
          playback_state?: Database["public"]["Enums"]["playback_state"]
          playback_updated_at?: string
          position_seconds?: number
        }
        Relationships: []
      }
      scores: {
        Row: {
          created_at: string
          id: string
          judged_by: string
          queue_item_id: string
          room_id: string
          score: number
          singer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          judged_by: string
          queue_item_id: string
          room_id: string
          score: number
          singer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          judged_by?: string
          queue_item_id?: string
          room_id?: string
          score?: number
          singer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scores_queue_item_id_fkey"
            columns: ["queue_item_id"]
            isOneToOne: true
            referencedRelation: "queue_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      advance_queue: {
        Args: { _room_id: string }
        Returns: {
          added_by: string
          channel: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          position: number
          room_id: string
          singer_id: string | null
          status: Database["public"]["Enums"]["queue_status"]
          thumbnail_url: string | null
          title: string
          youtube_id: string
        }
        SetofOptions: {
          from: "*"
          to: "queue_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_room: {
        Args: { _name: string }
        Returns: {
          code: string
          created_at: string
          current_item_id: string | null
          host_id: string
          id: string
          name: string
          playback_state: Database["public"]["Enums"]["playback_state"]
          playback_updated_at: string
          position_seconds: number
        }
        SetofOptions: {
          from: "*"
          to: "rooms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_room_code: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_room_host: {
        Args: { _room_id: string; _user_id: string }
        Returns: boolean
      }
      is_room_member: {
        Args: { _room_id: string; _user_id: string }
        Returns: boolean
      }
      join_room_by_code: {
        Args: { _code: string }
        Returns: {
          code: string
          created_at: string
          current_item_id: string | null
          host_id: string
          id: string
          name: string
          playback_state: Database["public"]["Enums"]["playback_state"]
          playback_updated_at: string
          position_seconds: number
        }
        SetofOptions: {
          from: "*"
          to: "rooms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "user"
      playback_state: "idle" | "playing" | "paused"
      queue_status: "queued" | "playing" | "done" | "skipped"
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
  public: {
    Enums: {
      app_role: ["admin", "user"],
      playback_state: ["idle", "playing", "paused"],
      queue_status: ["queued", "playing", "done", "skipped"],
    },
  },
} as const
