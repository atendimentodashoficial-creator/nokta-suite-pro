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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_users: {
        Row: {
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          last_login: string | null
          password_hash: string
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name?: string | null
          id?: string
          last_login?: string | null
          password_hash: string
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          last_login?: string | null
          password_hash?: string
        }
        Relationships: []
      }
      agendamentos: {
        Row: {
          aviso_3dias: boolean | null
          aviso_dia: boolean | null
          aviso_dia_anterior: boolean | null
          cliente_id: string
          created_at: string
          data_agendamento: string
          data_follow_up: string | null
          id: string
          numero_reagendamentos: number
          observacoes: string | null
          origem_agendamento: string | null
          origem_instancia_nome: string | null
          procedimento_id: string | null
          profissional_id: string | null
          status: Database["public"]["Enums"]["status_agendamento"]
          tipo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          aviso_3dias?: boolean | null
          aviso_dia?: boolean | null
          aviso_dia_anterior?: boolean | null
          cliente_id: string
          created_at?: string
          data_agendamento: string
          data_follow_up?: string | null
          id?: string
          numero_reagendamentos?: number
          observacoes?: string | null
          origem_agendamento?: string | null
          origem_instancia_nome?: string | null
          procedimento_id?: string | null
          profissional_id?: string | null
          status?: Database["public"]["Enums"]["status_agendamento"]
          tipo?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          aviso_3dias?: boolean | null
          aviso_dia?: boolean | null
          aviso_dia_anterior?: boolean | null
          cliente_id?: string
          created_at?: string
          data_agendamento?: string
          data_follow_up?: string | null
          id?: string
          numero_reagendamentos?: number
          observacoes?: string | null
          origem_agendamento?: string | null
          origem_instancia_nome?: string | null
          procedimento_id?: string | null
          profissional_id?: string | null
          status?: Database["public"]["Enums"]["status_agendamento"]
          tipo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "disponibilidade_horarios"
            referencedColumns: ["profissional_id"]
          },
          {
            foreignKeyName: "agendamentos_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profissionais"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_ads_reports: {
        Row: {
          account_id: string
          ads_count: number | null
          adsets_count: number | null
          campaigns_count: number | null
          created_at: string
          date_end: string
          date_start: string
          id: string
          report: Json
          user_id: string
        }
        Insert: {
          account_id: string
          ads_count?: number | null
          adsets_count?: number | null
          campaigns_count?: number | null
          created_at?: string
          date_end: string
          date_start: string
          id?: string
          report: Json
          user_id: string
        }
        Update: {
          account_id?: string
          ads_count?: number | null
          adsets_count?: number | null
          campaigns_count?: number | null
          created_at?: string
          date_end?: string
          date_start?: string
          id?: string
          report?: Json
          user_id?: string
        }
        Relationships: []
      }
      apify_config: {
        Row: {
          api_key: string
          created_at: string
          id: string
          is_active: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      assistente_contexto: {
        Row: {
          active: boolean
          atualizado_em: string
          data_hora: string | null
          id: string
          phone: string
          procedimento_id: string | null
          profissional_id: string | null
          session_id: string
          user_id: string
        }
        Insert: {
          active?: boolean
          atualizado_em?: string
          data_hora?: string | null
          id?: string
          phone: string
          procedimento_id?: string | null
          profissional_id?: string | null
          session_id: string
          user_id: string
        }
        Update: {
          active?: boolean
          atualizado_em?: string
          data_hora?: string | null
          id?: string
          phone?: string
          procedimento_id?: string | null
          profissional_id?: string | null
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistente_contexto_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistente_contexto_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "disponibilidade_horarios"
            referencedColumns: ["profissional_id"]
          },
          {
            foreignKeyName: "assistente_contexto_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profissionais"
            referencedColumns: ["id"]
          },
        ]
      }
      audios_predefinidos: {
        Row: {
          audio_url: string
          bloco_id: string | null
          created_at: string
          duracao_segundos: number | null
          id: string
          ordem: number | null
          titulo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          audio_url: string
          bloco_id?: string | null
          created_at?: string
          duracao_segundos?: number | null
          id?: string
          ordem?: number | null
          titulo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          audio_url?: string
          bloco_id?: string | null
          created_at?: string
          duracao_segundos?: number | null
          id?: string
          ordem?: number | null
          titulo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audios_predefinidos_bloco_id_fkey"
            columns: ["bloco_id"]
            isOneToOne: false
            referencedRelation: "blocos_audios_predefinidos"
            referencedColumns: ["id"]
          },
        ]
      }
      ausencias_profissionais: {
        Row: {
          created_at: string | null
          data_fim: string
          data_inicio: string
          id: string
          motivo: string | null
          profissional_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          data_fim: string
          data_inicio: string
          id?: string
          motivo?: string | null
          profissional_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          data_fim?: string
          data_inicio?: string
          id?: string
          motivo?: string | null
          profissional_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ausencias_profissionais_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "disponibilidade_horarios"
            referencedColumns: ["profissional_id"]
          },
          {
            foreignKeyName: "ausencias_profissionais_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profissionais"
            referencedColumns: ["id"]
          },
        ]
      }
      avisos_agendamento: {
        Row: {
          ativo: boolean
          created_at: string
          dias_antes: number
          horario_envio: string
          id: string
          intervalo_max: number
          intervalo_min: number
          mensagem: string
          nome: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          dias_antes?: number
          horario_envio?: string
          id?: string
          intervalo_max?: number
          intervalo_min?: number
          mensagem: string
          nome: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          dias_antes?: number
          horario_envio?: string
          id?: string
          intervalo_max?: number
          intervalo_min?: number
          mensagem?: string
          nome?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      avisos_enviados_log: {
        Row: {
          agendamento_id: string | null
          aviso_id: string | null
          aviso_nome: string
          cliente_id: string | null
          cliente_nome: string
          cliente_telefone: string
          created_at: string
          dias_antes: number
          enviado_em: string
          erro: string | null
          id: string
          mensagem_enviada: string
          status: string
          user_id: string
        }
        Insert: {
          agendamento_id?: string | null
          aviso_id?: string | null
          aviso_nome: string
          cliente_id?: string | null
          cliente_nome: string
          cliente_telefone: string
          created_at?: string
          dias_antes: number
          enviado_em?: string
          erro?: string | null
          id?: string
          mensagem_enviada: string
          status?: string
          user_id: string
        }
        Update: {
          agendamento_id?: string | null
          aviso_id?: string | null
          aviso_nome?: string
          cliente_id?: string | null
          cliente_nome?: string
          cliente_telefone?: string
          created_at?: string
          dias_antes?: number
          enviado_em?: string
          erro?: string | null
          id?: string
          mensagem_enviada?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avisos_enviados_log_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avisos_enviados_log_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos_completos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avisos_enviados_log_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "disponibilidade_horarios"
            referencedColumns: ["agendamento_id"]
          },
          {
            foreignKeyName: "avisos_enviados_log_aviso_id_fkey"
            columns: ["aviso_id"]
            isOneToOne: false
            referencedRelation: "avisos_agendamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avisos_enviados_log_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      blocos_audios_predefinidos: {
        Row: {
          created_at: string
          id: string
          ordem: number | null
          titulo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ordem?: number | null
          titulo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ordem?: number | null
          titulo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      blocos_mensagens_predefinidas: {
        Row: {
          created_at: string
          id: string
          ordem: number | null
          titulo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ordem?: number | null
          titulo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ordem?: number | null
          titulo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      categorias_despesas: {
        Row: {
          cor: string | null
          created_at: string | null
          descricao: string | null
          id: string
          nome: string
          user_id: string
        }
        Insert: {
          cor?: string | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome: string
          user_id: string
        }
        Update: {
          cor?: string | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          user_id?: string
        }
        Relationships: []
      }
      despesas: {
        Row: {
          categoria_id: string | null
          created_at: string | null
          data_despesa: string | null
          descricao: string
          id: string
          observacoes: string | null
          recorrente: boolean | null
          updated_at: string | null
          user_id: string
          valor: number
        }
        Insert: {
          categoria_id?: string | null
          created_at?: string | null
          data_despesa?: string | null
          descricao: string
          id?: string
          observacoes?: string | null
          recorrente?: boolean | null
          updated_at?: string | null
          user_id: string
          valor: number
        }
        Update: {
          categoria_id?: string | null
          created_at?: string | null
          data_despesa?: string | null
          descricao?: string
          id?: string
          observacoes?: string | null
          recorrente?: boolean | null
          updated_at?: string | null
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "despesas_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_despesas"
            referencedColumns: ["id"]
          },
        ]
      }
      disparos_campanha_contatos: {
        Row: {
          campanha_id: string
          created_at: string
          enviado_em: string | null
          erro: string | null
          id: string
          nome: string | null
          numero: string
          status: string
        }
        Insert: {
          campanha_id: string
          created_at?: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          nome?: string | null
          numero: string
          status?: string
        }
        Update: {
          campanha_id?: string
          created_at?: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          nome?: string | null
          numero?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "disparos_campanha_contatos_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "disparos_campanhas"
            referencedColumns: ["id"]
          },
        ]
      }
      disparos_campanha_variacoes: {
        Row: {
          bloco: number
          campanha_id: string
          created_at: string
          id: string
          media_base64: string | null
          mensagem: string | null
          ordem: number
          tipo_mensagem: string
        }
        Insert: {
          bloco?: number
          campanha_id: string
          created_at?: string
          id?: string
          media_base64?: string | null
          mensagem?: string | null
          ordem?: number
          tipo_mensagem?: string
        }
        Update: {
          bloco?: number
          campanha_id?: string
          created_at?: string
          id?: string
          media_base64?: string | null
          mensagem?: string | null
          ordem?: number
          tipo_mensagem?: string
        }
        Relationships: [
          {
            foreignKeyName: "disparos_campanha_variacoes_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "disparos_campanhas"
            referencedColumns: ["id"]
          },
        ]
      }
      disparos_campanhas: {
        Row: {
          campaign_id_uazapi: string | null
          created_at: string
          delay_bloco_max: number
          delay_bloco_min: number
          delay_max: number
          delay_min: number
          enviados: number
          falhas: number
          finalizado_em: string | null
          id: string
          iniciado_em: string | null
          instance_rotation_state: Json
          instancias_ids: string[] | null
          last_instance_id: string | null
          media_base64: string | null
          media_url: string | null
          mensagem: string | null
          nome: string
          status: string
          tipo_mensagem: string
          total_contatos: number
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_id_uazapi?: string | null
          created_at?: string
          delay_bloco_max?: number
          delay_bloco_min?: number
          delay_max?: number
          delay_min?: number
          enviados?: number
          falhas?: number
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string | null
          instance_rotation_state?: Json
          instancias_ids?: string[] | null
          last_instance_id?: string | null
          media_base64?: string | null
          media_url?: string | null
          mensagem?: string | null
          nome: string
          status?: string
          tipo_mensagem: string
          total_contatos?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          campaign_id_uazapi?: string | null
          created_at?: string
          delay_bloco_max?: number
          delay_bloco_min?: number
          delay_max?: number
          delay_min?: number
          enviados?: number
          falhas?: number
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string | null
          instance_rotation_state?: Json
          instancias_ids?: string[] | null
          last_instance_id?: string | null
          media_base64?: string | null
          media_url?: string | null
          mensagem?: string | null
          nome?: string
          status?: string
          tipo_mensagem?: string
          total_contatos?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      disparos_chat_kanban: {
        Row: {
          chat_id: string
          column_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chat_id: string
          column_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chat_id?: string
          column_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "disparos_chat_kanban_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: true
            referencedRelation: "disparos_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disparos_chat_kanban_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "disparos_kanban_columns"
            referencedColumns: ["id"]
          },
        ]
      }
      disparos_chats: {
        Row: {
          chat_id: string
          contact_name: string
          contact_number: string
          created_at: string
          deleted_at: string | null
          id: string
          instancia_id: string | null
          instancia_nome: string | null
          last_message: string | null
          last_message_time: string | null
          last_read_at: string | null
          normalized_number: string
          profile_pic_url: string | null
          provider_unread_baseline: number | null
          provider_unread_count: number | null
          unread_count: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          chat_id: string
          contact_name: string
          contact_number: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          instancia_id?: string | null
          instancia_nome?: string | null
          last_message?: string | null
          last_message_time?: string | null
          last_read_at?: string | null
          normalized_number: string
          profile_pic_url?: string | null
          provider_unread_baseline?: number | null
          provider_unread_count?: number | null
          unread_count?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          chat_id?: string
          contact_name?: string
          contact_number?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          instancia_id?: string | null
          instancia_nome?: string | null
          last_message?: string | null
          last_message_time?: string | null
          last_read_at?: string | null
          normalized_number?: string
          profile_pic_url?: string | null
          provider_unread_baseline?: number | null
          provider_unread_count?: number | null
          unread_count?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "disparos_chats_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "disparos_instancias"
            referencedColumns: ["id"]
          },
        ]
      }
      disparos_config: {
        Row: {
          api_key: string
          base_url: string
          created_at: string
          id: string
          instance_name: string | null
          is_active: boolean | null
          last_sync_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key: string
          base_url: string
          created_at?: string
          id?: string
          instance_name?: string | null
          is_active?: boolean | null
          last_sync_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string
          base_url?: string
          created_at?: string
          id?: string
          instance_name?: string | null
          is_active?: boolean | null
          last_sync_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      disparos_instancias: {
        Row: {
          api_key: string
          base_url: string
          created_at: string
          id: string
          instance_name: string | null
          is_active: boolean | null
          last_sync_at: string | null
          last_webhook_at: string | null
          nome: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key: string
          base_url: string
          created_at?: string
          id?: string
          instance_name?: string | null
          is_active?: boolean | null
          last_sync_at?: string | null
          last_webhook_at?: string | null
          nome: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string
          base_url?: string
          created_at?: string
          id?: string
          instance_name?: string | null
          is_active?: boolean | null
          last_sync_at?: string | null
          last_webhook_at?: string | null
          nome?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      disparos_kanban_columns: {
        Row: {
          ativo: boolean
          cor: string
          created_at: string
          id: string
          nome: string
          ordem: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          cor?: string
          created_at?: string
          id?: string
          nome: string
          ordem?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          cor?: string
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      disparos_messages: {
        Row: {
          ad_thumbnail_url: string | null
          admin_id: string | null
          chat_id: string
          content: string
          created_at: string
          deleted: boolean | null
          fb_ad_id: string | null
          fb_ad_name: string | null
          fb_adset_name: string | null
          fb_campaign_name: string | null
          fbclid: string | null
          id: string
          media_type: Database["public"]["Enums"]["message_media_type"] | null
          media_url: string | null
          message_id: string
          sender_type: Database["public"]["Enums"]["sender_type"]
          status: Database["public"]["Enums"]["message_status"] | null
          timestamp: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          ad_thumbnail_url?: string | null
          admin_id?: string | null
          chat_id: string
          content: string
          created_at?: string
          deleted?: boolean | null
          fb_ad_id?: string | null
          fb_ad_name?: string | null
          fb_adset_name?: string | null
          fb_campaign_name?: string | null
          fbclid?: string | null
          id?: string
          media_type?: Database["public"]["Enums"]["message_media_type"] | null
          media_url?: string | null
          message_id: string
          sender_type: Database["public"]["Enums"]["sender_type"]
          status?: Database["public"]["Enums"]["message_status"] | null
          timestamp: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          ad_thumbnail_url?: string | null
          admin_id?: string | null
          chat_id?: string
          content?: string
          created_at?: string
          deleted?: boolean | null
          fb_ad_id?: string | null
          fb_ad_name?: string | null
          fb_adset_name?: string | null
          fb_campaign_name?: string | null
          fbclid?: string | null
          id?: string
          media_type?: Database["public"]["Enums"]["message_media_type"] | null
          media_url?: string | null
          message_id?: string
          sender_type?: Database["public"]["Enums"]["sender_type"]
          status?: Database["public"]["Enums"]["message_status"] | null
          timestamp?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disparos_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "disparos_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      disparos_template_variacoes: {
        Row: {
          bloco: number
          created_at: string
          id: string
          media_base64: string | null
          mensagem: string | null
          ordem: number
          template_id: string
          tipo_mensagem: string
        }
        Insert: {
          bloco?: number
          created_at?: string
          id?: string
          media_base64?: string | null
          mensagem?: string | null
          ordem?: number
          template_id: string
          tipo_mensagem?: string
        }
        Update: {
          bloco?: number
          created_at?: string
          id?: string
          media_base64?: string | null
          mensagem?: string | null
          ordem?: number
          template_id?: string
          tipo_mensagem?: string
        }
        Relationships: [
          {
            foreignKeyName: "disparos_template_variacoes_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "disparos_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      disparos_templates: {
        Row: {
          created_at: string
          delay_bloco_max: number
          delay_bloco_min: number
          id: string
          media_base64: string | null
          mensagem: string | null
          nome: string
          tipo_mensagem: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delay_bloco_max?: number
          delay_bloco_min?: number
          id?: string
          media_base64?: string | null
          mensagem?: string | null
          nome: string
          tipo_mensagem?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          delay_bloco_max?: number
          delay_bloco_min?: number
          id?: string
          media_base64?: string | null
          mensagem?: string | null
          nome?: string
          tipo_mensagem?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      escalas_profissionais: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          dia_semana: number
          hora_fim: string
          hora_inicio: string
          id: string
          profissional_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          dia_semana: number
          hora_fim: string
          hora_inicio: string
          id?: string
          profissional_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          dia_semana?: number
          hora_fim?: string
          hora_inicio?: string
          id?: string
          profissional_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalas_profissionais_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "disponibilidade_horarios"
            referencedColumns: ["profissional_id"]
          },
          {
            foreignKeyName: "escalas_profissionais_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profissionais"
            referencedColumns: ["id"]
          },
        ]
      }
      facebook_ad_accounts: {
        Row: {
          account_name: string | null
          account_type: string | null
          ad_account_id: string
          created_at: string
          id: string
          is_prepay_account: boolean | null
          last_balance: number | null
          last_sync_at: string | null
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name?: string | null
          account_type?: string | null
          ad_account_id: string
          created_at?: string
          id?: string
          is_prepay_account?: boolean | null
          last_balance?: number | null
          last_sync_at?: string | null
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string | null
          account_type?: string | null
          ad_account_id?: string
          created_at?: string
          id?: string
          is_prepay_account?: boolean | null
          last_balance?: number | null
          last_sync_at?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      facebook_config: {
        Row: {
          access_token: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      fatura_agendamentos: {
        Row: {
          agendamento_id: string
          created_at: string
          fatura_id: string
          id: string
        }
        Insert: {
          agendamento_id: string
          created_at?: string
          fatura_id: string
          id?: string
        }
        Update: {
          agendamento_id?: string
          created_at?: string
          fatura_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fatura_agendamentos_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fatura_agendamentos_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos_completos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fatura_agendamentos_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "disponibilidade_horarios"
            referencedColumns: ["agendamento_id"]
          },
          {
            foreignKeyName: "fatura_agendamentos_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "faturas"
            referencedColumns: ["id"]
          },
        ]
      }
      fatura_upsells: {
        Row: {
          created_at: string
          descricao: string
          fatura_id: string
          id: string
          procedimento_id: string | null
          produto_id: string | null
          tipo: string
          valor: number
        }
        Insert: {
          created_at?: string
          descricao: string
          fatura_id: string
          id?: string
          procedimento_id?: string | null
          produto_id?: string | null
          tipo: string
          valor?: number
        }
        Update: {
          created_at?: string
          descricao?: string
          fatura_id?: string
          id?: string
          procedimento_id?: string | null
          produto_id?: string | null
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "fatura_upsells_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "faturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fatura_upsells_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fatura_upsells_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      faturas: {
        Row: {
          cliente_id: string
          created_at: string
          data_follow_up: string | null
          forma_pagamento: string | null
          id: string
          juros_pago_por: string | null
          meio_pagamento: string | null
          numero_parcelas: number | null
          observacoes: string | null
          pixel_data_completed_at: string | null
          pixel_event_sent_at: string | null
          pixel_form_sent_at: string | null
          pixel_status: string | null
          procedimento_id: string | null
          profissional_id: string | null
          status: Database["public"]["Enums"]["status_fatura"]
          taxa_parcelamento: number | null
          updated_at: string
          user_id: string
          valor: number
          valor_entrada: number | null
          valor_parcela: number | null
        }
        Insert: {
          cliente_id: string
          created_at?: string
          data_follow_up?: string | null
          forma_pagamento?: string | null
          id?: string
          juros_pago_por?: string | null
          meio_pagamento?: string | null
          numero_parcelas?: number | null
          observacoes?: string | null
          pixel_data_completed_at?: string | null
          pixel_event_sent_at?: string | null
          pixel_form_sent_at?: string | null
          pixel_status?: string | null
          procedimento_id?: string | null
          profissional_id?: string | null
          status?: Database["public"]["Enums"]["status_fatura"]
          taxa_parcelamento?: number | null
          updated_at?: string
          user_id: string
          valor: number
          valor_entrada?: number | null
          valor_parcela?: number | null
        }
        Update: {
          cliente_id?: string
          created_at?: string
          data_follow_up?: string | null
          forma_pagamento?: string | null
          id?: string
          juros_pago_por?: string | null
          meio_pagamento?: string | null
          numero_parcelas?: number | null
          observacoes?: string | null
          pixel_data_completed_at?: string | null
          pixel_event_sent_at?: string | null
          pixel_form_sent_at?: string | null
          pixel_status?: string | null
          procedimento_id?: string | null
          profissional_id?: string | null
          status?: Database["public"]["Enums"]["status_fatura"]
          taxa_parcelamento?: number | null
          updated_at?: string
          user_id?: string
          valor?: number
          valor_entrada?: number | null
          valor_parcela?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "faturas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "disponibilidade_horarios"
            referencedColumns: ["profissional_id"]
          },
          {
            foreignKeyName: "faturas_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profissionais"
            referencedColumns: ["id"]
          },
        ]
      }
      google_ads_accounts: {
        Row: {
          account_name: string | null
          created_at: string
          currency: string | null
          customer_id: string
          id: string
          last_balance: number | null
          last_spend: number | null
          last_sync_at: string | null
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name?: string | null
          created_at?: string
          currency?: string | null
          customer_id: string
          id?: string
          last_balance?: number | null
          last_spend?: number | null
          last_sync_at?: string | null
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string | null
          created_at?: string
          currency?: string | null
          customer_id?: string
          id?: string
          last_balance?: number | null
          last_spend?: number | null
          last_sync_at?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      google_ads_config: {
        Row: {
          access_token: string | null
          client_id: string
          client_secret: string
          created_at: string
          developer_token: string
          id: string
          is_active: boolean | null
          refresh_token: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          client_id: string
          client_secret: string
          created_at?: string
          developer_token: string
          id?: string
          is_active?: boolean | null
          refresh_token: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          client_id?: string
          client_secret?: string
          created_at?: string
          developer_token?: string
          id?: string
          is_active?: boolean | null
          refresh_token?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      historico_leads: {
        Row: {
          data_alteracao: string | null
          id: string
          lead_id: string
          observacao: string | null
          status_anterior: Database["public"]["Enums"]["lead_status"] | null
          status_novo: Database["public"]["Enums"]["lead_status"]
          user_id: string
        }
        Insert: {
          data_alteracao?: string | null
          id?: string
          lead_id: string
          observacao?: string | null
          status_anterior?: Database["public"]["Enums"]["lead_status"] | null
          status_novo: Database["public"]["Enums"]["lead_status"]
          user_id: string
        }
        Update: {
          data_alteracao?: string | null
          id?: string
          lead_id?: string
          observacao?: string | null
          status_anterior?: Database["public"]["Enums"]["lead_status"] | null
          status_novo?: Database["public"]["Enums"]["lead_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "historico_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_config: {
        Row: {
          app_id: string
          app_secret: string
          created_at: string
          form_base_url: string | null
          ice_breakers: Json | null
          id: string
          instagram_account_id: string | null
          is_active: boolean | null
          mensagem_pedir_seguir: string | null
          page_access_token: string
          updated_at: string
          user_id: string
          verificar_seguidor: boolean | null
          webhook_verify_token: string
        }
        Insert: {
          app_id: string
          app_secret: string
          created_at?: string
          form_base_url?: string | null
          ice_breakers?: Json | null
          id?: string
          instagram_account_id?: string | null
          is_active?: boolean | null
          mensagem_pedir_seguir?: string | null
          page_access_token: string
          updated_at?: string
          user_id: string
          verificar_seguidor?: boolean | null
          webhook_verify_token?: string
        }
        Update: {
          app_id?: string
          app_secret?: string
          created_at?: string
          form_base_url?: string | null
          ice_breakers?: Json | null
          id?: string
          instagram_account_id?: string | null
          is_active?: boolean | null
          mensagem_pedir_seguir?: string | null
          page_access_token?: string
          updated_at?: string
          user_id?: string
          verificar_seguidor?: boolean | null
          webhook_verify_token?: string
        }
        Relationships: []
      }
      instagram_fluxos: {
        Row: {
          ativo: boolean | null
          created_at: string
          descricao: string | null
          edges: Json | null
          etapas: Json
          id: string
          nodes: Json | null
          nome: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string
          descricao?: string | null
          edges?: Json | null
          etapas?: Json
          id?: string
          nodes?: Json | null
          nome: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean | null
          created_at?: string
          descricao?: string | null
          edges?: Json | null
          etapas?: Json
          id?: string
          nodes?: Json | null
          nome?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      instagram_formularios: {
        Row: {
          ativo: boolean | null
          botao_sucesso_texto: string | null
          botao_sucesso_url: string | null
          campos: Json
          cor_primaria: string | null
          created_at: string
          descricao: string | null
          id: string
          imagem_url: string | null
          mensagem_sucesso: string
          nome: string
          subtitulo_pagina: string | null
          texto_botao: string
          titulo_pagina: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean | null
          botao_sucesso_texto?: string | null
          botao_sucesso_url?: string | null
          campos?: Json
          cor_primaria?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          imagem_url?: string | null
          mensagem_sucesso?: string
          nome: string
          subtitulo_pagina?: string | null
          texto_botao?: string
          titulo_pagina?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean | null
          botao_sucesso_texto?: string | null
          botao_sucesso_url?: string | null
          campos?: Json
          cor_primaria?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          imagem_url?: string | null
          mensagem_sucesso?: string
          nome?: string
          subtitulo_pagina?: string | null
          texto_botao?: string
          titulo_pagina?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      instagram_formularios_respostas: {
        Row: {
          created_at: string
          dados_extras: Json | null
          email: string | null
          formulario_id: string
          id: string
          instagram_user_id: string | null
          nome: string | null
          telefone: string | null
          tracking_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          dados_extras?: Json | null
          email?: string | null
          formulario_id: string
          id?: string
          instagram_user_id?: string | null
          nome?: string | null
          telefone?: string | null
          tracking_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          dados_extras?: Json | null
          email?: string | null
          formulario_id?: string
          id?: string
          instagram_user_id?: string | null
          nome?: string | null
          telefone?: string | null
          tracking_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_formularios_respostas_formulario_id_fkey"
            columns: ["formulario_id"]
            isOneToOne: false
            referencedRelation: "instagram_formularios"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_gatilhos: {
        Row: {
          ativo: boolean | null
          ativo_em_comentario: boolean | null
          ativo_em_dm: boolean | null
          botao_formulario_texto: string | null
          botao_liberar_texto: string | null
          created_at: string
          fluxo_id: string | null
          formulario_id: string | null
          id: string
          instagram_seguir: string | null
          mensagem_formulario: string | null
          mensagem_pedir_seguir: string | null
          nome: string
          palavras_chave: string[]
          responder_comentario: boolean | null
          resposta_botoes: Json | null
          resposta_comentario_texto: string | null
          resposta_link_texto: string | null
          resposta_link_url: string | null
          resposta_midia_tipo: string | null
          resposta_midia_url: string | null
          resposta_texto: string | null
          tipo: string
          titulo_botoes: string | null
          updated_at: string
          user_id: string
          verificar_seguidor: boolean | null
        }
        Insert: {
          ativo?: boolean | null
          ativo_em_comentario?: boolean | null
          ativo_em_dm?: boolean | null
          botao_formulario_texto?: string | null
          botao_liberar_texto?: string | null
          created_at?: string
          fluxo_id?: string | null
          formulario_id?: string | null
          id?: string
          instagram_seguir?: string | null
          mensagem_formulario?: string | null
          mensagem_pedir_seguir?: string | null
          nome: string
          palavras_chave?: string[]
          responder_comentario?: boolean | null
          resposta_botoes?: Json | null
          resposta_comentario_texto?: string | null
          resposta_link_texto?: string | null
          resposta_link_url?: string | null
          resposta_midia_tipo?: string | null
          resposta_midia_url?: string | null
          resposta_texto?: string | null
          tipo?: string
          titulo_botoes?: string | null
          updated_at?: string
          user_id: string
          verificar_seguidor?: boolean | null
        }
        Update: {
          ativo?: boolean | null
          ativo_em_comentario?: boolean | null
          ativo_em_dm?: boolean | null
          botao_formulario_texto?: string | null
          botao_liberar_texto?: string | null
          created_at?: string
          fluxo_id?: string | null
          formulario_id?: string | null
          id?: string
          instagram_seguir?: string | null
          mensagem_formulario?: string | null
          mensagem_pedir_seguir?: string | null
          nome?: string
          palavras_chave?: string[]
          responder_comentario?: boolean | null
          resposta_botoes?: Json | null
          resposta_comentario_texto?: string | null
          resposta_link_texto?: string | null
          resposta_link_url?: string | null
          resposta_midia_tipo?: string | null
          resposta_midia_url?: string | null
          resposta_texto?: string | null
          tipo?: string
          titulo_botoes?: string | null
          updated_at?: string
          user_id?: string
          verificar_seguidor?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_gatilhos_formulario_id_fkey"
            columns: ["formulario_id"]
            isOneToOne: false
            referencedRelation: "instagram_formularios"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_interacoes: {
        Row: {
          id: string
          instagram_user_id: string
          primeira_interacao_em: string
          total_mensagens: number | null
          ultima_interacao_em: string
          user_id: string
        }
        Insert: {
          id?: string
          instagram_user_id: string
          primeira_interacao_em?: string
          total_mensagens?: number | null
          ultima_interacao_em?: string
          user_id: string
        }
        Update: {
          id?: string
          instagram_user_id?: string
          primeira_interacao_em?: string
          total_mensagens?: number | null
          ultima_interacao_em?: string
          user_id?: string
        }
        Relationships: []
      }
      instagram_mensagens: {
        Row: {
          conteudo: string | null
          created_at: string
          fluxo_id: string | null
          gatilho_id: string | null
          id: string
          instagram_user_id: string
          instagram_username: string | null
          media_url: string | null
          metadata: Json | null
          post_id: string | null
          tipo: string
          user_id: string
        }
        Insert: {
          conteudo?: string | null
          created_at?: string
          fluxo_id?: string | null
          gatilho_id?: string | null
          id?: string
          instagram_user_id: string
          instagram_username?: string | null
          media_url?: string | null
          metadata?: Json | null
          post_id?: string | null
          tipo: string
          user_id: string
        }
        Update: {
          conteudo?: string | null
          created_at?: string
          fluxo_id?: string | null
          gatilho_id?: string | null
          id?: string
          instagram_user_id?: string
          instagram_username?: string | null
          media_url?: string | null
          metadata?: Json | null
          post_id?: string | null
          tipo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_mensagens_fluxo_id_fkey"
            columns: ["fluxo_id"]
            isOneToOne: false
            referencedRelation: "instagram_fluxos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_mensagens_gatilho_id_fkey"
            columns: ["gatilho_id"]
            isOneToOne: false
            referencedRelation: "instagram_gatilhos"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_status_custom: {
        Row: {
          ativo: boolean | null
          cor: string | null
          created_at: string | null
          id: string
          nome: string
          ordem: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ativo?: boolean | null
          cor?: string | null
          created_at?: string | null
          id?: string
          nome: string
          ordem?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ativo?: boolean | null
          cor?: string | null
          created_at?: string | null
          id?: string
          nome?: string
          ordem?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          ad_thumbnail_url: string | null
          avaliacao: number | null
          cep: string | null
          cidade: string | null
          created_at: string | null
          data_agendamento: string | null
          data_comparecimento: string | null
          data_contato: string | null
          data_nascimento: string | null
          deleted_at: string | null
          email: string | null
          endereco: string | null
          estado: string | null
          fb_ad_id: string | null
          fb_ad_name: string | null
          fb_adset_id: string | null
          fb_adset_name: string | null
          fb_campaign_name: string | null
          fbclid: string | null
          gclid: string | null
          genero: string | null
          id: string
          instancia_nome: string | null
          nome: string
          observacoes: string | null
          origem: string | null
          origem_lead: boolean | null
          origem_tipo: string | null
          procedimento_id: string | null
          procedimento_nome: string
          profissional_id: string | null
          respondeu: boolean | null
          status: Database["public"]["Enums"]["lead_status"] | null
          telefone: string
          updated_at: string | null
          user_id: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          valor_tratamento: number | null
        }
        Insert: {
          ad_thumbnail_url?: string | null
          avaliacao?: number | null
          cep?: string | null
          cidade?: string | null
          created_at?: string | null
          data_agendamento?: string | null
          data_comparecimento?: string | null
          data_contato?: string | null
          data_nascimento?: string | null
          deleted_at?: string | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          fb_ad_id?: string | null
          fb_ad_name?: string | null
          fb_adset_id?: string | null
          fb_adset_name?: string | null
          fb_campaign_name?: string | null
          fbclid?: string | null
          gclid?: string | null
          genero?: string | null
          id?: string
          instancia_nome?: string | null
          nome: string
          observacoes?: string | null
          origem?: string | null
          origem_lead?: boolean | null
          origem_tipo?: string | null
          procedimento_id?: string | null
          procedimento_nome: string
          profissional_id?: string | null
          respondeu?: boolean | null
          status?: Database["public"]["Enums"]["lead_status"] | null
          telefone: string
          updated_at?: string | null
          user_id: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          valor_tratamento?: number | null
        }
        Update: {
          ad_thumbnail_url?: string | null
          avaliacao?: number | null
          cep?: string | null
          cidade?: string | null
          created_at?: string | null
          data_agendamento?: string | null
          data_comparecimento?: string | null
          data_contato?: string | null
          data_nascimento?: string | null
          deleted_at?: string | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          fb_ad_id?: string | null
          fb_ad_name?: string | null
          fb_adset_id?: string | null
          fb_adset_name?: string | null
          fb_campaign_name?: string | null
          fbclid?: string | null
          gclid?: string | null
          genero?: string | null
          id?: string
          instancia_nome?: string | null
          nome?: string
          observacoes?: string | null
          origem?: string | null
          origem_lead?: boolean | null
          origem_tipo?: string | null
          procedimento_id?: string | null
          procedimento_nome?: string
          profissional_id?: string | null
          respondeu?: boolean | null
          status?: Database["public"]["Enums"]["lead_status"] | null
          telefone?: string
          updated_at?: string | null
          user_id?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          valor_tratamento?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "disponibilidade_horarios"
            referencedColumns: ["profissional_id"]
          },
          {
            foreignKeyName: "leads_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profissionais"
            referencedColumns: ["id"]
          },
        ]
      }
      listas_extrator: {
        Row: {
          busca_original: string | null
          created_at: string
          dados: Json
          filtros_usados: Json | null
          id: string
          localizacao: string | null
          nome: string
          total_contatos: number
          updated_at: string
          user_id: string
        }
        Insert: {
          busca_original?: string | null
          created_at?: string
          dados?: Json
          filtros_usados?: Json | null
          id?: string
          localizacao?: string | null
          nome: string
          total_contatos?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          busca_original?: string | null
          created_at?: string
          dados?: Json
          filtros_usados?: Json | null
          id?: string
          localizacao?: string | null
          nome?: string
          total_contatos?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mensagens_predefinidas: {
        Row: {
          bloco_id: string | null
          conteudo: string
          created_at: string
          id: string
          ordem: number | null
          titulo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bloco_id?: string | null
          conteudo: string
          created_at?: string
          id?: string
          ordem?: number | null
          titulo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bloco_id?: string | null
          conteudo?: string
          created_at?: string
          id?: string
          ordem?: number | null
          titulo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_predefinidas_bloco_id_fkey"
            columns: ["bloco_id"]
            isOneToOne: false
            referencedRelation: "blocos_mensagens_predefinidas"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_conversion_events: {
        Row: {
          agendamento_id: string | null
          created_at: string
          currency: string | null
          customer_data_sent: Json | null
          event_id: string
          event_name: string
          event_time: string
          fatura_id: string | null
          fbclid: string | null
          id: string
          lead_id: string | null
          response: Json | null
          status: string | null
          user_id: string
          utm_campaign: string | null
          utm_source: string | null
          value: number | null
        }
        Insert: {
          agendamento_id?: string | null
          created_at?: string
          currency?: string | null
          customer_data_sent?: Json | null
          event_id: string
          event_name: string
          event_time?: string
          fatura_id?: string | null
          fbclid?: string | null
          id?: string
          lead_id?: string | null
          response?: Json | null
          status?: string | null
          user_id: string
          utm_campaign?: string | null
          utm_source?: string | null
          value?: number | null
        }
        Update: {
          agendamento_id?: string | null
          created_at?: string
          currency?: string | null
          customer_data_sent?: Json | null
          event_id?: string
          event_name?: string
          event_time?: string
          fatura_id?: string | null
          fbclid?: string | null
          id?: string
          lead_id?: string | null
          response?: Json | null
          status?: string | null
          user_id?: string
          utm_campaign?: string | null
          utm_source?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_conversion_events_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_conversion_events_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos_completos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_conversion_events_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "disponibilidade_horarios"
            referencedColumns: ["agendamento_id"]
          },
          {
            foreignKeyName: "meta_conversion_events_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "faturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_conversion_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_pixel_config: {
        Row: {
          access_token: string
          created_at: string
          eventos_ativos: Json | null
          id: string
          mensagem_formulario: string | null
          pixel_id: string
          test_event_code: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          eventos_ativos?: Json | null
          id?: string
          mensagem_formulario?: string | null
          pixel_id: string
          test_event_code?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          eventos_ativos?: Json | null
          id?: string
          mensagem_formulario?: string | null
          pixel_id?: string
          test_event_code?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      metricas_preferencias: {
        Row: {
          created_at: string
          funnel_column_order: Json | null
          id: string
          presets: Json | null
          selected_preset_id: string | null
          updated_at: string
          user_id: string
          visible_cards: Json | null
        }
        Insert: {
          created_at?: string
          funnel_column_order?: Json | null
          id?: string
          presets?: Json | null
          selected_preset_id?: string | null
          updated_at?: string
          user_id: string
          visible_cards?: Json | null
        }
        Update: {
          created_at?: string
          funnel_column_order?: Json | null
          id?: string
          presets?: Json | null
          selected_preset_id?: string | null
          updated_at?: string
          user_id?: string
          visible_cards?: Json | null
        }
        Relationships: []
      }
      openai_config: {
        Row: {
          api_key: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      personalizacao_config: {
        Row: {
          cor_background: string | null
          cor_primaria: string | null
          cor_secundaria: string | null
          cor_sidebar: string | null
          created_at: string
          id: string
          logo_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cor_background?: string | null
          cor_primaria?: string | null
          cor_secundaria?: string | null
          cor_sidebar?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cor_background?: string | null
          cor_primaria?: string | null
          cor_secundaria?: string | null
          cor_sidebar?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      procedimento_profissional: {
        Row: {
          created_at: string
          id: string
          procedimento_id: string
          profissional_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          procedimento_id: string
          profissional_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          procedimento_id?: string
          profissional_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procedimento_profissional_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedimento_profissional_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "disponibilidade_horarios"
            referencedColumns: ["profissional_id"]
          },
          {
            foreignKeyName: "procedimento_profissional_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profissionais"
            referencedColumns: ["id"]
          },
        ]
      }
      procedimentos: {
        Row: {
          ativo: boolean | null
          categoria: string | null
          created_at: string | null
          descricao: string | null
          duracao_minutos: number | null
          id: string
          nome: string
          tempo_atendimento_minutos: number | null
          updated_at: string | null
          user_id: string
          valor_medio: number | null
        }
        Insert: {
          ativo?: boolean | null
          categoria?: string | null
          created_at?: string | null
          descricao?: string | null
          duracao_minutos?: number | null
          id?: string
          nome: string
          tempo_atendimento_minutos?: number | null
          updated_at?: string | null
          user_id: string
          valor_medio?: number | null
        }
        Update: {
          ativo?: boolean | null
          categoria?: string | null
          created_at?: string | null
          descricao?: string | null
          duracao_minutos?: number | null
          id?: string
          nome?: string
          tempo_atendimento_minutos?: number | null
          updated_at?: string | null
          user_id?: string
          valor_medio?: number | null
        }
        Relationships: []
      }
      produtos: {
        Row: {
          ativo: boolean | null
          created_at: string
          descricao: string | null
          id: string
          nome: string
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          updated_at?: string
          user_id: string
          valor?: number
        }
        Update: {
          ativo?: boolean | null
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      profissionais: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          email: string | null
          especialidade: string | null
          id: string
          nome: string
          telefone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          email?: string | null
          especialidade?: string | null
          id?: string
          nome: string
          telefone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          email?: string | null
          especialidade?: string | null
          id?: string
          nome?: string
          telefone?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      stripe_config: {
        Row: {
          created_at: string | null
          id: string
          last_webhook_at: string | null
          stripe_webhook_secret: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_webhook_at?: string | null
          stripe_webhook_secret?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_webhook_at?: string | null
          stripe_webhook_secret?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      subscription_audit: {
        Row: {
          action: string
          admin_email: string
          created_at: string | null
          details: Json | null
          id: string
          ip_address: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          admin_email: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          admin_email?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      tipo_agendamento_custom: {
        Row: {
          ativo: boolean | null
          cor: string | null
          created_at: string | null
          id: string
          nome: string
          ordem: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ativo?: boolean | null
          cor?: string | null
          created_at?: string | null
          id?: string
          nome: string
          ordem?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ativo?: boolean | null
          cor?: string | null
          created_at?: string | null
          id?: string
          nome?: string
          ordem?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      uazapi_config: {
        Row: {
          api_key: string
          base_url: string
          created_at: string
          id: string
          instance_name: string | null
          is_active: boolean | null
          last_sync_at: string | null
          updated_at: string
          user_id: string
          whatsapp_instancia_id: string | null
        }
        Insert: {
          api_key: string
          base_url: string
          created_at?: string
          id?: string
          instance_name?: string | null
          is_active?: boolean | null
          last_sync_at?: string | null
          updated_at?: string
          user_id: string
          whatsapp_instancia_id?: string | null
        }
        Update: {
          api_key?: string
          base_url?: string
          created_at?: string
          id?: string
          instance_name?: string | null
          is_active?: boolean | null
          last_sync_at?: string | null
          updated_at?: string
          user_id?: string
          whatsapp_instancia_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "uazapi_config_whatsapp_instancia_id_fkey"
            columns: ["whatsapp_instancia_id"]
            isOneToOne: false
            referencedRelation: "disparos_instancias"
            referencedColumns: ["id"]
          },
        ]
      }
      user_subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_name: string
          status: Database["public"]["Enums"]["subscription_status"] | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_name?: string
          status?: Database["public"]["Enums"]["subscription_status"] | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_name?: string
          status?: Database["public"]["Enums"]["subscription_status"] | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          created_at: string
          event_message: string
          event_type: string
          id: string
          level: string
          payload: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_message: string
          event_type: string
          id?: string
          level?: string
          payload?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_message?: string
          event_type?: string
          id?: string
          level?: string
          payload?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      webhook_message_dedup: {
        Row: {
          created_at: string
          id: string
          instancia_id: string | null
          message_hash: string
          message_timestamp: number
          phone_last8: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instancia_id?: string | null
          message_hash: string
          message_timestamp: number
          phone_last8: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          instancia_id?: string | null
          message_hash?: string
          message_timestamp?: number
          phone_last8?: string
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_chat_kanban: {
        Row: {
          chat_id: string
          column_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chat_id: string
          column_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chat_id?: string
          column_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_chat_kanban_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_chat_kanban_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_kanban_columns"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_chat_labels: {
        Row: {
          chat_id: string
          created_at: string
          id: string
          label_id: string
          user_id: string
        }
        Insert: {
          chat_id: string
          created_at?: string
          id?: string
          label_id: string
          user_id: string
        }
        Update: {
          chat_id?: string
          created_at?: string
          id?: string
          label_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_chat_labels_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_chats: {
        Row: {
          chat_id: string
          contact_name: string
          contact_number: string
          created_at: string
          deleted_at: string | null
          id: string
          last_message: string | null
          last_message_time: string | null
          last_read_at: string | null
          normalized_number: string
          profile_pic_url: string | null
          provider_unread_baseline: number
          provider_unread_count: number
          unread_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          chat_id: string
          contact_name: string
          contact_number: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          last_message?: string | null
          last_message_time?: string | null
          last_read_at?: string | null
          normalized_number: string
          profile_pic_url?: string | null
          provider_unread_baseline?: number
          provider_unread_count?: number
          unread_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          chat_id?: string
          contact_name?: string
          contact_number?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          last_message?: string | null
          last_message_time?: string | null
          last_read_at?: string | null
          normalized_number?: string
          profile_pic_url?: string | null
          provider_unread_baseline?: number
          provider_unread_count?: number
          unread_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_kanban_columns: {
        Row: {
          ativo: boolean
          cor: string
          created_at: string
          id: string
          nome: string
          ordem: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          cor?: string
          created_at?: string
          id?: string
          nome: string
          ordem?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          cor?: string
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_labels: {
        Row: {
          created_at: string
          id: string
          label_color: string | null
          label_id: string
          label_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label_color?: string | null
          label_id: string
          label_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label_color?: string | null
          label_id?: string
          label_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          ad_thumbnail_url: string | null
          admin_id: string | null
          chat_id: string
          content: string
          created_at: string
          deleted: boolean | null
          fb_ad_id: string | null
          fb_ad_name: string | null
          fb_adset_name: string | null
          fb_campaign_name: string | null
          fbclid: string | null
          id: string
          media_type: Database["public"]["Enums"]["message_media_type"] | null
          media_url: string | null
          message_id: string
          sender_type: Database["public"]["Enums"]["sender_type"]
          status: Database["public"]["Enums"]["message_status"] | null
          timestamp: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          ad_thumbnail_url?: string | null
          admin_id?: string | null
          chat_id: string
          content: string
          created_at?: string
          deleted?: boolean | null
          fb_ad_id?: string | null
          fb_ad_name?: string | null
          fb_adset_name?: string | null
          fb_campaign_name?: string | null
          fbclid?: string | null
          id?: string
          media_type?: Database["public"]["Enums"]["message_media_type"] | null
          media_url?: string | null
          message_id: string
          sender_type: Database["public"]["Enums"]["sender_type"]
          status?: Database["public"]["Enums"]["message_status"] | null
          timestamp: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          ad_thumbnail_url?: string | null
          admin_id?: string | null
          chat_id?: string
          content?: string
          created_at?: string
          deleted?: boolean | null
          fb_ad_id?: string | null
          fb_ad_name?: string | null
          fb_adset_name?: string | null
          fb_campaign_name?: string | null
          fbclid?: string | null
          id?: string
          media_type?: Database["public"]["Enums"]["message_media_type"] | null
          media_url?: string | null
          message_id?: string
          sender_type?: Database["public"]["Enums"]["sender_type"]
          status?: Database["public"]["Enums"]["message_status"] | null
          timestamp?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_sync_status: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          last_sync_at: string
          sync_status: Database["public"]["Enums"]["sync_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          last_sync_at: string
          sync_status: Database["public"]["Enums"]["sync_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          last_sync_at?: string
          sync_status?: Database["public"]["Enums"]["sync_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      agendamentos_completos: {
        Row: {
          aviso_3dias: boolean | null
          aviso_dia: boolean | null
          aviso_dia_anterior: boolean | null
          cliente_email: string | null
          cliente_id: string | null
          cliente_nome: string | null
          cliente_status: Database["public"]["Enums"]["lead_status"] | null
          cliente_telefone: string | null
          created_at: string | null
          data_agendamento: string | null
          id: string | null
          numero_reagendamentos: number | null
          observacoes: string | null
          procedimento_categoria: string | null
          procedimento_duracao: number | null
          procedimento_id: string | null
          procedimento_nome: string | null
          profissional_especialidade: string | null
          profissional_id: string | null
          profissional_nome: string | null
          status: Database["public"]["Enums"]["status_agendamento"] | null
          tipo: string | null
          uazapi_api_key: string | null
          uazapi_base_url: string | null
          uazapi_instance_name: string | null
          uazapi_is_active: boolean | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "disponibilidade_horarios"
            referencedColumns: ["profissional_id"]
          },
          {
            foreignKeyName: "agendamentos_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profissionais"
            referencedColumns: ["id"]
          },
        ]
      }
      disponibilidade_horarios: {
        Row: {
          agendamento_id: string | null
          cliente_nome: string | null
          data: string | null
          data_hora: string | null
          horario: string | null
          profissional_id: string | null
          profissional_nome: string | null
          status: string | null
          user_id: string | null
        }
        Relationships: []
      }
      profissionais_ausencias: {
        Row: {
          created_at: string | null
          data_fim: string | null
          data_inicio: string | null
          id: string | null
          motivo: string | null
          profissional_id: string | null
          profissional_nome: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ausencias_profissionais_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "disponibilidade_horarios"
            referencedColumns: ["profissional_id"]
          },
          {
            foreignKeyName: "ausencias_profissionais_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profissionais"
            referencedColumns: ["id"]
          },
        ]
      }
      profissionais_escalas: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          dia_semana: number | null
          hora_fim: string | null
          hora_inicio: string | null
          id: string | null
          profissional_id: string | null
          profissional_nome: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "escalas_profissionais_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "disponibilidade_horarios"
            referencedColumns: ["profissional_id"]
          },
          {
            foreignKeyName: "escalas_profissionais_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profissionais"
            referencedColumns: ["id"]
          },
        ]
      }
      profissionais_procedimentos: {
        Row: {
          created_at: string | null
          id: string | null
          procedimento_id: string | null
          procedimento_nome: string | null
          profissional_id: string | null
          profissional_nome: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procedimento_profissional_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedimento_profissional_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "disponibilidade_horarios"
            referencedColumns: ["profissional_id"]
          },
          {
            foreignKeyName: "procedimento_profissional_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profissionais"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      calcular_disponibilidade_horarios:
        | {
            Args: {
              p_dias_frente?: number
              p_intervalo_minutos?: number
              p_user_id: string
            }
            Returns: {
              agendamento_id: string
              cliente_nome: string
              data: string
              data_hora: string
              horario: string
              procedimento_nome: string
              profissional_id: string
              profissional_nome: string
              status: string
            }[]
          }
        | {
            Args: {
              p_data_fim: string
              p_data_inicio: string
              p_intervalo_minutos?: number
              p_profissional_id: string
              p_user_id: string
            }
            Returns: {
              agendamento_id: string
              cliente_nome: string
              data: string
              data_hora: string
              horario: string
              procedimento_nome: string
              status: string
            }[]
          }
      increment_disparos_chat_unread: {
        Args: {
          p_chat_id: string
          p_last_message: string
          p_last_message_time: string
        }
        Returns: number
      }
      increment_whatsapp_chat_unread: {
        Args: {
          p_chat_id: string
          p_last_message?: string
          p_last_message_time?: string
        }
        Returns: number
      }
      normalize_br_phone: { Args: { phone: string }; Returns: string }
      soft_delete_lead: { Args: { lead_id: string }; Returns: undefined }
    }
    Enums: {
      lead_status: "lead" | "follow_up" | "sem_interesse" | "cliente"
      message_media_type: "text" | "image" | "video" | "audio" | "document"
      message_status: "sent" | "delivered" | "read"
      sender_type: "customer" | "agent"
      status_agendamento: "agendado" | "confirmado" | "realizado" | "cancelado"
      status_fatura: "negociacao" | "fechado"
      subscription_status:
        | "active"
        | "canceled"
        | "past_due"
        | "trialing"
        | "paused"
      sync_status: "success" | "error" | "in_progress"
      tipo_agendamento: "avaliacao" | "procedimento" | "revisao"
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
      lead_status: ["lead", "follow_up", "sem_interesse", "cliente"],
      message_media_type: ["text", "image", "video", "audio", "document"],
      message_status: ["sent", "delivered", "read"],
      sender_type: ["customer", "agent"],
      status_agendamento: ["agendado", "confirmado", "realizado", "cancelado"],
      status_fatura: ["negociacao", "fechado"],
      subscription_status: [
        "active",
        "canceled",
        "past_due",
        "trialing",
        "paused",
      ],
      sync_status: ["success", "error", "in_progress"],
      tipo_agendamento: ["avaliacao", "procedimento", "revisao"],
    },
  },
} as const
