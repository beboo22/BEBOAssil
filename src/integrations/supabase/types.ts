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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      activity_media: {
        Row: {
          activity_id: string
          activity_name: string | null
          created_at: string
          day_index: number
          id: string
          location_name: string | null
          media_type: string
          media_url: string
          trip_id: string
          user_id: string
        }
        Insert: {
          activity_id: string
          activity_name?: string | null
          created_at?: string
          day_index?: number
          id?: string
          location_name?: string | null
          media_type?: string
          media_url: string
          trip_id: string
          user_id: string
        }
        Update: {
          activity_id?: string
          activity_name?: string | null
          created_at?: string
          day_index?: number
          id?: string
          location_name?: string | null
          media_type?: string
          media_url?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: []
      }
      activity_reviews: {
        Row: {
          activity_name: string
          comment: string | null
          created_at: string
          destination: string | null
          id: string
          photos: string[] | null
          rating: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_name: string
          comment?: string | null
          created_at?: string
          destination?: string | null
          id?: string
          photos?: string[] | null
          rating?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_name?: string
          comment?: string | null
          created_at?: string
          destination?: string | null
          id?: string
          photos?: string[] | null
          rating?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          content: string
          created_at: string
          destination: string
          id: string
          rating: number | null
          status: string
          type: string
          updated_at: string
          user_avatar: string | null
          user_id: string
          user_name: string | null
        }
        Insert: {
          content: string
          created_at?: string
          destination: string
          id?: string
          rating?: number | null
          status?: string
          type?: string
          updated_at?: string
          user_avatar?: string | null
          user_id: string
          user_name?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          destination?: string
          id?: string
          rating?: number | null
          status?: string
          type?: string
          updated_at?: string
          user_avatar?: string | null
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      destinations: {
        Row: {
          avg_price: number
          best_season: string
          city: string
          code: string
          country: string
          created_at: string
          description: string
          description_ar: string | null
          highlights: Json | null
          id: string
          image: string
          is_active: boolean | null
          rating: number
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          avg_price?: number
          best_season?: string
          city: string
          code?: string
          country: string
          created_at?: string
          description?: string
          description_ar?: string | null
          highlights?: Json | null
          id?: string
          image: string
          is_active?: boolean | null
          rating?: number
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          avg_price?: number
          best_season?: string
          city?: string
          code?: string
          country?: string
          created_at?: string
          description?: string
          description_ar?: string | null
          highlights?: Json | null
          id?: string
          image?: string
          is_active?: boolean | null
          rating?: number
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      discount_codes: {
        Row: {
          applicable_to: string | null
          code: string
          created_at: string
          current_uses: number | null
          description: string | null
          discount_amount: number | null
          discount_percent: number | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          max_uses: number | null
        }
        Insert: {
          applicable_to?: string | null
          code: string
          created_at?: string
          current_uses?: number | null
          description?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
        }
        Update: {
          applicable_to?: string | null
          code?: string
          created_at?: string
          current_uses?: number | null
          description?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      event_shares: {
        Row: {
          created_at: string
          event_id: string
          id: string
          platform: string
          referral_code: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          platform?: string
          referral_code?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          platform?: string
          referral_code?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_shares_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "global_events"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          destination: string | null
          id: string
          image_url: string | null
          metadata: Json | null
          place_name: string
          place_type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          destination?: string | null
          id?: string
          image_url?: string | null
          metadata?: Json | null
          place_name: string
          place_type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          destination?: string | null
          id?: string
          image_url?: string | null
          metadata?: Json | null
          place_name?: string
          place_type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      global_events: {
        Row: {
          ai_prompt: string | null
          category: string
          city: string
          country: string
          created_at: string
          description: string
          description_ar: string | null
          end_date: string | null
          google_maps_url: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          is_featured: boolean | null
          latitude: number | null
          longitude: number | null
          metadata: Json | null
          sort_order: number | null
          start_date: string
          ticket_url: string | null
          title: string
          title_ar: string | null
          updated_at: string
          venue: string | null
          website_url: string | null
        }
        Insert: {
          ai_prompt?: string | null
          category?: string
          city: string
          country: string
          created_at?: string
          description?: string
          description_ar?: string | null
          end_date?: string | null
          google_maps_url?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_featured?: boolean | null
          latitude?: number | null
          longitude?: number | null
          metadata?: Json | null
          sort_order?: number | null
          start_date: string
          ticket_url?: string | null
          title: string
          title_ar?: string | null
          updated_at?: string
          venue?: string | null
          website_url?: string | null
        }
        Update: {
          ai_prompt?: string | null
          category?: string
          city?: string
          country?: string
          created_at?: string
          description?: string
          description_ar?: string | null
          end_date?: string | null
          google_maps_url?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_featured?: boolean | null
          latitude?: number | null
          longitude?: number | null
          metadata?: Json | null
          sort_order?: number | null
          start_date?: string
          ticket_url?: string | null
          title?: string
          title_ar?: string | null
          updated_at?: string
          venue?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      inflight_lookups: {
        Row: {
          cache_key: string
          expires_at: string
          started_at: string
          worker_id: string
        }
        Insert: {
          cache_key: string
          expires_at?: string
          started_at?: string
          worker_id: string
        }
        Update: {
          cache_key?: string
          expires_at?: string
          started_at?: string
          worker_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount: number
          billing_country: string | null
          billing_email: string | null
          billing_name: string | null
          created_at: string
          currency: string
          id: string
          invoice_number: string
          issued_at: string
          metadata: Json | null
          payment_method: string | null
          payment_reference: string | null
          plan_id: string | null
          plan_name: string | null
          status: string
          subscription_id: string | null
          tax_amount: number
          total_amount: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount?: number
          billing_country?: string | null
          billing_email?: string | null
          billing_name?: string | null
          created_at?: string
          currency?: string
          id?: string
          invoice_number: string
          issued_at?: string
          metadata?: Json | null
          payment_method?: string | null
          payment_reference?: string | null
          plan_id?: string | null
          plan_name?: string | null
          status?: string
          subscription_id?: string | null
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          billing_country?: string | null
          billing_email?: string | null
          billing_name?: string | null
          created_at?: string
          currency?: string
          id?: string
          invoice_number?: string
          issued_at?: string
          metadata?: Json | null
          payment_method?: string | null
          payment_reference?: string | null
          plan_id?: string | null
          plan_name?: string | null
          status?: string
          subscription_id?: string | null
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "user_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_stream_cohost_requests: {
        Row: {
          created_at: string
          id: string
          requester_avatar: string | null
          requester_id: string
          requester_name: string | null
          responded_at: string | null
          status: string
          stream_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          requester_avatar?: string | null
          requester_id: string
          requester_name?: string | null
          responded_at?: string | null
          status?: string
          stream_id: string
        }
        Update: {
          created_at?: string
          id?: string
          requester_avatar?: string | null
          requester_id?: string
          requester_name?: string | null
          responded_at?: string | null
          status?: string
          stream_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_stream_cohost_requests_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "live_streams"
            referencedColumns: ["id"]
          },
        ]
      }
      live_stream_comments: {
        Row: {
          avatar_url: string | null
          content: string
          created_at: string
          id: string
          stream_id: string
          user_id: string | null
          user_name: string
        }
        Insert: {
          avatar_url?: string | null
          content: string
          created_at?: string
          id?: string
          stream_id: string
          user_id?: string | null
          user_name?: string
        }
        Update: {
          avatar_url?: string | null
          content?: string
          created_at?: string
          id?: string
          stream_id?: string
          user_id?: string | null
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_stream_comments_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "live_streams"
            referencedColumns: ["id"]
          },
        ]
      }
      live_stream_likes: {
        Row: {
          created_at: string
          id: string
          stream_id: string
          user_id: string | null
          viewer_key: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          stream_id: string
          user_id?: string | null
          viewer_key?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          stream_id?: string
          user_id?: string | null
          viewer_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_stream_likes_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "live_streams"
            referencedColumns: ["id"]
          },
        ]
      }
      live_stream_viewers: {
        Row: {
          id: string
          joined_at: string
          stream_id: string
          user_id: string | null
          user_name: string | null
          viewer_key: string
        }
        Insert: {
          id?: string
          joined_at?: string
          stream_id: string
          user_id?: string | null
          user_name?: string | null
          viewer_key: string
        }
        Update: {
          id?: string
          joined_at?: string
          stream_id?: string
          user_id?: string | null
          user_name?: string | null
          viewer_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_stream_viewers_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "live_streams"
            referencedColumns: ["id"]
          },
        ]
      }
      live_streams: {
        Row: {
          active_filter: string | null
          active_stickers: Json | null
          allow_cohost_requests: boolean
          created_at: string
          description: string | null
          ended_at: string | null
          id: string
          imported_trip_data: Json | null
          imported_trip_id: string | null
          is_active: boolean
          latitude: number | null
          location_name: string | null
          longitude: number | null
          parent_stream_id: string | null
          peak_viewers: number
          scheduled_at: string | null
          started_at: string
          status: string
          thumbnail_url: string | null
          title: string
          total_likes: number
          user_id: string
        }
        Insert: {
          active_filter?: string | null
          active_stickers?: Json | null
          allow_cohost_requests?: boolean
          created_at?: string
          description?: string | null
          ended_at?: string | null
          id?: string
          imported_trip_data?: Json | null
          imported_trip_id?: string | null
          is_active?: boolean
          latitude?: number | null
          location_name?: string | null
          longitude?: number | null
          parent_stream_id?: string | null
          peak_viewers?: number
          scheduled_at?: string | null
          started_at?: string
          status?: string
          thumbnail_url?: string | null
          title: string
          total_likes?: number
          user_id: string
        }
        Update: {
          active_filter?: string | null
          active_stickers?: Json | null
          allow_cohost_requests?: boolean
          created_at?: string
          description?: string | null
          ended_at?: string | null
          id?: string
          imported_trip_data?: Json | null
          imported_trip_id?: string | null
          is_active?: boolean
          latitude?: number | null
          location_name?: string | null
          longitude?: number | null
          parent_stream_id?: string | null
          peak_viewers?: number
          scheduled_at?: string | null
          started_at?: string
          status?: string
          thumbnail_url?: string | null
          title?: string
          total_likes?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_streams_parent_stream_id_fkey"
            columns: ["parent_stream_id"]
            isOneToOne: false
            referencedRelation: "live_streams"
            referencedColumns: ["id"]
          },
        ]
      }
      memories: {
        Row: {
          activity_name: string | null
          created_at: string | null
          description: string | null
          id: string
          is_published: boolean | null
          latitude: number | null
          location_name: string | null
          longitude: number | null
          media_urls: string[] | null
          memory_type: string
          title: string
          trip_data: Json | null
          trip_id: string | null
          updated_at: string | null
          user_id: string
          video_url: string | null
        }
        Insert: {
          activity_name?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_published?: boolean | null
          latitude?: number | null
          location_name?: string | null
          longitude?: number | null
          media_urls?: string[] | null
          memory_type?: string
          title: string
          trip_data?: Json | null
          trip_id?: string | null
          updated_at?: string | null
          user_id: string
          video_url?: string | null
        }
        Update: {
          activity_name?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_published?: boolean | null
          latitude?: number | null
          location_name?: string | null
          longitude?: number | null
          media_urls?: string[] | null
          memory_type?: string
          title?: string
          trip_data?: Json | null
          trip_id?: string | null
          updated_at?: string | null
          user_id?: string
          video_url?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          metadata: Json | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          metadata?: Json | null
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          metadata?: Json | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          created_at: string
          currency: string
          guest_email: string | null
          guest_id: string | null
          id: string
          item_id: string
          item_name: string
          notes: string | null
          order_type: string
          payment_method: string | null
          payment_reference: string | null
          quantity: number
          shipping_address: Json | null
          status: string
          total_price: number
          unit_price: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          currency?: string
          guest_email?: string | null
          guest_id?: string | null
          id?: string
          item_id: string
          item_name: string
          notes?: string | null
          order_type?: string
          payment_method?: string | null
          payment_reference?: string | null
          quantity?: number
          shipping_address?: Json | null
          status?: string
          total_price: number
          unit_price: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          guest_email?: string | null
          guest_id?: string | null
          id?: string
          item_id?: string
          item_name?: string
          notes?: string | null
          order_type?: string
          payment_method?: string | null
          payment_reference?: string | null
          quantity?: number
          shipping_address?: Json | null
          status?: string
          total_price?: number
          unit_price?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      page_views: {
        Row: {
          country: string | null
          created_at: string
          guest_id: string | null
          id: string
          language: string | null
          page_path: string
          page_title: string | null
          referrer: string | null
          screen_height: number | null
          screen_width: number | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          guest_id?: string | null
          id?: string
          language?: string | null
          page_path: string
          page_title?: string | null
          referrer?: string | null
          screen_height?: number | null
          screen_width?: number | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          guest_id?: string | null
          id?: string
          language?: string | null
          page_path?: string
          page_title?: string | null
          referrer?: string | null
          screen_height?: number | null
          screen_width?: number | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      partner_listings: {
        Row: {
          address: string | null
          amenities: string[] | null
          booking_url: string | null
          city: string
          contact_email: string | null
          contact_phone: string | null
          contact_whatsapp: string | null
          country: string
          created_at: string
          currency: string
          description: string
          description_ar: string | null
          end_date: string | null
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          latitude: number | null
          listing_type: string
          longitude: number | null
          media_urls: string[] | null
          original_price: number | null
          partner_logo: string | null
          partner_name: string | null
          price: number
          rating: number | null
          review_count: number | null
          sort_order: number | null
          specs: Json | null
          start_date: string | null
          title: string
          title_ar: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          amenities?: string[] | null
          booking_url?: string | null
          city: string
          contact_email?: string | null
          contact_phone?: string | null
          contact_whatsapp?: string | null
          country: string
          created_at?: string
          currency?: string
          description?: string
          description_ar?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          latitude?: number | null
          listing_type?: string
          longitude?: number | null
          media_urls?: string[] | null
          original_price?: number | null
          partner_logo?: string | null
          partner_name?: string | null
          price?: number
          rating?: number | null
          review_count?: number | null
          sort_order?: number | null
          specs?: Json | null
          start_date?: string | null
          title: string
          title_ar?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          amenities?: string[] | null
          booking_url?: string | null
          city?: string
          contact_email?: string | null
          contact_phone?: string | null
          contact_whatsapp?: string | null
          country?: string
          created_at?: string
          currency?: string
          description?: string
          description_ar?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          latitude?: number | null
          listing_type?: string
          longitude?: number | null
          media_urls?: string[] | null
          original_price?: number | null
          partner_logo?: string | null
          partner_name?: string | null
          price?: number
          rating?: number | null
          review_count?: number | null
          sort_order?: number | null
          specs?: Json | null
          start_date?: string | null
          title?: string
          title_ar?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      places_cache: {
        Row: {
          cache_key: string
          city: string | null
          created_at: string
          cuisine: string | null
          expires_at: string
          hit_count: number
          id: string
          interest: string | null
          language: string | null
          last_accessed_at: string
          meal_type: string | null
          query: string
          results: Json
          results_count: number
          source: string
          venue_address: string | null
          venue_latitude: number | null
          venue_longitude: number | null
        }
        Insert: {
          cache_key: string
          city?: string | null
          created_at?: string
          cuisine?: string | null
          expires_at?: string
          hit_count?: number
          id?: string
          interest?: string | null
          language?: string | null
          last_accessed_at?: string
          meal_type?: string | null
          query: string
          results?: Json
          results_count?: number
          source?: string
          venue_address?: string | null
          venue_latitude?: number | null
          venue_longitude?: number | null
        }
        Update: {
          cache_key?: string
          city?: string | null
          created_at?: string
          cuisine?: string | null
          expires_at?: string
          hit_count?: number
          id?: string
          interest?: string | null
          language?: string | null
          last_accessed_at?: string
          meal_type?: string | null
          query?: string
          results?: Json
          results_count?: number
          source?: string
          venue_address?: string | null
          venue_latitude?: number | null
          venue_longitude?: number | null
        }
        Relationships: []
      }
      places_usage: {
        Row: {
          category: string | null
          city: string | null
          id: string
          last_used_at: string
          place_key: string
          place_name: string | null
          usage_count: number
          user_id: string | null
        }
        Insert: {
          category?: string | null
          city?: string | null
          id?: string
          last_used_at?: string
          place_key: string
          place_name?: string | null
          usage_count?: number
          user_id?: string | null
        }
        Update: {
          category?: string | null
          city?: string | null
          id?: string
          last_used_at?: string
          place_key?: string
          place_name?: string | null
          usage_count?: number
          user_id?: string | null
        }
        Relationships: []
      }
      price_variance_alerts: {
        Row: {
          acknowledged: boolean
          acknowledged_at: string | null
          acknowledged_by: string | null
          api_price: number | null
          created_at: string
          currency: string | null
          destination: string | null
          estimated_price: number | null
          id: string
          metadata: Json | null
          origin: string | null
          provider: string | null
          resource_type: string
          severity: string
          threshold_pct: number
          user_id: string | null
          variance_pct: number | null
        }
        Insert: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          api_price?: number | null
          created_at?: string
          currency?: string | null
          destination?: string | null
          estimated_price?: number | null
          id?: string
          metadata?: Json | null
          origin?: string | null
          provider?: string | null
          resource_type: string
          severity?: string
          threshold_pct?: number
          user_id?: string | null
          variance_pct?: number | null
        }
        Update: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          api_price?: number | null
          created_at?: string
          currency?: string | null
          destination?: string | null
          estimated_price?: number | null
          id?: string
          metadata?: Json | null
          origin?: string | null
          provider?: string | null
          resource_type?: string
          severity?: string
          threshold_pct?: number
          user_id?: string | null
          variance_pct?: number | null
        }
        Relationships: []
      }
      privacy_policy: {
        Row: {
          content_ar: string
          content_en: string
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content_ar?: string
          content_en?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content_ar?: string
          content_en?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      product_reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          product_id: string
          rating: number
          updated_at: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          product_id: string
          rating: number
          updated_at?: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          product_id?: string
          rating?: number
          updated_at?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string
          created_at: string
          currency: string
          description: string
          description_ar: string | null
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          media_urls: string[] | null
          name: string
          name_ar: string | null
          original_price: number | null
          price: number
          sort_order: number | null
          specs: Json | null
          stock_quantity: number | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          currency?: string
          description?: string
          description_ar?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          media_urls?: string[] | null
          name: string
          name_ar?: string | null
          original_price?: number | null
          price?: number
          sort_order?: number | null
          specs?: Json | null
          stock_quantity?: number | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          currency?: string
          description?: string
          description_ar?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          media_urls?: string[] | null
          name?: string
          name_ar?: string | null
          original_price?: number | null
          price?: number
          sort_order?: number | null
          specs?: Json | null
          stock_quantity?: number | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          age: number | null
          avatar_url: string | null
          birthdate: string | null
          country: string | null
          created_at: string
          email: string | null
          full_name: string | null
          gender: string | null
          id: string
          preferred_currency: string | null
          preferred_language: string | null
          referral_code: string | null
          referred_by: string | null
          total_points: number | null
          travel_interests: string[] | null
          updated_at: string
          username: string | null
        }
        Insert: {
          age?: number | null
          avatar_url?: string | null
          birthdate?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          gender?: string | null
          id: string
          preferred_currency?: string | null
          preferred_language?: string | null
          referral_code?: string | null
          referred_by?: string | null
          total_points?: number | null
          travel_interests?: string[] | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          age?: number | null
          avatar_url?: string | null
          birthdate?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          preferred_currency?: string | null
          preferred_language?: string | null
          referral_code?: string | null
          referred_by?: string | null
          total_points?: number | null
          travel_interests?: string[] | null
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          ai_prompt: string | null
          created_at: string
          cta_destination: string | null
          description: string
          description_ar: string | null
          end_date: string | null
          id: string
          included_places: Json | null
          is_active: boolean | null
          linked_destination_id: string | null
          linked_event_id: string | null
          media_type: string
          media_urls: string[] | null
          sort_order: number | null
          start_date: string | null
          title: string
          title_ar: string | null
          updated_at: string
        }
        Insert: {
          ai_prompt?: string | null
          created_at?: string
          cta_destination?: string | null
          description?: string
          description_ar?: string | null
          end_date?: string | null
          id?: string
          included_places?: Json | null
          is_active?: boolean | null
          linked_destination_id?: string | null
          linked_event_id?: string | null
          media_type?: string
          media_urls?: string[] | null
          sort_order?: number | null
          start_date?: string | null
          title: string
          title_ar?: string | null
          updated_at?: string
        }
        Update: {
          ai_prompt?: string | null
          created_at?: string
          cta_destination?: string | null
          description?: string
          description_ar?: string | null
          end_date?: string | null
          id?: string
          included_places?: Json | null
          is_active?: boolean | null
          linked_destination_id?: string | null
          linked_event_id?: string | null
          media_type?: string
          media_urls?: string[] | null
          sort_order?: number | null
          start_date?: string | null
          title?: string
          title_ar?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotions_linked_destination_id_fkey"
            columns: ["linked_destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_linked_event_id_fkey"
            columns: ["linked_event_id"]
            isOneToOne: false
            referencedRelation: "global_events"
            referencedColumns: ["id"]
          },
        ]
      }
      reels_drafts: {
        Row: {
          created_at: string
          id: string
          images: string[] | null
          location: string | null
          settings: Json | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          images?: string[] | null
          location?: string | null
          settings?: Json | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          images?: string[] | null
          location?: string | null
          settings?: Json | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          completed_at: string | null
          created_at: string | null
          id: string
          points_awarded: boolean | null
          referral_code: string
          referred_email: string | null
          referred_user_id: string | null
          referrer_id: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          points_awarded?: boolean | null
          referral_code: string
          referred_email?: string | null
          referred_user_id?: string | null
          referrer_id: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          points_awarded?: boolean | null
          referral_code?: string
          referred_email?: string | null
          referred_user_id?: string | null
          referrer_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_trips: {
        Row: {
          created_at: string
          destination: string
          id: string
          trip_data: Json
          trip_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          destination: string
          id?: string
          trip_data: Json
          trip_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          destination?: string
          id?: string
          trip_data?: Json
          trip_id?: string
          user_id?: string
        }
        Relationships: []
      }
      search_analytics: {
        Row: {
          clicked_result: string | null
          created_at: string
          destination: string | null
          guest_id: string | null
          id: string
          ip_address: unknown
          results_count: number | null
          search_query: string | null
          search_type: string | null
          session_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          clicked_result?: string | null
          created_at?: string
          destination?: string | null
          guest_id?: string | null
          id?: string
          ip_address?: unknown
          results_count?: number | null
          search_query?: string | null
          search_type?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          clicked_result?: string | null
          created_at?: string
          destination?: string | null
          guest_id?: string | null
          id?: string
          ip_address?: unknown
          results_count?: number | null
          search_query?: string | null
          search_type?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      search_history: {
        Row: {
          created_at: string
          destination: string | null
          id: string
          metadata: Json | null
          query_text: string | null
          search_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          destination?: string | null
          id?: string
          metadata?: Json | null
          query_text?: string | null
          search_type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          destination?: string | null
          id?: string
          metadata?: Json | null
          query_text?: string | null
          search_type?: string
          user_id?: string
        }
        Relationships: []
      }
      serpapi_usage: {
        Row: {
          blocked_by_gate: boolean
          cache_hit: boolean
          city: string | null
          context: string | null
          cost_usd: number
          created_at: string
          endpoint: string
          guest_id: string | null
          id: string
          query: string
          results_count: number
          user_id: string | null
        }
        Insert: {
          blocked_by_gate?: boolean
          cache_hit?: boolean
          city?: string | null
          context?: string | null
          cost_usd?: number
          created_at?: string
          endpoint?: string
          guest_id?: string | null
          id?: string
          query: string
          results_count?: number
          user_id?: string | null
        }
        Update: {
          blocked_by_gate?: boolean
          cache_hit?: boolean
          city?: string | null
          context?: string | null
          cost_usd?: number
          created_at?: string
          endpoint?: string
          guest_id?: string | null
          id?: string
          query?: string
          results_count?: number
          user_id?: string | null
        }
        Relationships: []
      }
      shared_trips: {
        Row: {
          created_at: string
          destination: string
          id: string
          share_code: string
          shared_by: string | null
          shared_with_email: string | null
          trip_data: Json
          trip_id: string
        }
        Insert: {
          created_at?: string
          destination: string
          id?: string
          share_code?: string
          shared_by?: string | null
          shared_with_email?: string | null
          trip_data: Json
          trip_id: string
        }
        Update: {
          created_at?: string
          destination?: string
          id?: string
          share_code?: string
          shared_by?: string | null
          shared_with_email?: string | null
          trip_data?: Json
          trip_id?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          ai_models_config: Json | null
          announcement_banner_enabled: boolean | null
          announcement_banner_text: string | null
          app_store_links: Json | null
          data_sources_config: Json | null
          financial_config: Json | null
          flex_plan_config: Json | null
          free_user_daily_limit: number
          guest_chat_enabled: boolean
          guest_generation_enabled: boolean | null
          guest_max_chat_uses: number
          guest_max_voice_uses: number
          guest_trial_limit: number
          guest_voice_enabled: boolean
          id: string
          nav_order: Json | null
          points_config: Json | null
          regen_costs_config: Json | null
          rewards_config: Json | null
          scheduled_notifications: Json | null
          serpapi_bank_config: Json
          social_links: Json | null
          streak_challenges_config: Json | null
          updated_at: string
        }
        Insert: {
          ai_models_config?: Json | null
          announcement_banner_enabled?: boolean | null
          announcement_banner_text?: string | null
          app_store_links?: Json | null
          data_sources_config?: Json | null
          financial_config?: Json | null
          flex_plan_config?: Json | null
          free_user_daily_limit?: number
          guest_chat_enabled?: boolean
          guest_generation_enabled?: boolean | null
          guest_max_chat_uses?: number
          guest_max_voice_uses?: number
          guest_trial_limit?: number
          guest_voice_enabled?: boolean
          id?: string
          nav_order?: Json | null
          points_config?: Json | null
          regen_costs_config?: Json | null
          rewards_config?: Json | null
          scheduled_notifications?: Json | null
          serpapi_bank_config?: Json
          social_links?: Json | null
          streak_challenges_config?: Json | null
          updated_at?: string
        }
        Update: {
          ai_models_config?: Json | null
          announcement_banner_enabled?: boolean | null
          announcement_banner_text?: string | null
          app_store_links?: Json | null
          data_sources_config?: Json | null
          financial_config?: Json | null
          flex_plan_config?: Json | null
          free_user_daily_limit?: number
          guest_chat_enabled?: boolean
          guest_generation_enabled?: boolean | null
          guest_max_chat_uses?: number
          guest_max_voice_uses?: number
          guest_trial_limit?: number
          guest_voice_enabled?: boolean
          id?: string
          nav_order?: Json | null
          points_config?: Json | null
          regen_costs_config?: Json | null
          rewards_config?: Json | null
          scheduled_notifications?: Json | null
          serpapi_bank_config?: Json
          social_links?: Json | null
          streak_challenges_config?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      story_comments: {
        Row: {
          content: string
          created_at: string | null
          id: string
          story_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          story_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          story_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_comments_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "travel_stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      story_likes: {
        Row: {
          created_at: string | null
          id: string
          story_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          story_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          story_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_likes_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "travel_stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      story_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reported_by: string
          resolution_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          story_id: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reported_by: string
          resolution_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          story_id: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reported_by?: string
          resolution_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          story_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_reports_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_reports_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "travel_stories"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          chat_enabled: boolean
          created_at: string
          currency: string
          daily_limit: number
          description: string | null
          description_ar: string | null
          duration_days: number
          emergency_enabled: boolean
          features: Json | null
          id: string
          is_active: boolean | null
          max_activities_per_day: number
          max_chat_uses: number
          max_daily_generations: number
          max_emergency_uses: number
          max_flight_results_per_search: number
          max_generation_days: number
          max_hotel_results_per_search: number
          max_monthly_generations: number
          max_news_uses: number
          max_serpapi_flight_searches: number
          max_serpapi_hotel_searches: number
          max_total_activities: number
          max_voice_uses: number
          max_weather_uses: number
          name: string
          name_ar: string | null
          news_enabled: boolean
          price: number
          regen_activity_cost: number
          regen_day_multiplier: number
          regen_full_multiplier: number
          serpapi_flights_enabled: boolean
          serpapi_hotels_enabled: boolean
          sort_order: number | null
          updated_at: string
          voice_enabled: boolean
          weather_enabled: boolean
        }
        Insert: {
          chat_enabled?: boolean
          created_at?: string
          currency?: string
          daily_limit?: number
          description?: string | null
          description_ar?: string | null
          duration_days?: number
          emergency_enabled?: boolean
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_activities_per_day?: number
          max_chat_uses?: number
          max_daily_generations?: number
          max_emergency_uses?: number
          max_flight_results_per_search?: number
          max_generation_days?: number
          max_hotel_results_per_search?: number
          max_monthly_generations?: number
          max_news_uses?: number
          max_serpapi_flight_searches?: number
          max_serpapi_hotel_searches?: number
          max_total_activities?: number
          max_voice_uses?: number
          max_weather_uses?: number
          name: string
          name_ar?: string | null
          news_enabled?: boolean
          price?: number
          regen_activity_cost?: number
          regen_day_multiplier?: number
          regen_full_multiplier?: number
          serpapi_flights_enabled?: boolean
          serpapi_hotels_enabled?: boolean
          sort_order?: number | null
          updated_at?: string
          voice_enabled?: boolean
          weather_enabled?: boolean
        }
        Update: {
          chat_enabled?: boolean
          created_at?: string
          currency?: string
          daily_limit?: number
          description?: string | null
          description_ar?: string | null
          duration_days?: number
          emergency_enabled?: boolean
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_activities_per_day?: number
          max_chat_uses?: number
          max_daily_generations?: number
          max_emergency_uses?: number
          max_flight_results_per_search?: number
          max_generation_days?: number
          max_hotel_results_per_search?: number
          max_monthly_generations?: number
          max_news_uses?: number
          max_serpapi_flight_searches?: number
          max_serpapi_hotel_searches?: number
          max_total_activities?: number
          max_voice_uses?: number
          max_weather_uses?: number
          name?: string
          name_ar?: string | null
          news_enabled?: boolean
          price?: number
          regen_activity_cost?: number
          regen_day_multiplier?: number
          regen_full_multiplier?: number
          serpapi_flights_enabled?: boolean
          serpapi_hotels_enabled?: boolean
          sort_order?: number | null
          updated_at?: string
          voice_enabled?: boolean
          weather_enabled?: boolean
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      terms_conditions: {
        Row: {
          content_ar: string
          content_en: string
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content_ar?: string
          content_en?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content_ar?: string
          content_en?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      travel_stories: {
        Row: {
          content: string
          created_at: string | null
          id: string
          latitude: number | null
          likes_count: number | null
          location_name: string | null
          longitude: number | null
          media_urls: string[] | null
          title: string
          trip_data: Json | null
          updated_at: string | null
          user_id: string
          video_url: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          latitude?: number | null
          likes_count?: number | null
          location_name?: string | null
          longitude?: number | null
          media_urls?: string[] | null
          title: string
          trip_data?: Json | null
          updated_at?: string | null
          user_id: string
          video_url?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          latitude?: number | null
          likes_count?: number | null
          location_name?: string | null
          longitude?: number | null
          media_urls?: string[] | null
          title?: string
          trip_data?: Json | null
          updated_at?: string | null
          user_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "travel_stories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_tracking: {
        Row: {
          feature: string
          guest_id: string | null
          id: string
          quantity: number
          used_at: string
          user_id: string | null
        }
        Insert: {
          feature?: string
          guest_id?: string | null
          id?: string
          quantity?: number
          used_at?: string
          user_id?: string | null
        }
        Update: {
          feature?: string
          guest_id?: string | null
          id?: string
          quantity?: number
          used_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_follows: {
        Row: {
          created_at: string | null
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string | null
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string | null
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_generation_overrides: {
        Row: {
          created_at: string
          expires_at: string | null
          granted_by: string | null
          id: string
          override_type: string
          reason: string | null
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          override_type?: string
          reason?: string | null
          user_id: string
          value?: number
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          override_type?: string
          reason?: string | null
          user_id?: string
          value?: number
        }
        Relationships: []
      }
      user_points: {
        Row: {
          created_at: string | null
          id: string
          points: number
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          points: number
          reason: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          points?: number
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_points_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      user_subscriptions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          plan_id: string | null
          starts_at: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          plan_id?: string | null
          starts_at?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          plan_id?: string | null
          starts_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_vehicles: {
        Row: {
          color: string | null
          created_at: string
          fuel_capacity: number | null
          fuel_consumption: number | null
          fuel_type: string | null
          id: string
          is_primary: boolean | null
          license_plate: string | null
          make: string
          model: string
          updated_at: string
          user_id: string
          year: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          fuel_capacity?: number | null
          fuel_consumption?: number | null
          fuel_type?: string | null
          id?: string
          is_primary?: boolean | null
          license_plate?: string | null
          make: string
          model: string
          updated_at?: string
          user_id: string
          year?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string
          fuel_capacity?: number | null
          fuel_consumption?: number | null
          fuel_type?: string | null
          id?: string
          is_primary?: boolean | null
          license_plate?: string | null
          make?: string
          model?: string
          updated_at?: string
          user_id?: string
          year?: number | null
        }
        Relationships: []
      }
      vehicle_analytics: {
        Row: {
          created_at: string
          destination: string | null
          fuel_cost: number | null
          fuel_stops: number | null
          id: string
          trip_date: string | null
          trip_distance: number | null
          user_id: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          destination?: string | null
          fuel_cost?: number | null
          fuel_stops?: number | null
          id?: string
          trip_date?: string | null
          trip_distance?: number | null
          user_id: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          destination?: string | null
          fuel_cost?: number | null
          fuel_stops?: number | null
          id?: string
          trip_date?: string | null
          trip_distance?: number | null
          user_id?: string
          vehicle_id?: string | null
        }
        Relationships: []
      }
      world_cities: {
        Row: {
          admin1: string | null
          alt_names: string | null
          ascii_name: string
          country_code: string
          country_name: string
          created_at: string
          feature_code: string | null
          id: number
          latitude: number
          longitude: number
          name: string
          name_ar: string | null
          population: number
          timezone: string | null
        }
        Insert: {
          admin1?: string | null
          alt_names?: string | null
          ascii_name: string
          country_code: string
          country_name: string
          created_at?: string
          feature_code?: string | null
          id: number
          latitude: number
          longitude: number
          name: string
          name_ar?: string | null
          population?: number
          timezone?: string | null
        }
        Update: {
          admin1?: string | null
          alt_names?: string | null
          ascii_name?: string
          country_code?: string
          country_name?: string
          created_at?: string
          feature_code?: string | null
          id?: number
          latitude?: number
          longitude?: number
          name?: string
          name_ar?: string | null
          population?: number
          timezone?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_stale_inflight_lookups: { Args: never; Returns: undefined }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      generate_invoice_number: { Args: never; Returns: string }
      get_public_profile: {
        Args: { _user_id: string }
        Returns: {
          avatar_url: string
          created_at: string
          full_name: string
          id: string
          total_points: number
          travel_interests: string[]
          username: string
        }[]
      }
      get_public_profiles: {
        Args: { _user_ids: string[] }
        Returns: {
          avatar_url: string
          full_name: string
          id: string
          username: string
        }[]
      }
      get_total_used_activities: {
        Args: { p_since: string; p_user_id: string }
        Returns: number
      }
      grant_remaining_credits_on_upgrade: {
        Args: { _new_plan_id: string; _user_id: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      release_lookup_lock: {
        Args: { _cache_key: string; _worker_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      touch_place_usage: {
        Args: {
          p_category?: string
          p_city?: string
          p_place_key: string
          p_place_name?: string
          p_user_id: string
        }
        Returns: undefined
      }
      try_acquire_lookup_lock: {
        Args: { _cache_key: string; _ttl_seconds?: number; _worker_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
