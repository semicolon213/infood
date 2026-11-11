
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "ai_usage": {
                  Row: {
                    "count": number,"store_id": string,"used_on": string
                  }
                  ComputedFields: never
                  Insert: {
                    "count"?: number,"store_id": string,"used_on": string
                  }
                  Update: {
                    "count"?: number,"store_id"?: string,"used_on"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_usage_store_id_fkey"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"ingredient_units": {
                  Row: {
                    "factor": number,"ingredient_id": string,"store_id": string,"unit_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "factor": number,"ingredient_id": string,"store_id": string,"unit_name": string
                  }
                  Update: {
                    "factor"?: number,"ingredient_id"?: string,"store_id"?: string,"unit_name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ingredient_units_ingredient_id_fkey"
      columns: ["ingredient_id"]
isOneToOne: false
      referencedRelation: "ingredients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ingredient_units_store_id_fkey"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"ingredients": {
                  Row: {
                    "category": string | null,"created_at": string,"default_shelf_days": number | null,"id": string,"is_active": boolean,"min_stock": number,"name": string,"storage": Database["public"]['Enums']["storage_type"],"store_id": string,"target_stock": number | null,"track_expiry": boolean,"unit": Database["public"]['Enums']["unit_type"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string | null,"created_at"?: string,"default_shelf_days"?: number | null,"id"?: string,"is_active"?: boolean,"min_stock"?: number,"name": string,"storage"?: Database["public"]['Enums']["storage_type"],"store_id": string,"target_stock"?: number | null,"track_expiry"?: boolean,"unit": Database["public"]['Enums']["unit_type"],"updated_at"?: string
                  }
                  Update: {
                    "category"?: string | null,"created_at"?: string,"default_shelf_days"?: number | null,"id"?: string,"is_active"?: boolean,"min_stock"?: number,"name"?: string,"storage"?: Database["public"]['Enums']["storage_type"],"store_id"?: string,"target_stock"?: number | null,"track_expiry"?: boolean,"unit"?: Database["public"]['Enums']["unit_type"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ingredients_store_id_fkey"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"menus": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"is_special": boolean,"name": string,"price": number,"store_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"is_special"?: boolean,"name": string,"price": number,"store_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"is_special"?: boolean,"name"?: string,"price"?: number,"store_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "menus_store_id_fkey"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"purchase_order_items": {
                  Row: {
                    "ingredient_id": string,"order_id": string,"qty": number,"store_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ingredient_id": string,"order_id": string,"qty": number,"store_id": string
                  }
                  Update: {
                    "ingredient_id"?: string,"order_id"?: string,"qty"?: number,"store_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchase_order_items_ingredient_id_fkey"
      columns: ["ingredient_id"]
isOneToOne: false
      referencedRelation: "ingredients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "purchase_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_order_items_store_id_fkey"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"purchase_orders": {
                  Row: {
                    "created_at": string,"id": string,"memo": string | null,"order_date": string,"ordered_at": string | null,"received_at": string | null,"status": Database["public"]['Enums']["order_status"],"store_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"memo"?: string | null,"order_date": string,"ordered_at"?: string | null,"received_at"?: string | null,"status"?: Database["public"]['Enums']["order_status"],"store_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"memo"?: string | null,"order_date"?: string,"ordered_at"?: string | null,"received_at"?: string | null,"status"?: Database["public"]['Enums']["order_status"],"store_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchase_orders_store_id_fkey"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_items": {
                  Row: {
                    "ingredient_id": string,"menu_id": string,"qty": number,"store_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ingredient_id": string,"menu_id": string,"qty": number,"store_id": string
                  }
                  Update: {
                    "ingredient_id"?: string,"menu_id"?: string,"qty"?: number,"store_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_items_ingredient_id_fkey"
      columns: ["ingredient_id"]
isOneToOne: false
      referencedRelation: "ingredients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_items_menu_id_fkey"
      columns: ["menu_id"]
isOneToOne: false
      referencedRelation: "menus"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_items_store_id_fkey"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"recommendations": {
                  Row: {
                    "accepted": boolean,"basis": string,"created_at": string,"dropped_count": number,"fallback": boolean,"id": string,"input_snapshot": NonNullable<Json>,"result_json": NonNullable<Json>,"short_count": number,"store_id": string,"unregistered_count": number
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted"?: boolean,"basis"?: string,"created_at"?: string,"dropped_count"?: number,"fallback"?: boolean,"id"?: string,"input_snapshot": NonNullable<Json>,"result_json": NonNullable<Json>,"short_count"?: number,"store_id": string,"unregistered_count"?: number
                  }
                  Update: {
                    "accepted"?: boolean,"basis"?: string,"created_at"?: string,"dropped_count"?: number,"fallback"?: boolean,"id"?: string,"input_snapshot"?: NonNullable<Json>,"result_json"?: NonNullable<Json>,"short_count"?: number,"store_id"?: string,"unregistered_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "recommendations_store_id_fkey"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"sales": {
                  Row: {
                    "id": string,"menu_id": string,"qty": number,"sales_day_id": string,"store_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"menu_id": string,"qty": number,"sales_day_id": string,"store_id": string
                  }
                  Update: {
                    "id"?: string,"menu_id"?: string,"qty"?: number,"sales_day_id"?: string,"store_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sales_menu_id_fkey"
      columns: ["menu_id"]
isOneToOne: false
      referencedRelation: "menus"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_sales_day_id_fkey"
      columns: ["sales_day_id"]
isOneToOne: false
      referencedRelation: "sales_days"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_store_id_fkey"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"sales_days": {
                  Row: {
                    "id": string,"shortages": NonNullable<Json>,"sold_on": string,"store_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"shortages"?: NonNullable<Json>,"sold_on": string,"store_id": string,"updated_at"?: string
                  }
                  Update: {
                    "id"?: string,"shortages"?: NonNullable<Json>,"sold_on"?: string,"store_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sales_days_store_id_fkey"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_lots": {
                  Row: {
                    "created_at": string,"expires_at": string | null,"expiry_source": Database["public"]['Enums']["expiry_source"] | null,"id": string,"ingredient_id": string,"quantity": number,"receipt_id": string | null,"received_at": string,"remaining": number,"store_id": string,"unit_price": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at"?: string | null,"expiry_source"?: Database["public"]['Enums']["expiry_source"] | null,"id"?: string,"ingredient_id": string,"quantity": number,"receipt_id"?: string | null,"received_at": string,"remaining": number,"store_id": string,"unit_price"?: number | null
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string | null,"expiry_source"?: Database["public"]['Enums']["expiry_source"] | null,"id"?: string,"ingredient_id"?: string,"quantity"?: number,"receipt_id"?: string | null,"received_at"?: string,"remaining"?: number,"store_id"?: string,"unit_price"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_lots_ingredient_id_fkey"
      columns: ["ingredient_id"]
isOneToOne: false
      referencedRelation: "ingredients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_lots_store_id_fkey"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_movements": {
                  Row: {
                    "created_at": string,"delta": number,"id": string,"ingredient_id": string,"lot_id": string | null,"memo": string | null,"reason": string | null,"ref_id": string | null,"ref_type": string,"store_id": string,"type": Database["public"]['Enums']["movement_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"delta": number,"id"?: string,"ingredient_id": string,"lot_id"?: string | null,"memo"?: string | null,"reason"?: string | null,"ref_id"?: string | null,"ref_type": string,"store_id": string,"type": Database["public"]['Enums']["movement_type"]
                  }
                  Update: {
                    "created_at"?: string,"delta"?: number,"id"?: string,"ingredient_id"?: string,"lot_id"?: string | null,"memo"?: string | null,"reason"?: string | null,"ref_id"?: string | null,"ref_type"?: string,"store_id"?: string,"type"?: Database["public"]['Enums']["movement_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_movements_ingredient_id_fkey"
      columns: ["ingredient_id"]
isOneToOne: false
      referencedRelation: "ingredients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_lot_id_fkey"
      columns: ["lot_id"]
isOneToOne: false
      referencedRelation: "stock_lots"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_store_id_fkey"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"stores": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"owner_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"owner_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"owner_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"usage_records": {
                  Row: {
                    "created_at": string,"id": string,"ingredient_id": string,"memo": string | null,"qty": number,"short_qty": number,"store_id": string,"used_on": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"ingredient_id": string,"memo"?: string | null,"qty": number,"short_qty"?: number,"store_id": string,"used_on": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"ingredient_id"?: string,"memo"?: string | null,"qty"?: number,"short_qty"?: number,"store_id"?: string,"used_on"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "usage_records_ingredient_id_fkey"
      columns: ["ingredient_id"]
isOneToOne: false
      referencedRelation: "ingredients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "usage_records_store_id_fkey"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "adjust_lot":
{ Args: { "p_lot_id": string,"p_memo": string,"p_new_remaining": number }; Returns: number
                           },
"get_ingredient_stock":
{ Args: { "p_store_id": string,"p_today": string }; Returns: {
              "available_remaining": number,"expired_remaining": number,"ingredient_id": string,"is_low": boolean,"min_stock": number,"name": string,"nearest_expires_at": string,"target_stock": number,"total_remaining": number,"unit": Database["public"]['Enums']["unit_type"]
            }[]
                           },
"increment_ai_usage":
{ Args: { "p_limit": number,"p_store_id": string,"p_today": string }; Returns: number
                           },
"is_my_store":
{ Args: { "sid": string }; Returns: boolean
                           },
"receive_stock":
{ Args: { "p_lots": Json,"p_ref_id": string,"p_ref_type": string,"p_store_id": string }; Returns: string[]
                           },
"record_daily_sales":
{ Args: { "p_plan": Json,"p_sales": Json,"p_shortages": Json,"p_sold_on": string,"p_store_id": string }; Returns: string
                           },
"record_usage":
{ Args: { "p_items": Json,"p_plan": Json,"p_store_id": string,"p_used_on": string }; Returns: string[]
                           },
"record_waste":
{ Args: { "p_lot_id": string,"p_memo": string,"p_qty": number,"p_reason": string,"p_store_id": string }; Returns: undefined
                           },
"save_order":
{ Args: { "p_items": Json,"p_memo": string,"p_order_date": string,"p_order_id": string,"p_store_id": string }; Returns: string
                           }
          }
          Enums: {
            "expiry_source": "manual"|"default","movement_type": "in"|"use"|"waste"|"adjust","order_status": "draft"|"ordered"|"received","storage_type": "fridge"|"freezer"|"room","unit_type": "g"|"ml"|"ea"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "expiry_source": ["manual", "default"],"movement_type": ["in", "use", "waste", "adjust"],"order_status": ["draft", "ordered", "received"],"storage_type": ["fridge", "freezer", "room"],"unit_type": ["g", "ml", "ea"]
          }
        }
} as const
