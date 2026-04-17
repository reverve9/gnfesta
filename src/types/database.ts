export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      festivals: {
        Row: {
          id: string
          slug: string
          name: string
          subtitle: string | null
          description_lead: string | null
          description_body: string | null
          poster_url: string | null
          schedule: string | null
          venue: string | null
          theme_color: string | null
          layout_image_url: string | null
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          name: string
          subtitle?: string | null
          description_lead?: string | null
          description_body?: string | null
          poster_url?: string | null
          schedule?: string | null
          venue?: string | null
          theme_color?: string | null
          layout_image_url?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slug?: string
          name?: string
          subtitle?: string | null
          description_lead?: string | null
          description_body?: string | null
          poster_url?: string | null
          schedule?: string | null
          venue?: string | null
          theme_color?: string | null
          layout_image_url?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      notices: {
        Row: {
          id: string
          title: string
          content: string
          images: string[]
          category: 'general' | 'program' | 'result'
          is_pinned: boolean
          is_published: boolean
          published_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          content: string
          images?: string[]
          category?: 'general' | 'program' | 'result'
          is_pinned?: boolean
          is_published?: boolean
          published_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          content?: string
          images?: string[]
          category?: 'general' | 'program' | 'result'
          is_pinned?: boolean
          is_published?: boolean
          published_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      festival_events: {
        Row: {
          id: string
          festival_id: string
          slug: string | null
          name: string
          kind: 'opening' | 'closing' | 'program'
          schedule: string | null
          venue: string | null
          description: string | null
          thumbnail_url: string | null
          sort_order: number
          is_active: boolean
          coupon_enabled: boolean
          coupon_discount: number | null
          coupon_min_order: number | null
          coupon_starts_at: string | null
          coupon_ends_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          festival_id: string
          slug?: string | null
          name: string
          kind?: 'opening' | 'closing' | 'program'
          schedule?: string | null
          venue?: string | null
          description?: string | null
          thumbnail_url?: string | null
          sort_order?: number
          is_active?: boolean
          coupon_enabled?: boolean
          coupon_discount?: number | null
          coupon_min_order?: number | null
          coupon_starts_at?: string | null
          coupon_ends_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          festival_id?: string
          slug?: string | null
          name?: string
          kind?: 'opening' | 'closing' | 'program'
          schedule?: string | null
          venue?: string | null
          description?: string | null
          thumbnail_url?: string | null
          sort_order?: number
          is_active?: boolean
          coupon_enabled?: boolean
          coupon_discount?: number | null
          coupon_min_order?: number | null
          coupon_starts_at?: string | null
          coupon_ends_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'festival_events_festival_id_fkey'
            columns: ['festival_id']
            isOneToOne: false
            referencedRelation: 'festivals'
            referencedColumns: ['id']
          },
        ]
      }
      festival_guests: {
        Row: {
          id: string
          festival_id: string
          name: string
          description: string | null
          photo_url: string | null
          link_url: string | null
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          festival_id: string
          name: string
          description?: string | null
          photo_url?: string | null
          link_url?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          festival_id?: string
          name?: string
          description?: string | null
          photo_url?: string | null
          link_url?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'festival_guests_festival_id_fkey'
            columns: ['festival_id']
            isOneToOne: false
            referencedRelation: 'festivals'
            referencedColumns: ['id']
          },
        ]
      }
      food_booths: {
        Row: {
          id: string
          festival_id: string
          booth_no: string | null
          name: string
          description: string | null
          category: string | null
          thumbnail_url: string | null
          gallery_urls: Json
          sort_order: number
          is_active: boolean
          is_open: boolean
          is_paused: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          festival_id: string
          booth_no?: string | null
          name: string
          description?: string | null
          category?: string | null
          thumbnail_url?: string | null
          gallery_urls?: Json
          sort_order?: number
          is_active?: boolean
          is_open?: boolean
          is_paused?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          festival_id?: string
          booth_no?: string | null
          name?: string
          description?: string | null
          category?: string | null
          thumbnail_url?: string | null
          gallery_urls?: Json
          sort_order?: number
          is_active?: boolean
          is_open?: boolean
          is_paused?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'food_booths_festival_id_fkey'
            columns: ['festival_id']
            isOneToOne: false
            referencedRelation: 'festivals'
            referencedColumns: ['id']
          },
        ]
      }
      food_categories: {
        Row: {
          id: string
          slug: string
          label: string
          sort_order: number
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          slug: string
          label: string
          sort_order?: number
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          slug?: string
          label?: string
          sort_order?: number
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      food_menus: {
        Row: {
          id: string
          booth_id: string
          name: string
          price: number | null
          description: string | null
          image_url: string | null
          is_signature: boolean
          is_sold_out: boolean
          stock: number | null
          sort_order: number
          is_active: boolean
          menu_type: 'instant' | 'cook'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          booth_id: string
          name: string
          price?: number | null
          description?: string | null
          image_url?: string | null
          is_signature?: boolean
          is_sold_out?: boolean
          stock?: number | null
          sort_order?: number
          is_active?: boolean
          menu_type?: 'instant' | 'cook'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          booth_id?: string
          name?: string
          price?: number | null
          description?: string | null
          image_url?: string | null
          is_signature?: boolean
          is_sold_out?: boolean
          stock?: number | null
          sort_order?: number
          is_active?: boolean
          menu_type?: 'instant' | 'cook'
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'food_menus_booth_id_fkey'
            columns: ['booth_id']
            isOneToOne: false
            referencedRelation: 'food_booths'
            referencedColumns: ['id']
          },
        ]
      }
      surveys: {
        Row: {
          id: string
          festival_id: string | null
          gender: 'male' | 'female' | 'other'
          age: number
          region: string
          name: string
          phone: string
          privacy_consented: boolean
          answers: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          festival_id?: string | null
          gender: 'male' | 'female' | 'other'
          age: number
          region: string
          name: string
          phone: string
          privacy_consented?: boolean
          answers?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          festival_id?: string | null
          gender?: 'male' | 'female' | 'other'
          age?: number
          region?: string
          name?: string
          phone?: string
          privacy_consented?: boolean
          answers?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'surveys_festival_id_fkey'
            columns: ['festival_id']
            isOneToOne: false
            referencedRelation: 'festivals'
            referencedColumns: ['id']
          },
        ]
      }
      coupons: {
        Row: {
          id: string
          code: string
          discount_amount: number
          min_order_amount: number
          status: 'active' | 'used' | 'cancelled'
          issued_source: 'manual' | 'survey' | 'payment' | 'program'
          issued_phone: string | null
          phone: string | null
          client_id: string | null
          booth_id: string | null
          event_id: string | null
          source_label: string | null
          issued_from_order_id: string | null
          note: string | null
          expires_at: string
          used_at: string | null
          used_payment_id: string | null
          festival_id: string | null
          meta: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          code: string
          discount_amount: number
          min_order_amount?: number
          status?: 'active' | 'used' | 'cancelled'
          issued_source?: 'manual' | 'survey' | 'payment' | 'program'
          issued_phone?: string | null
          phone?: string | null
          client_id?: string | null
          booth_id?: string | null
          event_id?: string | null
          source_label?: string | null
          issued_from_order_id?: string | null
          note?: string | null
          expires_at: string
          used_at?: string | null
          used_payment_id?: string | null
          festival_id?: string | null
          meta?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          code?: string
          discount_amount?: number
          min_order_amount?: number
          status?: 'active' | 'used' | 'cancelled'
          issued_source?: 'manual' | 'survey' | 'payment' | 'program'
          issued_phone?: string | null
          phone?: string | null
          client_id?: string | null
          booth_id?: string | null
          event_id?: string | null
          source_label?: string | null
          issued_from_order_id?: string | null
          note?: string | null
          expires_at?: string
          used_at?: string | null
          used_payment_id?: string | null
          festival_id?: string | null
          meta?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'coupons_festival_id_fkey'
            columns: ['festival_id']
            isOneToOne: false
            referencedRelation: 'festivals'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'coupons_used_payment_id_fkey'
            columns: ['used_payment_id']
            isOneToOne: false
            referencedRelation: 'payments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'coupons_booth_id_fkey'
            columns: ['booth_id']
            isOneToOne: false
            referencedRelation: 'food_booths'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'coupons_event_id_fkey'
            columns: ['event_id']
            isOneToOne: false
            referencedRelation: 'festival_events'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'coupons_issued_from_order_id_fkey'
            columns: ['issued_from_order_id']
            isOneToOne: false
            referencedRelation: 'orders'
            referencedColumns: ['id']
          },
        ]
      }
      payments: {
        Row: {
          id: string
          toss_order_id: string
          payment_key: string | null
          phone: string
          total_amount: number
          discount_amount: number
          refunded_amount: number
          coupon_id: string | null
          status: 'pending' | 'paid' | 'cancelled'
          paid_at: string | null
          cancelled_at: string | null
          festival_id: string | null
          meta: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          toss_order_id?: string
          payment_key?: string | null
          phone: string
          total_amount: number
          discount_amount?: number
          refunded_amount?: number
          coupon_id?: string | null
          status?: 'pending' | 'paid' | 'cancelled'
          paid_at?: string | null
          cancelled_at?: string | null
          festival_id?: string | null
          meta?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          toss_order_id?: string
          payment_key?: string | null
          phone?: string
          total_amount?: number
          discount_amount?: number
          refunded_amount?: number
          coupon_id?: string | null
          status?: 'pending' | 'paid' | 'cancelled'
          paid_at?: string | null
          cancelled_at?: string | null
          festival_id?: string | null
          meta?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'payments_festival_id_fkey'
            columns: ['festival_id']
            isOneToOne: false
            referencedRelation: 'festivals'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'payments_coupon_id_fkey'
            columns: ['coupon_id']
            isOneToOne: false
            referencedRelation: 'coupons'
            referencedColumns: ['id']
          },
        ]
      }
      orders: {
        Row: {
          id: string
          payment_id: string
          order_number: string
          booth_id: string | null
          booth_no: string
          booth_name: string
          subtotal: number
          phone: string
          status: 'pending' | 'paid' | 'confirmed' | 'completed' | 'cancelled'
          paid_at: string | null
          confirmed_at: string | null
          estimated_minutes: number | null
          ready_at: string | null
          picked_up_at: string | null
          cancelled_at: string | null
          cancel_reason: string | null
          cancelled_by: 'booth' | 'admin' | null
          order_type: 'instant' | 'cook'
          festival_id: string | null
          meta: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          payment_id: string
          order_number?: string
          booth_id?: string | null
          booth_no: string
          booth_name: string
          subtotal: number
          phone: string
          status?: 'pending' | 'paid' | 'confirmed' | 'completed' | 'cancelled'
          paid_at?: string | null
          confirmed_at?: string | null
          estimated_minutes?: number | null
          ready_at?: string | null
          picked_up_at?: string | null
          cancelled_at?: string | null
          cancel_reason?: string | null
          cancelled_by?: 'booth' | 'admin' | null
          order_type?: 'instant' | 'cook'
          festival_id?: string | null
          meta?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          payment_id?: string
          order_number?: string
          booth_id?: string | null
          booth_no?: string
          booth_name?: string
          subtotal?: number
          phone?: string
          status?: 'pending' | 'paid' | 'confirmed' | 'completed' | 'cancelled'
          paid_at?: string | null
          confirmed_at?: string | null
          estimated_minutes?: number | null
          ready_at?: string | null
          picked_up_at?: string | null
          cancelled_at?: string | null
          cancel_reason?: string | null
          cancelled_by?: 'booth' | 'admin' | null
          order_type?: 'instant' | 'cook'
          festival_id?: string | null
          meta?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'orders_payment_id_fkey'
            columns: ['payment_id']
            isOneToOne: false
            referencedRelation: 'payments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'orders_booth_id_fkey'
            columns: ['booth_id']
            isOneToOne: false
            referencedRelation: 'food_booths'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'orders_festival_id_fkey'
            columns: ['festival_id']
            isOneToOne: false
            referencedRelation: 'festivals'
            referencedColumns: ['id']
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          menu_id: string | null
          menu_name: string
          menu_price: number
          quantity: number
          subtotal: number
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          menu_id?: string | null
          menu_name: string
          menu_price: number
          quantity?: number
          subtotal: number
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          menu_id?: string | null
          menu_name?: string
          menu_price?: number
          quantity?: number
          subtotal?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'order_items_order_id_fkey'
            columns: ['order_id']
            isOneToOne: false
            referencedRelation: 'orders'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'order_items_menu_id_fkey'
            columns: ['menu_id']
            isOneToOne: false
            referencedRelation: 'food_menus'
            referencedColumns: ['id']
          },
        ]
      }
      booth_order_counters: {
        Row: {
          booth_id: string
          last_no: number
          updated_at: string
        }
        Insert: {
          booth_id: string
          last_no?: number
          updated_at?: string
        }
        Update: {
          booth_id?: string
          last_no?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'booth_order_counters_booth_id_fkey'
            columns: ['booth_id']
            isOneToOne: true
            referencedRelation: 'food_booths'
            referencedColumns: ['id']
          },
        ]
      }
      booth_accounts: {
        Row: {
          id: string
          booth_id: string
          login_id: string
          password_hash: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          booth_id: string
          login_id: string
          password_hash: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          booth_id?: string
          login_id?: string
          password_hash?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'booth_accounts_booth_id_fkey'
            columns: ['booth_id']
            isOneToOne: false
            referencedRelation: 'food_booths'
            referencedColumns: ['id']
          },
        ]
      }
      stamp_prize_claims: {
        Row: {
          id: string
          phone: string
          claimed_at: string
          claimed_by: string | null
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          phone: string
          claimed_at?: string
          claimed_by?: string | null
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          phone?: string
          claimed_at?: string
          claimed_by?: string | null
          note?: string | null
          created_at?: string
        }
        Relationships: []
      }
      ar_games: {
        Row: {
          id: number
          name: string
          theme_config: Json
          start_at: string | null
          end_at: string | null
          status: 'draft' | 'scheduled' | 'active' | 'ended'
          reward_config: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          name?: string
          theme_config?: Json
          start_at?: string | null
          end_at?: string | null
          status?: 'draft' | 'scheduled' | 'active' | 'ended'
          reward_config?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          name?: string
          theme_config?: Json
          start_at?: string | null
          end_at?: string | null
          status?: 'draft' | 'scheduled' | 'active' | 'ended'
          reward_config?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ar_zones: {
        Row: {
          id: string
          name: string
          center_lat: number
          center_lng: number
          radius_m: number
          spawn_weight: number
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          center_lat: number
          center_lng: number
          radius_m: number
          spawn_weight?: number
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          center_lat?: number
          center_lng?: number
          radius_m?: number
          spawn_weight?: number
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ar_creatures: {
        Row: {
          id: string
          name: string
          rarity: 'common' | 'rare' | 'legendary'
          model_url: string | null
          thumbnail_url: string | null
          spawn_rate: number
          unlock_condition: Json | null
          active: boolean
          display_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          rarity: 'common' | 'rare' | 'legendary'
          model_url?: string | null
          thumbnail_url?: string | null
          spawn_rate?: number
          unlock_condition?: Json | null
          active?: boolean
          display_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          rarity?: 'common' | 'rare' | 'legendary'
          model_url?: string | null
          thumbnail_url?: string | null
          spawn_rate?: number
          unlock_condition?: Json | null
          active?: boolean
          display_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ar_spawn_tokens: {
        Row: {
          token: string
          phone: string
          creature_id: string
          zone_id: string
          issued_at: string
          expires_at: string
          consumed_at: string | null
        }
        Insert: {
          token: string
          phone: string
          creature_id: string
          zone_id: string
          issued_at?: string
          expires_at: string
          consumed_at?: string | null
        }
        Update: {
          token?: string
          phone?: string
          creature_id?: string
          zone_id?: string
          issued_at?: string
          expires_at?: string
          consumed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'ar_spawn_tokens_creature_id_fkey'
            columns: ['creature_id']
            isOneToOne: false
            referencedRelation: 'ar_creatures'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ar_spawn_tokens_zone_id_fkey'
            columns: ['zone_id']
            isOneToOne: false
            referencedRelation: 'ar_zones'
            referencedColumns: ['id']
          },
        ]
      }
      ar_captures: {
        Row: {
          id: number
          phone: string
          creature_id: string
          zone_id: string | null
          captured_at: string
          client_lat: number | null
          client_lng: number | null
          server_verified_at: string
        }
        Insert: {
          id?: number
          phone: string
          creature_id: string
          zone_id?: string | null
          captured_at?: string
          client_lat?: number | null
          client_lng?: number | null
          server_verified_at?: string
        }
        Update: {
          id?: number
          phone?: string
          creature_id?: string
          zone_id?: string | null
          captured_at?: string
          client_lat?: number | null
          client_lng?: number | null
          server_verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ar_captures_creature_id_fkey'
            columns: ['creature_id']
            isOneToOne: false
            referencedRelation: 'ar_creatures'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ar_captures_zone_id_fkey'
            columns: ['zone_id']
            isOneToOne: false
            referencedRelation: 'ar_zones'
            referencedColumns: ['id']
          },
        ]
      }
      ar_capture_attempts: {
        Row: {
          id: number
          phone: string
          creature_id: string | null
          zone_id: string | null
          attempted_at: string
          result: 'success' | 'invalid_token' | 'rate_limit' | 'velocity' | 'zone_rate_limit' | 'duplicate' | 'unknown_error'
          client_lat: number | null
          client_lng: number | null
          detail: Json | null
        }
        Insert: {
          id?: number
          phone: string
          creature_id?: string | null
          zone_id?: string | null
          attempted_at?: string
          result: 'success' | 'invalid_token' | 'rate_limit' | 'velocity' | 'zone_rate_limit' | 'duplicate' | 'unknown_error'
          client_lat?: number | null
          client_lng?: number | null
          detail?: Json | null
        }
        Update: {
          id?: number
          phone?: string
          creature_id?: string | null
          zone_id?: string | null
          attempted_at?: string
          result?: 'success' | 'invalid_token' | 'rate_limit' | 'velocity' | 'zone_rate_limit' | 'duplicate' | 'unknown_error'
          client_lat?: number | null
          client_lng?: number | null
          detail?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: 'ar_capture_attempts_creature_id_fkey'
            columns: ['creature_id']
            isOneToOne: false
            referencedRelation: 'ar_creatures'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ar_capture_attempts_zone_id_fkey'
            columns: ['zone_id']
            isOneToOne: false
            referencedRelation: 'ar_zones'
            referencedColumns: ['id']
          },
        ]
      }
      ar_rewards: {
        Row: {
          id: string
          phone: string
          code: string
          reward_type: 'voucher' | 'prize_claim_trigger'
          amount: number | null
          triggered_by: string
          issued_at: string
          redeemed_at: string | null
          status: 'active' | 'used' | 'expired'
          expires_at: string | null
        }
        Insert: {
          id?: string
          phone: string
          code: string
          reward_type: 'voucher' | 'prize_claim_trigger'
          amount?: number | null
          triggered_by: string
          issued_at?: string
          redeemed_at?: string | null
          status?: 'active' | 'used' | 'expired'
          expires_at?: string | null
        }
        Update: {
          id?: string
          phone?: string
          code?: string
          reward_type?: 'voucher' | 'prize_claim_trigger'
          amount?: number | null
          triggered_by?: string
          issued_at?: string
          redeemed_at?: string | null
          status?: 'active' | 'used' | 'expired'
          expires_at?: string | null
        }
        Relationships: []
      }
      ar_prize_claims: {
        Row: {
          id: number
          phone: string
          claimed_at: string
          reward_type: string | null
          notes: string | null
        }
        Insert: {
          id?: number
          phone: string
          claimed_at?: string
          reward_type?: string | null
          notes?: string | null
        }
        Update: {
          id?: number
          phone?: string
          claimed_at?: string
          reward_type?: string | null
          notes?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      booth_waiting_counts: {
        Row: {
          booth_id: string
          waiting_count: number
        }
        Relationships: [
          {
            foreignKeyName: 'booth_waiting_counts_booth_id_fkey'
            columns: ['booth_id']
            isOneToOne: false
            referencedRelation: 'food_booths'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Functions: {
      decrement_menu_stock: {
        Args: { p_menu_id: string; p_qty: number }
        Returns: number
      }
      capture_creature: {
        Args: {
          p_token: string
          p_phone: string
          p_client_lat: number
          p_client_lng: number
        }
        Returns: Json
      }
      claim_ar_prize: {
        Args: { p_phone: string }
        Returns: Json
      }
      issue_spawn_token: {
        Args: { p_phone: string; p_creature_id: string; p_zone_id: string }
        Returns: string
      }
      generate_ar_reward_code: {
        Args: Record<string, never>
        Returns: string
      }
      haversine_km: {
        Args: { lat1: number; lng1: number; lat2: number; lng2: number }
        Returns: number
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

// Convenience types
export type Festival = Database['public']['Tables']['festivals']['Row']
export type Notice = Database['public']['Tables']['notices']['Row']
export type FoodBooth = Database['public']['Tables']['food_booths']['Row']
export type FoodMenu = Database['public']['Tables']['food_menus']['Row']
export type Payment = Database['public']['Tables']['payments']['Row']
export type PaymentInsert = Database['public']['Tables']['payments']['Insert']
export type Coupon = Database['public']['Tables']['coupons']['Row']
export type CouponInsert = Database['public']['Tables']['coupons']['Insert']
export type Survey = Database['public']['Tables']['surveys']['Row']
export type SurveyInsert = Database['public']['Tables']['surveys']['Insert']
export type Order = Database['public']['Tables']['orders']['Row']
export type OrderInsert = Database['public']['Tables']['orders']['Insert']
export type OrderItem = Database['public']['Tables']['order_items']['Row']
export type OrderItemInsert = Database['public']['Tables']['order_items']['Insert']
export type BoothAccount = Database['public']['Tables']['booth_accounts']['Row']
export type BoothAccountInsert = Database['public']['Tables']['booth_accounts']['Insert']
export type StampPrizeClaim = Database['public']['Tables']['stamp_prize_claims']['Row']

// AR 모듈 (Phase 1 추가)
export type ArGame = Database['public']['Tables']['ar_games']['Row']
export type ArZone = Database['public']['Tables']['ar_zones']['Row']
export type ArZoneInsert = Database['public']['Tables']['ar_zones']['Insert']
export type ArCreature = Database['public']['Tables']['ar_creatures']['Row']
export type ArCreatureInsert = Database['public']['Tables']['ar_creatures']['Insert']
export type ArSpawnToken = Database['public']['Tables']['ar_spawn_tokens']['Row']
export type ArCapture = Database['public']['Tables']['ar_captures']['Row']
export type ArCaptureAttempt = Database['public']['Tables']['ar_capture_attempts']['Row']
export type ArReward = Database['public']['Tables']['ar_rewards']['Row']
export type ArPrizeClaim = Database['public']['Tables']['ar_prize_claims']['Row']
