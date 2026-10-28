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
      cracha_badge_templates: {
        Row: {
          ai_layout_bg_url: string | null
          ai_layout_suggestion: Json | null
          ai_layout_updated_at: string | null
          back_background_image_url: string | null
          background_color: string | null
          background_image_url: string | null
          created_at: string
          description: string | null
          has_back_side: boolean
          height_mm: number
          id: string
          is_default: boolean
          name: string
          updated_at: string
          user_id: string
          width_mm: number
        }
        Insert: {
          ai_layout_bg_url?: string | null
          ai_layout_suggestion?: Json | null
          ai_layout_updated_at?: string | null
          back_background_image_url?: string | null
          background_color?: string | null
          background_image_url?: string | null
          created_at?: string
          description?: string | null
          has_back_side?: boolean
          height_mm?: number
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
          user_id: string
          width_mm?: number
        }
        Update: {
          ai_layout_bg_url?: string | null
          ai_layout_suggestion?: Json | null
          ai_layout_updated_at?: string | null
          back_background_image_url?: string | null
          background_color?: string | null
          background_image_url?: string | null
          created_at?: string
          description?: string | null
          has_back_side?: boolean
          height_mm?: number
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          user_id?: string
          width_mm?: number
        }
        Relationships: []
      }
      cracha_template_elements: {
        Row: {
          background_color: string | null
          border_color: string | null
          border_radius: number | null
          border_width: number | null
          created_at: string
          element_type: string
          field_binding: string | null
          font_color: string | null
          font_family: string | null
          font_size: number | null
          font_weight: string | null
          height: number | null
          id: string
          name_display_mode: string
          object_fit: string | null
          show_label: boolean
          side: string
          static_value: string | null
          template_id: string
          text_align: string | null
          width: number | null
          x_position: number
          y_position: number
          z_index: number
        }
        Insert: {
          background_color?: string | null
          border_color?: string | null
          border_radius?: number | null
          border_width?: number | null
          created_at?: string
          element_type: string
          field_binding?: string | null
          font_color?: string | null
          font_family?: string | null
          font_size?: number | null
          font_weight?: string | null
          height?: number | null
          id?: string
          name_display_mode?: string
          object_fit?: string | null
          show_label?: boolean
          side?: string
          static_value?: string | null
          template_id: string
          text_align?: string | null
          width?: number | null
          x_position?: number
          y_position?: number
          z_index?: number
        }
        Update: {
          background_color?: string | null
          border_color?: string | null
          border_radius?: number | null
          border_width?: number | null
          created_at?: string
          element_type?: string
          field_binding?: string | null
          font_color?: string | null
          font_family?: string | null
          font_size?: number | null
          font_weight?: string | null
          height?: number | null
          id?: string
          name_display_mode?: string
          object_fit?: string | null
          show_label?: boolean
          side?: string
          static_value?: string | null
          template_id?: string
          text_align?: string | null
          width?: number | null
          x_position?: number
          y_position?: number
          z_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "cracha_template_elements_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "cracha_badge_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      cracha_employees: {
        Row: {
          senior_id: string | null
          request_motivo: string | null
          request_photo_url: string | null
          requested_at: string | null
          requester_senior_id: string | null
          requester_matricula: string | null
          requester_cargo: string | null
          desligado_em: string | null
          access_level: string | null
          address: string | null
          blood_type: string | null
          cnv: string | null
          company: string | null
          connection_id: string | null
          cpf: string | null
          created_at: string
          document_id: string | null
          employee_id: string
          full_name: string
          id: string
          is_valid: boolean
          notes: string | null
          phone: string | null
          photo_url: string | null
          qr_value: string | null
          rejection_reason: string | null
          request_reason: string | null
          request_status: string | null
          requester_name: string | null
          requester_phone: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          rg: string | null
          role: string | null
          row_number: number | null
          updated_at: string
          valid_until: string | null
          validation_errors: Json | null
        }
        Insert: {
          senior_id?: string | null
          request_motivo?: string | null
          request_photo_url?: string | null
          requested_at?: string | null
          requester_senior_id?: string | null
          requester_matricula?: string | null
          requester_cargo?: string | null
          desligado_em?: string | null
          access_level?: string | null
          address?: string | null
          blood_type?: string | null
          cnv?: string | null
          company?: string | null
          connection_id?: string | null
          cpf?: string | null
          created_at?: string
          document_id?: string | null
          employee_id: string
          full_name: string
          id?: string
          is_valid?: boolean
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          qr_value?: string | null
          rejection_reason?: string | null
          request_reason?: string | null
          request_status?: string | null
          requester_name?: string | null
          requester_phone?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rg?: string | null
          role?: string | null
          row_number?: number | null
          updated_at?: string
          valid_until?: string | null
          validation_errors?: Json | null
        }
        Update: {
          senior_id?: string | null
          request_motivo?: string | null
          request_photo_url?: string | null
          requested_at?: string | null
          requester_senior_id?: string | null
          requester_matricula?: string | null
          requester_cargo?: string | null
          desligado_em?: string | null
          access_level?: string | null
          address?: string | null
          blood_type?: string | null
          cnv?: string | null
          company?: string | null
          connection_id?: string | null
          cpf?: string | null
          created_at?: string
          document_id?: string | null
          employee_id?: string
          full_name?: string
          id?: string
          is_valid?: boolean
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          qr_value?: string | null
          rejection_reason?: string | null
          request_reason?: string | null
          request_status?: string | null
          requester_name?: string | null
          requester_phone?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rg?: string | null
          role?: string | null
          row_number?: number | null
          updated_at?: string
          valid_until?: string | null
          validation_errors?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "cracha_employees_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "cracha_sheet_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      cracha_generation_batches: {
        Row: {
          completed_at: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          confirmed_by_name: string | null
          connection_id: string | null
          created_at: string
          error_log: Json | null
          export_format: string
          failed_badges: number
          file_url: string | null
          id: string
          layout_config: Json | null
          processed_badges: number
          started_at: string | null
          status: Database["public"]["Enums"]["cracha_batch_status"]
          template_id: string | null
          total_badges: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_by_name?: string | null
          connection_id?: string | null
          created_at?: string
          error_log?: Json | null
          export_format?: string
          failed_badges?: number
          file_url?: string | null
          id?: string
          layout_config?: Json | null
          processed_badges?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["cracha_batch_status"]
          template_id?: string | null
          total_badges?: number
          user_id: string
        }
        Update: {
          completed_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_by_name?: string | null
          connection_id?: string | null
          created_at?: string
          error_log?: Json | null
          export_format?: string
          failed_badges?: number
          file_url?: string | null
          id?: string
          layout_config?: Json | null
          processed_badges?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["cracha_batch_status"]
          template_id?: string | null
          total_badges?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cracha_generation_batches_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "cracha_sheet_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cracha_generation_batches_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "cracha_badge_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      cracha_batch_items: {
        Row: {
          batch_id: string
          created_at: string
          employee_id: string
          error_message: string | null
          file_url: string | null
          id: string
          status: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          employee_id: string
          error_message?: string | null
          file_url?: string | null
          id?: string
          status?: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          employee_id?: string
          error_message?: string | null
          file_url?: string | null
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cracha_batch_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "cracha_generation_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cracha_batch_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "cracha_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      cracha_sheet_connections: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          last_synced_at: string | null
          range_spec: string | null
          sheet_id: string
          sheet_name: string
          sheet_url: string | null
          tab_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          range_spec?: string | null
          sheet_id: string
          sheet_name: string
          sheet_url?: string | null
          tab_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          range_spec?: string | null
          sheet_id?: string
          sheet_name?: string
          sheet_url?: string | null
          tab_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cracha_column_mappings: {
        Row: {
          connection_id: string
          created_at: string
          field_name: string
          id: string
          is_required: boolean
          sheet_column: string
        }
        Insert: {
          connection_id: string
          created_at?: string
          field_name: string
          id?: string
          is_required?: boolean
          sheet_column: string
        }
        Update: {
          connection_id?: string
          created_at?: string
          field_name?: string
          id?: string
          is_required?: boolean
          sheet_column?: string
        }
        Relationships: [
          {
            foreignKeyName: "cracha_column_mappings_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "cracha_sheet_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      cracha_sync_logs: {
        Row: {
          completed_at: string | null
          connection_id: string | null
          created_at: string
          error_message: string | null
          id: string
          new_records: number
          skipped_records: number
          started_at: string
          status: string
          total_records: number
          updated_records: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          connection_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          new_records?: number
          skipped_records?: number
          started_at?: string
          status?: string
          total_records?: number
          updated_records?: number
          user_id: string
        }
        Update: {
          completed_at?: string | null
          connection_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          new_records?: number
          skipped_records?: number
          started_at?: string
          status?: string
          total_records?: number
          updated_records?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cracha_sync_logs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "cracha_sheet_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      cracha_user_connections: {
        Row: {
          connection_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          connection_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          connection_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cracha_user_connections_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "cracha_sheet_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      assinatura_tokens: {
        Row: {
          created_at: string
          expira_em: string
          ficha_id: string
          id: string
          tipo_ficha: Database["public"]["Enums"]["tipo_item"]
          token: string
          usado: boolean
          usado_em: string | null
        }
        Insert: {
          created_at?: string
          expira_em?: string
          ficha_id: string
          id?: string
          tipo_ficha: Database["public"]["Enums"]["tipo_item"]
          token?: string
          usado?: boolean
          usado_em?: string | null
        }
        Update: {
          created_at?: string
          expira_em?: string
          ficha_id?: string
          id?: string
          tipo_ficha?: Database["public"]["Enums"]["tipo_item"]
          token?: string
          usado?: boolean
          usado_em?: string | null
        }
        Relationships: []
      }
      colaboradores_senior: {
        Row: {
          ativo: boolean
          cargo: string | null
          centro_custo: string | null
          cod_cargo: string | null
          cod_centro_custo: string | null
          cod_fil: number | null
          cod_local: string | null
          cpf: string | null
          rg: string | null
          created_at: string
          data_admissao: string | null
          data_afastamento: string | null
          email: string | null
          empresa_nome: string | null
          id: string
          nome: string
          nome_local: string | null
          num_cad: number
          num_emp: number
          razao_social: string | null
          sincronizado_em: string
          situacao: number | null
          situacao_descricao: string | null
          telefone: string | null
          tip_col: number
          uf: string | null
          updated_at: string
          escala_codigo: number | null
          escala_nome: string | null
          posto_codigo: string | null
          posto_descricao: string | null
          posto_estrutura: number | null
        }
        Insert: {
          ativo?: boolean
          cargo?: string | null
          centro_custo?: string | null
          cod_cargo?: string | null
          cod_centro_custo?: string | null
          cod_fil?: number | null
          cod_local?: string | null
          cpf?: string | null
          rg?: string | null
          created_at?: string
          data_admissao?: string | null
          data_afastamento?: string | null
          email?: string | null
          empresa_nome?: string | null
          id?: string
          nome: string
          nome_local?: string | null
          num_cad: number
          num_emp: number
          razao_social?: string | null
          sincronizado_em?: string
          situacao?: number | null
          situacao_descricao?: string | null
          telefone?: string | null
          tip_col: number
          uf?: string | null
          updated_at?: string
          escala_codigo?: number | null
          escala_nome?: string | null
          posto_codigo?: string | null
          posto_descricao?: string | null
          posto_estrutura?: number | null
        }
        Update: {
          ativo?: boolean
          cargo?: string | null
          centro_custo?: string | null
          cod_cargo?: string | null
          cod_centro_custo?: string | null
          cod_fil?: number | null
          cod_local?: string | null
          cpf?: string | null
          rg?: string | null
          created_at?: string
          data_admissao?: string | null
          data_afastamento?: string | null
          email?: string | null
          empresa_nome?: string | null
          id?: string
          nome?: string
          nome_local?: string | null
          num_cad?: number
          num_emp?: number
          razao_social?: string | null
          sincronizado_em?: string
          situacao?: number | null
          situacao_descricao?: string | null
          telefone?: string | null
          tip_col?: number
          uf?: string | null
          updated_at?: string
          escala_codigo?: number | null
          escala_nome?: string | null
          posto_codigo?: string | null
          posto_descricao?: string | null
          posto_estrutura?: number | null
        }
        Relationships: []
      }
      fichas_selfies: {
        Row: {
          colhida_por: string | null
          created_at: string
          ficha_id: string
          id: string
          selfie: string
          tirada_em: string
        }
        Insert: {
          colhida_por?: string | null
          created_at?: string
          ficha_id: string
          id?: string
          selfie: string
          tirada_em?: string
        }
        Update: {
          colhida_por?: string | null
          created_at?: string
          ficha_id?: string
          id?: string
          selfie?: string
          tirada_em?: string
        }
        Relationships: []
      }
      termo_coletivo_tokens: {
        Row: {
          created_at: string
          expira_em: string
          id: string
          item_id: string
          token: string
          usado: boolean
          usado_em: string | null
        }
        Insert: {
          created_at?: string
          expira_em?: string
          id?: string
          item_id: string
          token?: string
          usado?: boolean
          usado_em?: string | null
        }
        Update: {
          created_at?: string
          expira_em?: string
          id?: string
          item_id?: string
          token?: string
          usado?: boolean
          usado_em?: string | null
        }
        Relationships: []
      }
      assinaturas: {
        Row: {
          assinante: string | null
          assinatura_url: string | null
          created_at: string
          data_hora: string
          ficha_epi_id: string | null
          id: string
          ip_assinatura: string | null
          item_id: string | null
          termo_id: string | null
          tipo: string
        }
        Insert: {
          assinante?: string | null
          assinatura_url?: string | null
          created_at?: string
          data_hora?: string
          ficha_epi_id?: string | null
          id?: string
          ip_assinatura?: string | null
          item_id?: string | null
          termo_id?: string | null
          tipo: string
        }
        Update: {
          assinante?: string | null
          assinatura_url?: string | null
          created_at?: string
          data_hora?: string
          ficha_epi_id?: string | null
          id?: string
          ip_assinatura?: string | null
          item_id?: string | null
          termo_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "assinaturas_ficha_epi_id_fkey"
            columns: ["ficha_epi_id"]
            isOneToOne: false
            referencedRelation: "fichas_epi"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_termo_id_fkey"
            columns: ["termo_id"]
            isOneToOne: false
            referencedRelation: "termos_entrega_epi"
            referencedColumns: ["id"]
          },
        ]
      }
      colaboradores_integracao: {
        Row: {
          created_at: string
          criado_por: string | null
          data_admissao: string | null
          funcao_id: string | null
          funcao_nome: string | null
          id: string
          matricula: string | null
          nome: string
          observacoes: string | null
          posto: string | null
          profile_id: string | null
          status: string
          updated_at: string
          cpf: string | null
          telefone: string | null
          uf: string | null
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          data_admissao?: string | null
          funcao_id?: string | null
          funcao_nome?: string | null
          id?: string
          matricula?: string | null
          nome: string
          observacoes?: string | null
          posto?: string | null
          profile_id?: string | null
          status?: string
          updated_at?: string
          cpf?: string | null
          telefone?: string | null
          uf?: string | null
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          data_admissao?: string | null
          funcao_id?: string | null
          funcao_nome?: string | null
          id?: string
          matricula?: string | null
          nome?: string
          observacoes?: string | null
          posto?: string | null
          profile_id?: string | null
          status?: string
          updated_at?: string
          cpf?: string | null
          telefone?: string | null
          uf?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "colaboradores_integracao_funcao_id_fkey"
            columns: ["funcao_id"]
            isOneToOne: false
            referencedRelation: "funcoes"
            referencedColumns: ["id"]
          },
        ]
      }
      estados: {
        Row: { nome: string; uf: string }
        Insert: { nome: string; uf: string }
        Update: { nome?: string; uf?: string }
        Relationships: []
      }
      user_estados: {
        Row: { uf: string; user_id: string }
        Insert: { uf: string; user_id: string }
        Update: { uf?: string; user_id?: string }
        Relationships: []
      }
      email_convocacao_config: {
        Row: {
          automatico: boolean
          destinatarios: string[]
          dia_semana: number
          id: number
          ufs: string[]
          ultimo_envio_automatico: string | null
          updated_at: string
          copia: string[]
        }
        Insert: {
          automatico?: boolean
          destinatarios?: string[]
          dia_semana?: number
          id?: number
          ufs?: string[]
          ultimo_envio_automatico?: string | null
          updated_at?: string
          copia?: string[]
        }
        Update: {
          automatico?: boolean
          destinatarios?: string[]
          dia_semana?: number
          id?: number
          ufs?: string[]
          ultimo_envio_automatico?: string | null
          updated_at?: string
          copia?: string[]
        }
        Relationships: []
      }
      email_estoque_config: {
        Row: {
          automatico: boolean
          destinatarios: string[]
          dia_semana: number
          id: number
          ufs: string[]
          ultimo_envio_automatico: string | null
          updated_at: string
          copia: string[]
          alerta_reposicao: boolean
        }
        Insert: {
          automatico?: boolean
          destinatarios?: string[]
          dia_semana?: number
          id?: number
          ufs?: string[]
          ultimo_envio_automatico?: string | null
          updated_at?: string
          copia?: string[]
          alerta_reposicao?: boolean
        }
        Update: {
          automatico?: boolean
          destinatarios?: string[]
          dia_semana?: number
          id?: number
          ufs?: string[]
          ultimo_envio_automatico?: string | null
          updated_at?: string
          copia?: string[]
          alerta_reposicao?: boolean
        }
        Relationships: []
      }
      estoque_minimos: {
        Row: { epi_id: string; uf: string; minimo: number; updated_at: string }
        Insert: { epi_id: string; uf: string; minimo: number; updated_at?: string }
        Update: { epi_id?: string; uf?: string; minimo?: number; updated_at?: string }
        Relationships: []
      }
      alertas_estoque: {
        Row: { id: string; epi_id: string; uf: string; saldo: number; minimo: number; criado_em: string; enviado_em: string | null }
        Insert: { id?: string; epi_id: string; uf: string; saldo: number; minimo: number; criado_em?: string; enviado_em?: string | null }
        Update: { id?: string; epi_id?: string; uf?: string; saldo?: number; minimo?: number; criado_em?: string; enviado_em?: string | null }
        Relationships: []
      }
      entradas_estoque: {
        Row: {
          chave_acesso: string | null
          created_at: string
          criado_por: string | null
          data_emissao: string | null
          data_entrada: string
          fornecedor_cnpj: string | null
          fornecedor_id: string | null
          fornecedor_nome: string | null
          id: string
          numero_nf: string | null
          observacao: string | null
          origem: string
          serie: string | null
          uf: string
          motivo: string | null
        }
        Insert: {
          chave_acesso?: string | null
          created_at?: string
          criado_por?: string | null
          data_emissao?: string | null
          data_entrada?: string
          fornecedor_cnpj?: string | null
          fornecedor_id?: string | null
          fornecedor_nome?: string | null
          id?: string
          numero_nf?: string | null
          observacao?: string | null
          origem?: string
          serie?: string | null
          uf: string
          motivo?: string | null
        }
        Update: {
          chave_acesso?: string | null
          created_at?: string
          criado_por?: string | null
          data_emissao?: string | null
          data_entrada?: string
          fornecedor_cnpj?: string | null
          fornecedor_id?: string | null
          fornecedor_nome?: string | null
          id?: string
          numero_nf?: string | null
          observacao?: string | null
          origem?: string
          serie?: string | null
          uf?: string
          motivo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entradas_estoque_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      entradas_estoque_itens: {
        Row: {
          codigo_fornecedor: string | null
          created_at: string
          descricao_nf: string | null
          entrada_id: string
          epi_id: string
          id: string
          quantidade: number
          tamanho: string | null
          valor_unitario: number | null
        }
        Insert: {
          codigo_fornecedor?: string | null
          created_at?: string
          descricao_nf?: string | null
          entrada_id: string
          epi_id: string
          id?: string
          quantidade: number
          tamanho?: string | null
          valor_unitario?: number | null
        }
        Update: {
          codigo_fornecedor?: string | null
          created_at?: string
          descricao_nf?: string | null
          entrada_id?: string
          epi_id?: string
          id?: string
          quantidade?: number
          tamanho?: string | null
          valor_unitario?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "entradas_estoque_itens_entrada_id_fkey"
            columns: ["entrada_id"]
            isOneToOne: false
            referencedRelation: "entradas_estoque"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_estoque_itens_epi_id_fkey"
            columns: ["epi_id"]
            isOneToOne: false
            referencedRelation: "epis"
            referencedColumns: ["id"]
          },
        ]
      }
      epi_codigos_fornecedor: {
        Row: {
          codigo_fornecedor: string
          epi_id: string
          fornecedor_cnpj: string
          id: string
          tamanho: string | null
          updated_at: string
        }
        Insert: {
          codigo_fornecedor: string
          epi_id: string
          fornecedor_cnpj: string
          id?: string
          tamanho?: string | null
          updated_at?: string
        }
        Update: {
          codigo_fornecedor?: string
          epi_id?: string
          fornecedor_cnpj?: string
          id?: string
          tamanho?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "epi_codigos_fornecedor_epi_id_fkey"
            columns: ["epi_id"]
            isOneToOne: false
            referencedRelation: "epis"
            referencedColumns: ["id"]
          },
        ]
      }
      epi_tamanhos: {
        Row: {
          created_at: string
          epi_id: string
          estoque: number
          estoque_minimo: number
          id: string
          tamanho: string
          updated_at: string
          uf: string
        }
        Insert: {
          created_at?: string
          epi_id: string
          estoque?: number
          estoque_minimo?: number
          id?: string
          tamanho: string
          updated_at?: string
          uf: string
        }
        Update: {
          created_at?: string
          epi_id?: string
          estoque?: number
          estoque_minimo?: number
          id?: string
          tamanho?: string
          updated_at?: string
          uf?: string
        }
        Relationships: [
          {
            foreignKeyName: "epi_tamanhos_epi_id_fkey"
            columns: ["epi_id"]
            isOneToOne: false
            referencedRelation: "epis"
            referencedColumns: ["id"]
          },
        ]
      }
      epis: {
        Row: {
          ativo: boolean
          ca_numero: string | null
          ca_validade: string | null
          categoria: Database["public"]["Enums"]["epi_categoria"]
          codigo: string | null
          created_at: string
          descricao: string | null
          estoque_atual: number
          estoque_minimo: number
          fabricante: string | null
          fornecedor: string | null
          id: string
          nome: string
          tipo: Database["public"]["Enums"]["item_tipo"]
          updated_at: string
          vida_util_dias: number | null
        }
        Insert: {
          ativo?: boolean
          ca_numero?: string | null
          ca_validade?: string | null
          categoria: Database["public"]["Enums"]["epi_categoria"]
          codigo?: string | null
          created_at?: string
          descricao?: string | null
          estoque_atual?: number
          estoque_minimo?: number
          fabricante?: string | null
          fornecedor?: string | null
          id?: string
          nome: string
          tipo?: Database["public"]["Enums"]["item_tipo"]
          updated_at?: string
          vida_util_dias?: number | null
        }
        Update: {
          ativo?: boolean
          ca_numero?: string | null
          ca_validade?: string | null
          categoria?: Database["public"]["Enums"]["epi_categoria"]
          codigo?: string | null
          created_at?: string
          descricao?: string | null
          estoque_atual?: number
          estoque_minimo?: number
          fabricante?: string | null
          fornecedor?: string | null
          id?: string
          nome?: string
          tipo?: Database["public"]["Enums"]["item_tipo"]
          updated_at?: string
          vida_util_dias?: number | null
        }
        Relationships: []
      }
      fichas_epi: {
        Row: {
          assinatura_colaborador_url: string | null
          assinatura_supervisor_url: string | null
          colaborador_id: string | null
          cpf_snapshot: string | null
          created_at: string
          criado_por: string | null
          data_assinatura_colaborador: string | null
          data_assinatura_supervisor: string | null
          data_devolucao: string | null
          data_entrega: string
          empresa: string | null
          funcao: string | null
          funcao_id: string | null
          id: string
          ip_assinatura: string | null
          matricula_snapshot: string | null
          modelo_id: string | null
          motivo: string | null
          nome_funcionario: string | null
          numero: number
          observacoes: string | null
          posto_snapshot: string | null
          status: Database["public"]["Enums"]["ficha_status"]
          telefone: string | null
          turno: string | null
          updated_at: string
          uf: string
          centro_custo: string | null
          centro_custo_codigo: string | null
          local_senior: string | null
          escala: string | null
          posto_trabalho: string | null
          posto_trabalho_codigo: string | null
        }
        Insert: {
          assinatura_colaborador_url?: string | null
          assinatura_supervisor_url?: string | null
          colaborador_id?: string | null
          cpf_snapshot?: string | null
          created_at?: string
          criado_por?: string | null
          data_assinatura_colaborador?: string | null
          data_assinatura_supervisor?: string | null
          data_devolucao?: string | null
          data_entrega?: string
          empresa?: string | null
          funcao?: string | null
          funcao_id?: string | null
          id?: string
          ip_assinatura?: string | null
          matricula_snapshot?: string | null
          modelo_id?: string | null
          motivo?: string | null
          nome_funcionario?: string | null
          numero?: number
          observacoes?: string | null
          posto_snapshot?: string | null
          status?: Database["public"]["Enums"]["ficha_status"]
          telefone?: string | null
          turno?: string | null
          updated_at?: string
          uf: string
          centro_custo?: string | null
          centro_custo_codigo?: string | null
          local_senior?: string | null
          escala?: string | null
          posto_trabalho?: string | null
          posto_trabalho_codigo?: string | null
        }
        Update: {
          assinatura_colaborador_url?: string | null
          assinatura_supervisor_url?: string | null
          colaborador_id?: string | null
          cpf_snapshot?: string | null
          created_at?: string
          criado_por?: string | null
          data_assinatura_colaborador?: string | null
          data_assinatura_supervisor?: string | null
          data_devolucao?: string | null
          data_entrega?: string
          empresa?: string | null
          funcao?: string | null
          funcao_id?: string | null
          id?: string
          ip_assinatura?: string | null
          matricula_snapshot?: string | null
          modelo_id?: string | null
          motivo?: string | null
          nome_funcionario?: string | null
          numero?: number
          observacoes?: string | null
          posto_snapshot?: string | null
          status?: Database["public"]["Enums"]["ficha_status"]
          telefone?: string | null
          turno?: string | null
          updated_at?: string
          uf?: string
          centro_custo?: string | null
          centro_custo_codigo?: string | null
          local_senior?: string | null
          escala?: string | null
          posto_trabalho?: string | null
          posto_trabalho_codigo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fichas_epi_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fichas_epi_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fichas_epi_funcao_id_fkey"
            columns: ["funcao_id"]
            isOneToOne: false
            referencedRelation: "funcoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fichas_epi_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "modelos_ficha"
            referencedColumns: ["id"]
          },
        ]
      }
      fichas_assinaturas_anteriores: {
        Row: {
          assinatura_colaborador_url: string | null
          assinatura_supervisor_url: string | null
          dados: Json
          data_assinatura_colaborador: string | null
          ficha_id: string
          id: string
          ip_assinatura: string | null
          itens: Json
          motivo: string
          reaberta_em: string
          reaberta_por: string | null
          reaberta_por_nome: string | null
        }
        Insert: {
          assinatura_colaborador_url?: string | null
          assinatura_supervisor_url?: string | null
          dados: Json
          data_assinatura_colaborador?: string | null
          ficha_id: string
          id?: string
          ip_assinatura?: string | null
          itens: Json
          motivo: string
          reaberta_em?: string
          reaberta_por?: string | null
          reaberta_por_nome?: string | null
        }
        Update: {
          assinatura_colaborador_url?: string | null
          assinatura_supervisor_url?: string | null
          dados?: Json
          data_assinatura_colaborador?: string | null
          ficha_id?: string
          id?: string
          ip_assinatura?: string | null
          itens?: Json
          motivo?: string
          reaberta_em?: string
          reaberta_por?: string | null
          reaberta_por_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fichas_assinaturas_anteriores_ficha_id_fkey"
            columns: ["ficha_id"]
            isOneToOne: false
            referencedRelation: "fichas_epi"
            referencedColumns: ["id"]
          },
        ]
      }
      fichas_epi_itens: {
        Row: {
          ca: string | null
          created_at: string
          data_validade: string | null
          descricao: string | null
          epi_id: string | null
          estado: Database["public"]["Enums"]["estado_item"]
          ficha_id: string
          id: string
          motivo_entrega: Database["public"]["Enums"]["motivo_entrega"]
          observacao_item: string | null
          posto_servico: string | null
          quantidade: number
          recebido: boolean
          tamanho: string | null
        }
        Insert: {
          ca?: string | null
          created_at?: string
          data_validade?: string | null
          descricao?: string | null
          epi_id?: string | null
          estado?: Database["public"]["Enums"]["estado_item"]
          ficha_id: string
          id?: string
          motivo_entrega?: Database["public"]["Enums"]["motivo_entrega"]
          observacao_item?: string | null
          posto_servico?: string | null
          quantidade?: number
          recebido?: boolean
          tamanho?: string | null
        }
        Update: {
          ca?: string | null
          created_at?: string
          data_validade?: string | null
          descricao?: string | null
          epi_id?: string | null
          estado?: Database["public"]["Enums"]["estado_item"]
          ficha_id?: string
          id?: string
          motivo_entrega?: Database["public"]["Enums"]["motivo_entrega"]
          observacao_item?: string | null
          posto_servico?: string | null
          quantidade?: number
          recebido?: boolean
          tamanho?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fichas_epi_itens_epi_id_fkey"
            columns: ["epi_id"]
            isOneToOne: false
            referencedRelation: "epis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fichas_epi_itens_ficha_id_fkey"
            columns: ["ficha_id"]
            isOneToOne: false
            referencedRelation: "fichas_epi"
            referencedColumns: ["id"]
          },
        ]
      }
      modelos_ficha: {
        Row: {
          ativo: boolean
          coluna_extra: string
          created_at: string
          id: string
          layout_cabecalho: string
          logo_data_url: string | null
          mostrar_segundo_logo: boolean
          nome: string
          padrao: boolean
          texto_declaracao: string
          texto_secao_extra: string | null
          texto_termo_responsabilidade: string
          titulo_documento: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          coluna_extra?: string
          created_at?: string
          id?: string
          layout_cabecalho?: string
          logo_data_url?: string | null
          mostrar_segundo_logo?: boolean
          nome: string
          padrao?: boolean
          texto_declaracao: string
          texto_secao_extra?: string | null
          texto_termo_responsabilidade: string
          titulo_documento: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          coluna_extra?: string
          created_at?: string
          id?: string
          layout_cabecalho?: string
          logo_data_url?: string | null
          mostrar_segundo_logo?: boolean
          nome?: string
          padrao?: boolean
          texto_declaracao?: string
          texto_secao_extra?: string | null
          texto_termo_responsabilidade?: string
          titulo_documento?: string
          updated_at?: string
        }
        Relationships: []
      }
      fichas_uniforme: {
        Row: {
          assinatura_colaborador_url: string | null
          assinatura_supervisor_url: string | null
          colaborador_id: string
          created_at: string
          criado_por: string | null
          data_assinatura_colaborador: string | null
          data_assinatura_supervisor: string | null
          data_devolucao: string | null
          data_entrega: string
          id: string
          ip_assinatura: string | null
          numero: number
          observacoes: string | null
          status: Database["public"]["Enums"]["ficha_status"]
          updated_at: string
        }
        Insert: {
          assinatura_colaborador_url?: string | null
          assinatura_supervisor_url?: string | null
          colaborador_id: string
          created_at?: string
          criado_por?: string | null
          data_assinatura_colaborador?: string | null
          data_assinatura_supervisor?: string | null
          data_devolucao?: string | null
          data_entrega?: string
          id?: string
          ip_assinatura?: string | null
          numero?: number
          observacoes?: string | null
          status?: Database["public"]["Enums"]["ficha_status"]
          updated_at?: string
        }
        Update: {
          assinatura_colaborador_url?: string | null
          assinatura_supervisor_url?: string | null
          colaborador_id?: string
          created_at?: string
          criado_por?: string | null
          data_assinatura_colaborador?: string | null
          data_assinatura_supervisor?: string | null
          data_devolucao?: string | null
          data_entrega?: string
          id?: string
          ip_assinatura?: string | null
          numero?: number
          observacoes?: string | null
          status?: Database["public"]["Enums"]["ficha_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fichas_uniforme_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fichas_uniforme_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fichas_uniforme_itens: {
        Row: {
          cor: string | null
          created_at: string
          descricao: string | null
          estado: Database["public"]["Enums"]["estado_item"]
          ficha_id: string
          id: string
          motivo_entrega: Database["public"]["Enums"]["motivo_entrega"]
          observacao_item: string | null
          quantidade: number
          tamanho: string | null
          uniforme_id: string | null
        }
        Insert: {
          cor?: string | null
          created_at?: string
          descricao?: string | null
          estado?: Database["public"]["Enums"]["estado_item"]
          ficha_id: string
          id?: string
          motivo_entrega?: Database["public"]["Enums"]["motivo_entrega"]
          observacao_item?: string | null
          quantidade?: number
          tamanho?: string | null
          uniforme_id?: string | null
        }
        Update: {
          cor?: string | null
          created_at?: string
          descricao?: string | null
          estado?: Database["public"]["Enums"]["estado_item"]
          ficha_id?: string
          id?: string
          motivo_entrega?: Database["public"]["Enums"]["motivo_entrega"]
          observacao_item?: string | null
          quantidade?: number
          tamanho?: string | null
          uniforme_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fichas_uniforme_itens_ficha_id_fkey"
            columns: ["ficha_id"]
            isOneToOne: false
            referencedRelation: "fichas_uniforme"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fichas_uniforme_itens_uniforme_id_fkey"
            columns: ["uniforme_id"]
            isOneToOne: false
            referencedRelation: "uniformes"
            referencedColumns: ["id"]
          },
        ]
      }
      fornecedores: {
        Row: {
          ativo: boolean
          cnpj: string | null
          created_at: string
          id: string
          nicho: string | null
          nome: string
          observacao: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cnpj?: string | null
          created_at?: string
          id?: string
          nicho?: string | null
          nome: string
          observacao?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cnpj?: string | null
          created_at?: string
          id?: string
          nicho?: string | null
          nome?: string
          observacao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      funcao_epis: {
        Row: {
          created_at: string
          epi_id: string
          funcao_id: string
          id: string
          quantidade: number
          tamanho: string | null
        }
        Insert: {
          created_at?: string
          epi_id: string
          funcao_id: string
          id?: string
          quantidade?: number
          tamanho?: string | null
        }
        Update: {
          created_at?: string
          epi_id?: string
          funcao_id?: string
          id?: string
          quantidade?: number
          tamanho?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funcao_epis_epi_id_fkey"
            columns: ["epi_id"]
            isOneToOne: false
            referencedRelation: "epis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funcao_epis_funcao_id_fkey"
            columns: ["funcao_id"]
            isOneToOne: false
            referencedRelation: "funcoes"
            referencedColumns: ["id"]
          },
        ]
      }
      funcoes: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          nome: string
          updated_at: string
          uf: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          updated_at?: string
          uf?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          updated_at?: string
          uf?: string
        }
        Relationships: []
      }
      movimentacoes_estoque: {
        Row: {
          created_at: string
          data_mov: string
          id: string
          item_id: string
          motivo: string | null
          observacao: string | null
          quantidade: number
          responsavel_id: string | null
          tipo_item: Database["public"]["Enums"]["tipo_item"]
          tipo_mov: Database["public"]["Enums"]["tipo_mov"]
          uf: string
        }
        Insert: {
          created_at?: string
          data_mov?: string
          id?: string
          item_id: string
          motivo?: string | null
          observacao?: string | null
          quantidade: number
          responsavel_id?: string | null
          tipo_item: Database["public"]["Enums"]["tipo_item"]
          tipo_mov: Database["public"]["Enums"]["tipo_mov"]
          uf: string
        }
        Update: {
          created_at?: string
          data_mov?: string
          id?: string
          item_id?: string
          motivo?: string | null
          observacao?: string | null
          quantidade?: number
          responsavel_id?: string | null
          tipo_item?: Database["public"]["Enums"]["tipo_item"]
          tipo_mov?: Database["public"]["Enums"]["tipo_mov"]
          uf?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimentacoes_estoque_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes: {
        Row: {
          created_at: string
          id: string
          lida: boolean
          link_acao: string | null
          mensagem: string | null
          tipo: string
          titulo: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lida?: boolean
          link_acao?: string | null
          mensagem?: string | null
          tipo: string
          titulo: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lida?: boolean
          link_acao?: string | null
          mensagem?: string | null
          tipo?: string
          titulo?: string
          usuario_id?: string
        }
        Relationships: []
      }
      postos: {
        Row: {
          apelidos: string[]
          ativo: boolean
          created_at: string
          endereco: string | null
          id: string
          latitude: number | null
          longitude: number | null
          nome: string
          nome_chave: string
          uf: string
          updated_at: string
          troca_uniforme_meses: number | null
          troca_uniforme_obrigatoria: boolean
        }
        Insert: {
          apelidos?: string[]
          ativo?: boolean
          created_at?: string
          endereco?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome: string
          uf?: string
          updated_at?: string
          troca_uniforme_meses?: number | null
          troca_uniforme_obrigatoria?: boolean
        }
        Update: {
          apelidos?: string[]
          ativo?: boolean
          created_at?: string
          endereco?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome?: string
          uf?: string
          updated_at?: string
          troca_uniforme_meses?: number | null
          troca_uniforme_obrigatoria?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          clerk_user_id: string | null
          ativo: boolean
          cargo: string | null
          cpf: string | null
          created_at: string
          data_admissao: string | null
          departamento: string | null
          email: string | null
          foto_url: string | null
          id: string
          inativado_em: string | null
          matricula: string | null
          motivo_inativacao: string | null
          must_change_password: boolean
          nome_completo: string
          posto: string | null
          supervisor_id: string | null
          updated_at: string
        }
        Insert: {
          clerk_user_id?: string | null
          ativo?: boolean
          cargo?: string | null
          cpf?: string | null
          created_at?: string
          data_admissao?: string | null
          departamento?: string | null
          email?: string | null
          foto_url?: string | null
          id: string
          inativado_em?: string | null
          matricula?: string | null
          motivo_inativacao?: string | null
          must_change_password?: boolean
          nome_completo?: string
          posto?: string | null
          supervisor_id?: string | null
          updated_at?: string
        }
        Update: {
          clerk_user_id?: string | null
          ativo?: boolean
          cargo?: string | null
          cpf?: string | null
          created_at?: string
          data_admissao?: string | null
          departamento?: string | null
          email?: string | null
          foto_url?: string | null
          id?: string
          inativado_em?: string | null
          matricula?: string | null
          motivo_inativacao?: string | null
          must_change_password?: boolean
          nome_completo?: string
          posto?: string | null
          supervisor_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      termos_entrega_epi: {
        Row: {
          created_at: string
          created_by: string | null
          empresa: string | null
          ficha_epi_id: string | null
          id: string
          lider: string | null
          mes: string
          observacoes: string | null
          posto: string
          status: Database["public"]["Enums"]["termo_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          empresa?: string | null
          ficha_epi_id?: string | null
          id?: string
          lider?: string | null
          mes: string
          observacoes?: string | null
          posto: string
          status?: Database["public"]["Enums"]["termo_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          empresa?: string | null
          ficha_epi_id?: string | null
          id?: string
          lider?: string | null
          mes?: string
          observacoes?: string | null
          posto?: string
          status?: Database["public"]["Enums"]["termo_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "termos_entrega_epi_ficha_epi_id_fkey"
            columns: ["ficha_epi_id"]
            isOneToOne: false
            referencedRelation: "fichas_epi"
            referencedColumns: ["id"]
          },
        ]
      }
      termos_entrega_epi_itens: {
        Row: {
          assinado_em: string | null
          assinatura_url: string | null
          ca: string | null
          colaborador_id: string | null
          colaborador_nome: string
          created_at: string
          epi_id: string | null
          id: string
          ip_assinatura: string | null
          material: string
          ordem: number
          quantidade: number
          termo_id: string
          token: string
          updated_at: string
        }
        Insert: {
          assinado_em?: string | null
          assinatura_url?: string | null
          ca?: string | null
          colaborador_id?: string | null
          colaborador_nome: string
          created_at?: string
          epi_id?: string | null
          id?: string
          ip_assinatura?: string | null
          material: string
          ordem?: number
          quantidade?: number
          termo_id: string
          token?: string
          updated_at?: string
        }
        Update: {
          assinado_em?: string | null
          assinatura_url?: string | null
          ca?: string | null
          colaborador_id?: string | null
          colaborador_nome?: string
          created_at?: string
          epi_id?: string | null
          id?: string
          ip_assinatura?: string | null
          material?: string
          ordem?: number
          quantidade?: number
          termo_id?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "termos_entrega_epi_itens_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termos_entrega_epi_itens_epi_id_fkey"
            columns: ["epi_id"]
            isOneToOne: false
            referencedRelation: "epis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termos_entrega_epi_itens_termo_id_fkey"
            columns: ["termo_id"]
            isOneToOne: false
            referencedRelation: "termos_entrega_epi"
            referencedColumns: ["id"]
          },
        ]
      }
      termos_epi_coletivos: {
        Row: {
          created_at: string
          criado_por: string | null
          empresa: string | null
          id: string
          lider: string | null
          mes_referencia: string
          observacoes: string | null
          posto: string
          status: Database["public"]["Enums"]["termo_coletivo_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          empresa?: string | null
          id?: string
          lider?: string | null
          mes_referencia: string
          observacoes?: string | null
          posto: string
          status?: Database["public"]["Enums"]["termo_coletivo_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          empresa?: string | null
          id?: string
          lider?: string | null
          mes_referencia?: string
          observacoes?: string | null
          posto?: string
          status?: Database["public"]["Enums"]["termo_coletivo_status"]
          updated_at?: string
        }
        Relationships: []
      }
      termos_epi_coletivos_itens: {
        Row: {
          assinatura_url: string | null
          ca: string | null
          colaborador_cpf: string | null
          colaborador_nome: string
          created_at: string
          data_assinatura: string | null
          epi_id: string | null
          id: string
          ip_assinatura: string | null
          material: string
          ordem: number
          quantidade: number
          tamanho: string | null
          termo_id: string
          updated_at: string
        }
        Insert: {
          assinatura_url?: string | null
          ca?: string | null
          colaborador_cpf?: string | null
          colaborador_nome: string
          created_at?: string
          data_assinatura?: string | null
          epi_id?: string | null
          id?: string
          ip_assinatura?: string | null
          material: string
          ordem?: number
          quantidade?: number
          tamanho?: string | null
          termo_id: string
          updated_at?: string
        }
        Update: {
          assinatura_url?: string | null
          ca?: string | null
          colaborador_cpf?: string | null
          colaborador_nome?: string
          created_at?: string
          data_assinatura?: string | null
          epi_id?: string | null
          id?: string
          ip_assinatura?: string | null
          material?: string
          ordem?: number
          quantidade?: number
          tamanho?: string | null
          termo_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "termos_epi_coletivos_itens_epi_id_fkey"
            columns: ["epi_id"]
            isOneToOne: false
            referencedRelation: "epis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termos_epi_coletivos_itens_termo_id_fkey"
            columns: ["termo_id"]
            isOneToOne: false
            referencedRelation: "termos_epi_coletivos"
            referencedColumns: ["id"]
          },
        ]
      }
      uniformes: {
        Row: {
          ativo: boolean
          categoria: string
          codigo: string | null
          created_at: string
          descricao: string | null
          estoque_atual: number
          estoque_minimo: number
          genero: Database["public"]["Enums"]["uniforme_genero"]
          id: string
          nome: string
          tamanhos_disponiveis: string[]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria: string
          codigo?: string | null
          created_at?: string
          descricao?: string | null
          estoque_atual?: number
          estoque_minimo?: number
          genero?: Database["public"]["Enums"]["uniforme_genero"]
          id?: string
          nome: string
          tamanhos_disponiveis?: string[]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string
          codigo?: string | null
          created_at?: string
          descricao?: string | null
          estoque_atual?: number
          estoque_minimo?: number
          genero?: Database["public"]["Enums"]["uniforme_genero"]
          id?: string
          nome?: string
          tamanhos_disponiveis?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          created_at: string
          id: string
          module: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          module: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          module?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      cracha_solicitacao_identificar: {
        Args: { _matricula: number | null; _cpf: string | null }
        Returns: Json
      }
      cracha_solicitacao_buscar: {
        Args: { _sol_matricula: number | null; _sol_cpf: string | null; _matricula?: number | null; _cpf?: string | null }
        Returns: Json
      }
      cracha_solicitacao_enviar: {
        Args: {
          _sol_matricula: number | null
          _sol_cpf: string | null
          _sol_telefone: string
          _matricula: number | null
          _cpf: string | null
          _motivo: string
          _observacao?: string
          _foto?: string
          _tipo_sanguineo?: string
          _cnv?: string
        }
        Returns: Json
      }
      assinar_ficha_publica: {
        Args: {
          _assinatura: string
          _ficha_id: string
          _ip?: string
          _itens_recebidos: string[]
        }
        Returns: Json
      }
      assinar_termo_coletivo_item: {
        Args: { _assinatura: string; _ip?: string; _item_id: string }
        Returns: Json
      }
      assinar_termo_item_publico: {
        Args: { _assinatura: string; _ip?: string; _token: string }
        Returns: Json
      }
      check_integracao_completa: {
        Args: { _colaborador: string }
        Returns: undefined
      }
      get_combo_publico: { Args: { _ficha_id: string }; Returns: Json }
      get_ficha_publica: { Args: { _ficha_id: string }; Returns: Json }
      get_ficha_publica_por_token: { Args: { _token: string }; Returns: Json }
      situacao_link_assinatura: { Args: { _token: string }; Returns: Json }
      reabrir_ficha_para_assinatura: { Args: { _ficha_id: string; _motivo: string }; Returns: string }
      copiar_funcoes_estado: { Args: { _de: string; _para: string }; Returns: number }
      marcar_alertas_estoque_enviados: { Args: { _ids: string[] }; Returns: number }
      assinar_ficha_publica_por_token: {
        Args: {
          _assinatura: string
          _ip?: string
          _selfie?: string
          _itens_recebidos: string[]
          _token: string
        }
        Returns: Json
      }
      get_termo_coletivo_publico: { Args: { _termo_id: string }; Returns: Json }
      get_termo_coletivo_item_por_token: { Args: { _token: string }; Returns: Json }
      assinar_termo_coletivo_item_por_token: {
        Args: { _assinatura: string; _ip?: string; _token: string }
        Returns: Json
      }
      get_termo_item_por_token: { Args: { _token: string }; Returns: Json }
      has_permission: {
        Args: { _action: string; _module: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_rh: { Args: { _user_id: string }; Returns: boolean }
      is_supervisor_of: {
        Args: { _colaborador: string; _supervisor: string }
        Returns: boolean
      }
      progresso_assinatura: { Args: { _ficha_id: string }; Returns: Json }
      ajustar_estoque: {
        Args: { _epi_id: string; _motivo?: string; _novo: number; _tamanho: string; _uf: string }
        Returns: undefined
      }
      pode_acessar_uf: { Args: { _uf: string }; Returns: boolean }
      pode_sincronizar_senior: { Args: Record<PropertyKey, never>; Returns: boolean }
      senior_gravar_descricoes: {
        Args: { _postos: Json; _escalas: Json }
        Returns: Json
      }
      senior_gravar_postos_escalas: {
        Args: { _empresa: number; _dados: Json }
        Returns: number
      }
      senior_inativar_ausentes: {
        Args: { _empresa: number; _desde: string }
        Returns: number
      }
      sincronizar_colaboradores_senior: {
        Args: { _empresas: number[]; _dados: Json; _inativar?: boolean }
        Returns: Json
      }
      resetar_estoque: { Args: { _epi_id: string; _uf: string }; Returns: undefined }
      transferir_estoque: {
        Args: {
          _epi_id: string; _observacao?: string; _quantidade: number
          _tamanho: string; _uf_destino: string; _uf_origem: string
        }
        Returns: undefined
      }
      registrar_entrada_estoque: { Args: { _cabecalho: Json; _itens: Json }; Returns: string }
    }
    Enums: {
      cracha_batch_status: "pending" | "processing" | "completed" | "failed"
      app_role: "admin" | "rh" | "supervisor" | "colaborador" | "almoxarife"
      epi_categoria:
        | "protecao_cabeca"
        | "auditiva"
        | "visual"
        | "respiratoria"
        | "maos"
        | "pes"
        | "corpo"
        | "queda"
      estado_item: "novo" | "usado_bom" | "usado_regular"
      ficha_status:
        | "pendente_assinatura"
        | "assinada"
        | "devolvida"
        | "cancelada"
      item_tipo: "epi" | "uniforme"
      motivo_entrega: "admissao" | "reposicao" | "troca" | "devolucao"
      termo_coletivo_status: "rascunho" | "em_assinatura" | "finalizado"
      termo_status: "rascunho" | "em_assinatura" | "concluido"
      tipo_item: "epi" | "uniforme"
      tipo_mov: "entrada" | "saida" | "devolucao" | "descarte"
      uniforme_genero: "masculino" | "feminino" | "unissex"
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
      cracha_batch_status: ["pending", "processing", "completed", "failed"],
      app_role: ["admin", "rh", "supervisor", "colaborador", "almoxarife"],
      epi_categoria: [
        "protecao_cabeca",
        "auditiva",
        "visual",
        "respiratoria",
        "maos",
        "pes",
        "corpo",
        "queda",
      ],
      estado_item: ["novo", "usado_bom", "usado_regular"],
      ficha_status: [
        "pendente_assinatura",
        "assinada",
        "devolvida",
        "cancelada",
      ],
      item_tipo: ["epi", "uniforme"],
      motivo_entrega: ["admissao", "reposicao", "troca", "devolucao"],
      termo_coletivo_status: ["rascunho", "em_assinatura", "finalizado"],
      termo_status: ["rascunho", "em_assinatura", "concluido"],
      tipo_item: ["epi", "uniforme"],
      tipo_mov: ["entrada", "saida", "devolucao", "descarte"],
      uniforme_genero: ["masculino", "feminino", "unissex"],
    },
  },
} as const
