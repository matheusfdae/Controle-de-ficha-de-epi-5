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
      epi_tamanhos: {
        Row: {
          created_at: string
          epi_id: string
          estoque: number
          estoque_minimo: number
          id: string
          tamanho: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          epi_id: string
          estoque?: number
          estoque_minimo?: number
          id?: string
          tamanho: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          epi_id?: string
          estoque?: number
          estoque_minimo?: number
          id?: string
          tamanho?: string
          updated_at?: string
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
          motivo: string | null
          nome_funcionario: string | null
          numero: number
          observacoes: string | null
          setor_snapshot: string | null
          status: Database["public"]["Enums"]["ficha_status"]
          telefone: string | null
          turno: string | null
          updated_at: string
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
          motivo?: string | null
          nome_funcionario?: string | null
          numero?: number
          observacoes?: string | null
          setor_snapshot?: string | null
          status?: Database["public"]["Enums"]["ficha_status"]
          telefone?: string | null
          turno?: string | null
          updated_at?: string
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
          motivo?: string | null
          nome_funcionario?: string | null
          numero?: number
          observacoes?: string | null
          setor_snapshot?: string | null
          status?: Database["public"]["Enums"]["ficha_status"]
          telefone?: string | null
          turno?: string | null
          updated_at?: string
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
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          updated_at?: string
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
      profiles: {
        Row: {
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
          nome_completo: string
          setor: string | null
          supervisor_id: string | null
          updated_at: string
        }
        Insert: {
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
          nome_completo?: string
          setor?: string | null
          supervisor_id?: string | null
          updated_at?: string
        }
        Update: {
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
          nome_completo?: string
          setor?: string | null
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
      assinar_ficha_publica: {
        Args: {
          _assinatura: string
          _ficha_id: string
          _ip?: string
          _itens_recebidos: string[]
        }
        Returns: Json
      }
      check_integracao_completa: {
        Args: { _colaborador: string }
        Returns: undefined
      }
      get_ficha_publica: { Args: { _ficha_id: string }; Returns: Json }
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
    }
    Enums: {
      app_role: "admin" | "rh" | "supervisor" | "colaborador"
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
      motivo_entrega: "admissao" | "reposicao" | "troca" | "devolucao"
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
      app_role: ["admin", "rh", "supervisor", "colaborador"],
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
      motivo_entrega: ["admissao", "reposicao", "troca", "devolucao"],
      tipo_item: ["epi", "uniforme"],
      tipo_mov: ["entrada", "saida", "devolucao", "descarte"],
      uniforme_genero: ["masculino", "feminino", "unissex"],
    },
  },
} as const
