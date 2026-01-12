CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_graphql";
CREATE EXTENSION IF NOT EXISTS "pg_net";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "plpgsql";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
BEGIN;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: lead_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.lead_status AS ENUM (
    'lead',
    'follow_up',
    'sem_interesse',
    'cliente'
);


--
-- Name: message_media_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.message_media_type AS ENUM (
    'text',
    'image',
    'video',
    'audio',
    'document'
);


--
-- Name: message_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.message_status AS ENUM (
    'sent',
    'delivered',
    'read'
);


--
-- Name: sender_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sender_type AS ENUM (
    'customer',
    'agent'
);


--
-- Name: status_agendamento; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.status_agendamento AS ENUM (
    'agendado',
    'confirmado',
    'realizado',
    'cancelado'
);


--
-- Name: status_fatura; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.status_fatura AS ENUM (
    'negociacao',
    'fechado'
);


--
-- Name: subscription_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.subscription_status AS ENUM (
    'active',
    'canceled',
    'past_due',
    'trialing',
    'paused'
);


--
-- Name: sync_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sync_status AS ENUM (
    'success',
    'error',
    'in_progress'
);


--
-- Name: tipo_agendamento; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tipo_agendamento AS ENUM (
    'avaliacao',
    'procedimento',
    'revisao'
);


--
-- Name: calcular_disponibilidade_horarios(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calcular_disponibilidade_horarios(p_user_id uuid, p_dias_frente integer DEFAULT 7, p_intervalo_minutos integer DEFAULT 30) RETURNS TABLE(profissional_id uuid, profissional_nome text, data date, horario time without time zone, data_hora timestamp with time zone, status text, agendamento_id uuid, cliente_nome text, procedimento_nome text)
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_profissional record;
  v_dia_semana integer;
  v_data_atual date;
  v_hora_inicio time;
  v_hora_fim time;
  v_horario_atual time;
  v_data_inicio date;
  v_data_fim date;
BEGIN
  -- Definir período automaticamente
  v_data_inicio := CURRENT_DATE;
  v_data_fim := CURRENT_DATE + (p_dias_frente || ' days')::interval;
  
  -- Loop através de cada profissional ativo do usuário
  FOR v_profissional IN 
    SELECT id, nome 
    FROM profissionais 
    WHERE user_id = p_user_id AND ativo = true
  LOOP
    -- Loop através de cada data no período
    FOR v_data_atual IN 
      SELECT generate_series(v_data_inicio, v_data_fim, '1 day'::interval)::date
    LOOP
      -- Obter dia da semana (0 = domingo, 6 = sábado)
      v_dia_semana := EXTRACT(DOW FROM v_data_atual);
      
      -- Verificar se profissional tem escala neste dia
      SELECT ep.hora_inicio, ep.hora_fim
      INTO v_hora_inicio, v_hora_fim
      FROM escalas_profissionais ep
      WHERE ep.profissional_id = v_profissional.id
        AND ep.user_id = p_user_id
        AND ep.dia_semana = v_dia_semana
        AND ep.ativo = true
      LIMIT 1;
      
      -- Se não há escala, pular este dia
      CONTINUE WHEN v_hora_inicio IS NULL;
      
      -- Verificar se profissional está ausente nesta data
      CONTINUE WHEN EXISTS (
        SELECT 1
        FROM ausencias_profissionais ap
        WHERE ap.profissional_id = v_profissional.id
          AND ap.user_id = p_user_id
          AND v_data_atual BETWEEN ap.data_inicio AND ap.data_fim
      );
      
      -- Gerar slots de tempo para este dia
      v_horario_atual := v_hora_inicio;
      
      WHILE v_horario_atual < v_hora_fim LOOP
        -- Verificar se há agendamento neste horário
        DECLARE
          v_agendamento_id uuid;
          v_cliente_nome text;
          v_procedimento_nome text;
          v_data_hora_slot timestamp with time zone;
        BEGIN
          v_data_hora_slot := v_data_atual + v_horario_atual;
          
          -- Buscar agendamento que ocupa este slot
          SELECT 
            a.id,
            l.nome,
            p.nome
          INTO 
            v_agendamento_id,
            v_cliente_nome,
            v_procedimento_nome
          FROM agendamentos a
          LEFT JOIN leads l ON l.id = a.cliente_id
          LEFT JOIN procedimentos p ON p.id = a.procedimento_id
          WHERE a.profissional_id = v_profissional.id
            AND a.user_id = p_user_id
            AND a.status IN ('agendado', 'confirmado')
            AND v_data_hora_slot >= a.data_agendamento
            AND v_data_hora_slot < a.data_agendamento + (COALESCE(p.duracao_minutos, 30) || ' minutes')::interval
          LIMIT 1;
          
          -- Retornar linha
          RETURN QUERY SELECT 
            v_profissional.id,
            v_profissional.nome,
            v_data_atual,
            v_horario_atual,
            v_data_hora_slot,
            CASE 
              WHEN v_agendamento_id IS NOT NULL THEN 'ocupado'
              ELSE 'disponivel'
            END,
            v_agendamento_id,
            v_cliente_nome,
            v_procedimento_nome;
        END;
        
        -- Avançar para próximo slot
        v_horario_atual := v_horario_atual + (p_intervalo_minutos || ' minutes')::interval;
      END LOOP;
    END LOOP;
  END LOOP;
END;
$$;


--
-- Name: calcular_disponibilidade_horarios(uuid, uuid, date, date, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calcular_disponibilidade_horarios(p_user_id uuid, p_profissional_id uuid, p_data_inicio date, p_data_fim date, p_intervalo_minutos integer DEFAULT 30) RETURNS TABLE(data date, horario time without time zone, data_hora timestamp with time zone, status text, agendamento_id uuid, cliente_nome text, procedimento_nome text)
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_dia_semana integer;
  v_data_atual date;
  v_hora_inicio time;
  v_hora_fim time;
  v_horario_atual time;
BEGIN
  -- Loop através de cada data no período
  FOR v_data_atual IN 
    SELECT generate_series(p_data_inicio, p_data_fim, '1 day'::interval)::date
  LOOP
    -- Obter dia da semana (0 = domingo, 6 = sábado)
    v_dia_semana := EXTRACT(DOW FROM v_data_atual);
    
    -- Verificar se profissional tem escala neste dia
    SELECT ep.hora_inicio, ep.hora_fim
    INTO v_hora_inicio, v_hora_fim
    FROM escalas_profissionais ep
    WHERE ep.profissional_id = p_profissional_id
      AND ep.user_id = p_user_id
      AND ep.dia_semana = v_dia_semana
      AND ep.ativo = true
    LIMIT 1;
    
    -- Se não há escala, pular este dia
    CONTINUE WHEN v_hora_inicio IS NULL;
    
    -- Verificar se profissional está ausente nesta data
    CONTINUE WHEN EXISTS (
      SELECT 1
      FROM ausencias_profissionais ap
      WHERE ap.profissional_id = p_profissional_id
        AND ap.user_id = p_user_id
        AND v_data_atual BETWEEN ap.data_inicio AND ap.data_fim
    );
    
    -- Gerar slots de tempo para este dia
    v_horario_atual := v_hora_inicio;
    
    WHILE v_horario_atual < v_hora_fim LOOP
      -- Verificar se há agendamento neste horário
      DECLARE
        v_agendamento_id uuid;
        v_cliente_nome text;
        v_procedimento_nome text;
        v_data_hora_slot timestamp with time zone;
      BEGIN
        v_data_hora_slot := v_data_atual + v_horario_atual;
        
        -- Buscar agendamento que ocupa este slot
        SELECT 
          a.id,
          l.nome,
          p.nome
        INTO 
          v_agendamento_id,
          v_cliente_nome,
          v_procedimento_nome
        FROM agendamentos a
        LEFT JOIN leads l ON l.id = a.cliente_id
        LEFT JOIN procedimentos p ON p.id = a.procedimento_id
        WHERE a.profissional_id = p_profissional_id
          AND a.user_id = p_user_id
          AND a.status IN ('agendado', 'confirmado')
          AND v_data_hora_slot >= a.data_agendamento
          AND v_data_hora_slot < a.data_agendamento + (COALESCE(p.duracao_minutos, 30) || ' minutes')::interval
        LIMIT 1;
        
        -- Retornar linha
        RETURN QUERY SELECT 
          v_data_atual,
          v_horario_atual,
          v_data_hora_slot,
          CASE 
            WHEN v_agendamento_id IS NOT NULL THEN 'ocupado'
            ELSE 'disponivel'
          END,
          v_agendamento_id,
          v_cliente_nome,
          v_procedimento_nome;
      END;
      
      -- Avançar para próximo slot
      v_horario_atual := v_horario_atual + (p_intervalo_minutos || ' minutes')::interval;
    END LOOP;
  END LOOP;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$;


--
-- Name: increment_disparos_chat_unread(uuid, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_disparos_chat_unread(p_chat_id uuid, p_last_message text, p_last_message_time timestamp with time zone) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE public.disparos_chats
  SET 
    unread_count = unread_count + 1,
    last_message = p_last_message,
    last_message_time = p_last_message_time,
    updated_at = now()
  WHERE id = p_chat_id
  RETURNING unread_count INTO new_count;
  
  RETURN new_count;
END;
$$;


--
-- Name: increment_whatsapp_chat_unread(uuid, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_whatsapp_chat_unread(p_chat_id uuid, p_last_message text DEFAULT NULL::text, p_last_message_time timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_new_unread integer;
  v_current_time timestamp with time zone;
BEGIN
  -- Get current last_message_time
  SELECT last_message_time INTO v_current_time
  FROM public.whatsapp_chats
  WHERE id = p_chat_id;

  -- Only update last_message/last_message_time if the incoming message is newer
  IF p_last_message_time IS NOT NULL AND (v_current_time IS NULL OR p_last_message_time > v_current_time) THEN
    UPDATE public.whatsapp_chats
    SET
      unread_count = COALESCE(unread_count, 0) + 1,
      last_message = COALESCE(p_last_message, last_message),
      last_message_time = p_last_message_time,
      updated_at = now()
    WHERE id = p_chat_id
    RETURNING unread_count INTO v_new_unread;
  ELSE
    -- Just increment unread, don't touch last_message
    UPDATE public.whatsapp_chats
    SET
      unread_count = COALESCE(unread_count, 0) + 1,
      updated_at = now()
    WHERE id = p_chat_id
    RETURNING unread_count INTO v_new_unread;
  END IF;

  IF v_new_unread IS NULL THEN
    RAISE EXCEPTION 'Chat não encontrado';
  END IF;

  RETURN v_new_unread;
END;
$$;


--
-- Name: log_lead_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_lead_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.historico_leads (lead_id, user_id, status_anterior, status_novo)
    VALUES (NEW.id, NEW.user_id, OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: normalize_br_phone(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_br_phone(phone text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  clean_phone text;
BEGIN
  -- Remove tudo que não é número
  clean_phone := regexp_replace(phone, '[^0-9]', '', 'g');
  
  -- Se começa com 55 e tem 13 ou 14 dígitos, verifica se há DDD duplicado
  -- Padrão: 55 + DDD (2 dígitos) + DDD duplicado + número
  -- Exemplo: 5555219975530 -> deveria ser 5521997553051
  IF length(clean_phone) = 13 AND clean_phone LIKE '55%' THEN
    -- Extrai possível DDD duplicado (posições 3-4 e 5-6)
    IF substring(clean_phone from 3 for 2) = substring(clean_phone from 5 for 2) THEN
      -- Remove o DDD duplicado
      clean_phone := '55' || substring(clean_phone from 5);
    END IF;
  END IF;
  
  -- Se o número tem 10 ou 11 dígitos (DDD + número), adiciona 55 na frente
  IF length(clean_phone) IN (10, 11) THEN
    RETURN '55' || clean_phone;
  END IF;
  
  -- Se já tem 12 ou 13 dígitos e começa com 55, retorna como está
  IF length(clean_phone) IN (12, 13) AND clean_phone LIKE '55%' THEN
    RETURN clean_phone;
  END IF;
  
  -- Caso contrário, retorna o número limpo
  RETURN clean_phone;
END;
$$;


--
-- Name: soft_delete_lead(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.soft_delete_lead(lead_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Verificar se o lead pertence ao usuário atual
  IF NOT EXISTS (
    SELECT 1 FROM leads 
    WHERE id = lead_id 
    AND user_id = auth.uid()
    AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Lead não encontrado ou sem permissão';
  END IF;
  
  -- Fazer soft delete
  UPDATE leads
  SET deleted_at = now()
  WHERE id = lead_id;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: admin_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    full_name text,
    last_login timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: agendamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agendamentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    procedimento_id uuid,
    profissional_id uuid,
    tipo text DEFAULT 'avaliacao'::text NOT NULL,
    status public.status_agendamento DEFAULT 'agendado'::public.status_agendamento NOT NULL,
    data_agendamento timestamp with time zone NOT NULL,
    observacoes text,
    data_follow_up date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    numero_reagendamentos integer DEFAULT 0 NOT NULL,
    aviso_dia_anterior boolean DEFAULT false,
    aviso_dia boolean DEFAULT false,
    aviso_3dias boolean DEFAULT false,
    origem_agendamento text DEFAULT 'Manual'::text,
    origem_instancia_nome text
);


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    nome text NOT NULL,
    telefone text NOT NULL,
    email text,
    procedimento_id uuid,
    procedimento_nome text NOT NULL,
    profissional_id uuid,
    status public.lead_status DEFAULT 'lead'::public.lead_status,
    data_contato date DEFAULT CURRENT_DATE,
    data_agendamento timestamp with time zone,
    data_comparecimento timestamp with time zone,
    valor_tratamento numeric(10,2),
    observacoes text,
    avaliacao integer,
    origem text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    origem_lead boolean DEFAULT false,
    origem_tipo text DEFAULT 'Lead'::text,
    deleted_at timestamp with time zone,
    instancia_nome text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_content text,
    utm_term text,
    fbclid text,
    gclid text,
    genero text,
    data_nascimento date,
    cidade text,
    estado text,
    cep text,
    endereco text,
    fb_ad_id text,
    fb_campaign_name text,
    fb_adset_name text,
    fb_ad_name text,
    ad_thumbnail_url text,
    respondeu boolean DEFAULT false,
    fb_adset_id text,
    fb_campaign_id text,
    CONSTRAINT leads_avaliacao_check CHECK (((avaliacao >= 1) AND (avaliacao <= 5)))
);


--
-- Name: procedimentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.procedimentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    nome text NOT NULL,
    categoria text,
    valor_medio numeric(10,2),
    duracao_minutos integer,
    descricao text,
    ativo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tempo_atendimento_minutos integer DEFAULT 60
);


--
-- Name: profissionais; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profissionais (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    nome text NOT NULL,
    especialidade text,
    telefone text,
    email text,
    ativo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: uazapi_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uazapi_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    api_key text NOT NULL,
    base_url text NOT NULL,
    instance_name text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_sync_at timestamp with time zone,
    whatsapp_instancia_id uuid
);


--
-- Name: agendamentos_completos; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.agendamentos_completos AS
 SELECT a.id,
    a.data_agendamento,
    a.status,
    a.tipo,
    a.observacoes,
    a.numero_reagendamentos,
    a.aviso_3dias,
    a.aviso_dia_anterior,
    a.aviso_dia,
    a.created_at,
    a.updated_at,
    a.user_id,
    a.cliente_id,
    l.nome AS cliente_nome,
    l.telefone AS cliente_telefone,
    l.email AS cliente_email,
    l.status AS cliente_status,
    a.procedimento_id,
    proc.nome AS procedimento_nome,
    proc.categoria AS procedimento_categoria,
    proc.duracao_minutos AS procedimento_duracao,
    a.profissional_id,
    prof.nome AS profissional_nome,
    prof.especialidade AS profissional_especialidade,
    uaz.api_key AS uazapi_api_key,
    uaz.base_url AS uazapi_base_url,
    uaz.instance_name AS uazapi_instance_name,
    uaz.is_active AS uazapi_is_active
   FROM ((((public.agendamentos a
     LEFT JOIN public.leads l ON ((a.cliente_id = l.id)))
     LEFT JOIN public.profissionais prof ON ((a.profissional_id = prof.id)))
     LEFT JOIN public.procedimentos proc ON ((a.procedimento_id = proc.id)))
     LEFT JOIN public.uazapi_config uaz ON ((a.user_id = uaz.user_id)));


--
-- Name: agendamentos_excluidos_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agendamentos_excluidos_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    cliente_nome text NOT NULL,
    cliente_telefone text NOT NULL,
    procedimento_id uuid,
    procedimento_nome text,
    profissional_id uuid,
    profissional_nome text,
    tipo text NOT NULL,
    status text NOT NULL,
    data_agendamento timestamp with time zone NOT NULL,
    observacoes text,
    motivo_exclusao text,
    excluido_em timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_ads_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_ads_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    account_id text NOT NULL,
    date_start date NOT NULL,
    date_end date NOT NULL,
    report jsonb NOT NULL,
    campaigns_count integer DEFAULT 0,
    adsets_count integer DEFAULT 0,
    ads_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: apify_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.apify_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    api_key text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: assistente_contexto; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assistente_contexto (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    session_id text NOT NULL,
    phone text NOT NULL,
    procedimento_id uuid,
    profissional_id uuid,
    data_hora timestamp with time zone,
    active boolean DEFAULT true NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audios_predefinidos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audios_predefinidos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    titulo text NOT NULL,
    audio_url text NOT NULL,
    duracao_segundos integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ordem integer DEFAULT 0,
    bloco_id uuid
);


--
-- Name: ausencias_profissionais; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ausencias_profissionais (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    profissional_id uuid NOT NULL,
    data_inicio date NOT NULL,
    data_fim date NOT NULL,
    motivo text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT valid_date_range CHECK ((data_fim >= data_inicio))
);


--
-- Name: avisos_agendamento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.avisos_agendamento (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    nome character varying(255) NOT NULL,
    mensagem text NOT NULL,
    dias_antes integer DEFAULT 1 NOT NULL,
    horario_envio time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    intervalo_min integer DEFAULT 15 NOT NULL,
    intervalo_max integer DEFAULT 33 NOT NULL
);


--
-- Name: avisos_enviados_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.avisos_enviados_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    aviso_id uuid,
    agendamento_id uuid,
    cliente_id uuid,
    cliente_nome text NOT NULL,
    cliente_telefone text NOT NULL,
    aviso_nome text NOT NULL,
    dias_antes integer NOT NULL,
    mensagem_enviada text NOT NULL,
    status text DEFAULT 'enviado'::text NOT NULL,
    erro text,
    enviado_em timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: blocos_audios_predefinidos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blocos_audios_predefinidos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    titulo text NOT NULL,
    ordem integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: blocos_mensagens_predefinidas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blocos_mensagens_predefinidas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    titulo text NOT NULL,
    ordem integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: categorias_despesas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categorias_despesas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    nome text NOT NULL,
    descricao text,
    cor text DEFAULT '#3b82f6'::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: despesas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.despesas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    categoria_id uuid,
    descricao text NOT NULL,
    valor numeric(10,2) NOT NULL,
    data_despesa date DEFAULT CURRENT_DATE,
    recorrente boolean DEFAULT false,
    observacoes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: disparos_campanha_contatos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.disparos_campanha_contatos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campanha_id uuid NOT NULL,
    numero text NOT NULL,
    nome text,
    status text DEFAULT 'pending'::text NOT NULL,
    enviado_em timestamp with time zone,
    erro text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: disparos_campanha_variacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.disparos_campanha_variacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campanha_id uuid NOT NULL,
    tipo_mensagem text DEFAULT 'text'::text NOT NULL,
    mensagem text,
    media_base64 text,
    ordem integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    bloco integer DEFAULT 0 NOT NULL
);


--
-- Name: disparos_campanhas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.disparos_campanhas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    nome text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    tipo_mensagem text NOT NULL,
    mensagem text,
    media_url text,
    media_base64 text,
    delay_min integer DEFAULT 5 NOT NULL,
    delay_max integer DEFAULT 15 NOT NULL,
    total_contatos integer DEFAULT 0 NOT NULL,
    enviados integer DEFAULT 0 NOT NULL,
    falhas integer DEFAULT 0 NOT NULL,
    campaign_id_uazapi text,
    iniciado_em timestamp with time zone,
    finalizado_em timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    instancias_ids uuid[] DEFAULT '{}'::uuid[],
    delay_bloco_min integer DEFAULT 3 NOT NULL,
    delay_bloco_max integer DEFAULT 8 NOT NULL,
    last_instance_id uuid,
    instance_rotation_state jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: disparos_chat_kanban; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.disparos_chat_kanban (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    chat_id uuid NOT NULL,
    column_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: disparos_chats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.disparos_chats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    chat_id text NOT NULL,
    contact_name text NOT NULL,
    contact_number text NOT NULL,
    normalized_number text NOT NULL,
    profile_pic_url text,
    last_message text,
    last_message_time timestamp with time zone,
    unread_count integer DEFAULT 0,
    provider_unread_count integer DEFAULT 0,
    provider_unread_baseline integer DEFAULT 0,
    last_read_at timestamp with time zone,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    instancia_id uuid,
    instancia_nome text
);


--
-- Name: disparos_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.disparos_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    base_url text NOT NULL,
    api_key text NOT NULL,
    instance_name text,
    is_active boolean DEFAULT true,
    last_sync_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: disparos_instancias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.disparos_instancias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    nome character varying(100) NOT NULL,
    base_url character varying(500) NOT NULL,
    api_key character varying(500) NOT NULL,
    is_active boolean DEFAULT true,
    instance_name character varying(100),
    last_sync_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_webhook_at timestamp with time zone
);


--
-- Name: disparos_kanban_columns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.disparos_kanban_columns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    nome text NOT NULL,
    cor text DEFAULT '#3b82f6'::text NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: disparos_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.disparos_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chat_id uuid NOT NULL,
    message_id text NOT NULL,
    content text NOT NULL,
    sender_type public.sender_type NOT NULL,
    media_type public.message_media_type,
    media_url text,
    status public.message_status,
    deleted boolean DEFAULT false,
    admin_id uuid,
    "timestamp" timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    utm_source text,
    utm_campaign text,
    utm_medium text,
    utm_content text,
    utm_term text,
    fbclid text,
    ad_thumbnail_url text,
    fb_ad_id text,
    fb_campaign_name text,
    fb_adset_name text,
    fb_ad_name text
);


--
-- Name: disparos_template_variacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.disparos_template_variacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    bloco integer DEFAULT 0 NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    tipo_mensagem text DEFAULT 'text'::text NOT NULL,
    mensagem text,
    media_base64 text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: disparos_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.disparos_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    nome character varying(255) NOT NULL,
    tipo_mensagem character varying(50) DEFAULT 'text'::character varying NOT NULL,
    mensagem text,
    media_base64 text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    delay_bloco_min integer DEFAULT 3 NOT NULL,
    delay_bloco_max integer DEFAULT 8 NOT NULL
);


--
-- Name: escalas_profissionais; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.escalas_profissionais (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    profissional_id uuid NOT NULL,
    dia_semana integer NOT NULL,
    hora_inicio time without time zone NOT NULL,
    hora_fim time without time zone NOT NULL,
    ativo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT escalas_profissionais_dia_semana_check CHECK (((dia_semana >= 0) AND (dia_semana <= 6))),
    CONSTRAINT valid_time_range CHECK ((hora_fim > hora_inicio))
);


--
-- Name: disponibilidade_horarios; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.disponibilidade_horarios WITH (security_invoker='true') AS
 WITH RECURSIVE hora_brasilia AS (
         SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'::text) AS agora
        ), datas AS (
         SELECT (CURRENT_DATE + ((n.n || ' days'::text))::interval) AS data
           FROM generate_series(0, 6) n(n)
        ), horarios_base AS (
         SELECT (((n.n || ' minutes'::text))::interval)::time without time zone AS horario
           FROM generate_series(0, 1410, 30) n(n)
        ), slots AS (
         SELECT p.id AS profissional_id,
            p.nome AS profissional_nome,
            p.user_id,
            d.data,
            h.horario,
            (d.data + (h.horario)::interval) AS data_hora
           FROM (((public.profissionais p
             CROSS JOIN datas d)
             CROSS JOIN horarios_base h)
             JOIN public.escalas_profissionais e ON (((e.profissional_id = p.id) AND ((e.dia_semana)::numeric = EXTRACT(dow FROM d.data)) AND (e.ativo = true) AND (h.horario >= e.hora_inicio) AND (h.horario < e.hora_fim))))
          WHERE (p.ativo = true)
        ), slots_sem_ausencia AS (
         SELECT s_1.profissional_id,
            s_1.profissional_nome,
            s_1.user_id,
            s_1.data,
            s_1.horario,
            s_1.data_hora
           FROM slots s_1
          WHERE (NOT (EXISTS ( SELECT 1
                   FROM public.ausencias_profissionais ap
                  WHERE ((ap.profissional_id = s_1.profissional_id) AND (ap.user_id = s_1.user_id) AND ((s_1.data >= ap.data_inicio) AND (s_1.data <= ap.data_fim))))))
        ), slots_futuros AS (
         SELECT s_1.profissional_id,
            s_1.profissional_nome,
            s_1.user_id,
            s_1.data,
            s_1.horario,
            s_1.data_hora
           FROM (slots_sem_ausencia s_1
             CROSS JOIN hora_brasilia hb)
          WHERE (s_1.data_hora >= hb.agora)
        ), slots_com_agendamentos AS (
         SELECT s_1.profissional_id,
            s_1.profissional_nome,
            s_1.user_id,
            s_1.data,
            s_1.horario,
            s_1.data_hora,
            a.id AS agendamento_id,
            l.nome AS cliente_nome
           FROM (((slots_futuros s_1
             LEFT JOIN public.agendamentos a ON (((a.profissional_id = s_1.profissional_id) AND (a.user_id = s_1.user_id) AND (a.status = ANY (ARRAY['agendado'::public.status_agendamento, 'confirmado'::public.status_agendamento])) AND (s_1.data_hora >= a.data_agendamento))))
             LEFT JOIN public.procedimentos p ON ((p.id = a.procedimento_id)))
             LEFT JOIN public.leads l ON ((l.id = a.cliente_id)))
          WHERE (s_1.data_hora < COALESCE((a.data_agendamento + ((COALESCE(p.duracao_minutos, 30) || ' minutes'::text))::interval), ((s_1.data_hora + '00:00:01'::interval))::timestamp with time zone))
        )
 SELECT user_id,
    profissional_id,
    profissional_nome,
    data,
    horario,
    data_hora,
        CASE
            WHEN (agendamento_id IS NOT NULL) THEN 'ocupado'::text
            ELSE 'disponivel'::text
        END AS status,
    agendamento_id,
    cliente_nome
   FROM slots_com_agendamentos s;


--
-- Name: facebook_ad_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.facebook_ad_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    ad_account_id text NOT NULL,
    account_name text,
    is_prepay_account boolean,
    last_balance numeric,
    last_sync_at timestamp with time zone,
    status text DEFAULT 'connected'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    account_type text
);


--
-- Name: facebook_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.facebook_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    access_token text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fatura_agendamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fatura_agendamentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fatura_id uuid NOT NULL,
    agendamento_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fatura_upsells; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fatura_upsells (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fatura_id uuid NOT NULL,
    tipo text NOT NULL,
    produto_id uuid,
    procedimento_id uuid,
    descricao text NOT NULL,
    valor numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fatura_upsells_tipo_check CHECK ((tipo = ANY (ARRAY['produto'::text, 'procedimento'::text])))
);


--
-- Name: faturas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.faturas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    procedimento_id uuid,
    profissional_id uuid,
    valor numeric NOT NULL,
    status public.status_fatura DEFAULT 'negociacao'::public.status_fatura NOT NULL,
    observacoes text,
    data_follow_up date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    forma_pagamento text DEFAULT 'a_vista'::text,
    valor_entrada numeric DEFAULT 0,
    numero_parcelas integer DEFAULT 1,
    valor_parcela numeric DEFAULT 0,
    taxa_parcelamento numeric DEFAULT 0,
    juros_pago_por text DEFAULT 'cliente'::text,
    meio_pagamento text,
    pixel_status text DEFAULT 'pendente'::text,
    pixel_form_sent_at timestamp with time zone,
    pixel_data_completed_at timestamp with time zone,
    pixel_event_sent_at timestamp with time zone,
    data_fatura date DEFAULT CURRENT_DATE
);


--
-- Name: faturas_excluidas_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.faturas_excluidas_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    cliente_nome text NOT NULL,
    cliente_telefone text NOT NULL,
    procedimento_id uuid,
    procedimento_nome text,
    profissional_id uuid,
    profissional_nome text,
    valor numeric NOT NULL,
    status text NOT NULL,
    observacoes text,
    meio_pagamento text,
    forma_pagamento text,
    motivo_exclusao text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    excluido_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: google_ads_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_ads_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    customer_id text NOT NULL,
    account_name text,
    currency text DEFAULT 'BRL'::text,
    last_balance numeric,
    last_spend numeric,
    last_sync_at timestamp with time zone,
    status text DEFAULT 'connected'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: google_ads_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_ads_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    developer_token text NOT NULL,
    client_id text NOT NULL,
    client_secret text NOT NULL,
    refresh_token text NOT NULL,
    access_token text,
    token_expires_at timestamp with time zone,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: historico_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.historico_leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    user_id uuid NOT NULL,
    status_anterior public.lead_status,
    status_novo public.lead_status NOT NULL,
    observacao text,
    data_alteracao timestamp with time zone DEFAULT now()
);


--
-- Name: instagram_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    app_id text NOT NULL,
    app_secret text NOT NULL,
    page_access_token text NOT NULL,
    instagram_account_id text,
    webhook_verify_token text DEFAULT encode(extensions.gen_random_bytes(16), 'hex'::text) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ice_breakers jsonb DEFAULT '[]'::jsonb,
    verificar_seguidor boolean DEFAULT false,
    mensagem_pedir_seguir text,
    form_base_url text
);


--
-- Name: instagram_fluxos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_fluxos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    nome text NOT NULL,
    descricao text,
    etapas jsonb DEFAULT '[]'::jsonb NOT NULL,
    ativo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    nodes jsonb DEFAULT '[]'::jsonb,
    edges jsonb DEFAULT '[]'::jsonb
);


--
-- Name: instagram_formularios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_formularios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    nome text NOT NULL,
    descricao text,
    titulo_pagina text DEFAULT 'Preencha seus dados'::text NOT NULL,
    subtitulo_pagina text,
    texto_botao text DEFAULT 'Enviar'::text NOT NULL,
    mensagem_sucesso text DEFAULT 'Obrigado! Seus dados foram enviados com sucesso.'::text NOT NULL,
    campos jsonb DEFAULT '["nome", "telefone", "email"]'::jsonb NOT NULL,
    cor_primaria text DEFAULT '#8B5CF6'::text,
    imagem_url text,
    ativo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    botao_sucesso_texto text,
    botao_sucesso_url text
);


--
-- Name: instagram_formularios_respostas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_formularios_respostas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    formulario_id uuid NOT NULL,
    user_id uuid NOT NULL,
    instagram_user_id text,
    tracking_id text,
    nome text,
    telefone text,
    email text,
    dados_extras jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instagram_gatilhos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_gatilhos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    nome text NOT NULL,
    palavras_chave text[] DEFAULT '{}'::text[] NOT NULL,
    tipo text DEFAULT 'dm'::text NOT NULL,
    resposta_texto text,
    fluxo_id uuid,
    ativo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    resposta_midia_url text,
    resposta_midia_tipo text,
    resposta_botoes jsonb DEFAULT '[]'::jsonb,
    resposta_link_url text,
    resposta_link_texto text,
    verificar_seguidor boolean DEFAULT false,
    mensagem_pedir_seguir text,
    formulario_id uuid,
    responder_comentario boolean DEFAULT false,
    resposta_comentario_texto text,
    ativo_em_dm boolean DEFAULT false,
    ativo_em_comentario boolean DEFAULT false,
    mensagem_formulario text,
    botao_formulario_texto text DEFAULT 'Preencher Formulário'::text,
    titulo_botoes text,
    botao_liberar_texto text DEFAULT 'Já sigo! Liberar material'::text,
    instagram_seguir text,
    CONSTRAINT instagram_gatilhos_resposta_midia_tipo_check CHECK ((resposta_midia_tipo = ANY (ARRAY['image'::text, 'video'::text, 'audio'::text, 'file'::text])))
);


--
-- Name: instagram_interacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_interacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    instagram_user_id text NOT NULL,
    primeira_interacao_em timestamp with time zone DEFAULT now() NOT NULL,
    ultima_interacao_em timestamp with time zone DEFAULT now() NOT NULL,
    total_mensagens integer DEFAULT 1
);


--
-- Name: instagram_mensagens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_mensagens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    instagram_user_id text NOT NULL,
    instagram_username text,
    tipo text NOT NULL,
    conteudo text,
    media_url text,
    post_id text,
    gatilho_id uuid,
    fluxo_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lead_status_custom; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_status_custom (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    nome text NOT NULL,
    cor text DEFAULT '#3b82f6'::text,
    ordem integer DEFAULT 0,
    ativo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: listas_extrator; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listas_extrator (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    nome text NOT NULL,
    dados jsonb DEFAULT '[]'::jsonb NOT NULL,
    total_contatos integer DEFAULT 0 NOT NULL,
    busca_original text,
    localizacao text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    filtros_usados jsonb DEFAULT '{}'::jsonb
);


--
-- Name: mensagens_predefinidas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mensagens_predefinidas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    titulo text NOT NULL,
    conteudo text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ordem integer DEFAULT 0,
    bloco_id uuid
);


--
-- Name: meta_conversion_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_conversion_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    lead_id uuid,
    fatura_id uuid,
    agendamento_id uuid,
    event_name text NOT NULL,
    event_id text NOT NULL,
    event_time timestamp with time zone DEFAULT now() NOT NULL,
    value numeric,
    currency text DEFAULT 'BRL'::text,
    utm_source text,
    utm_campaign text,
    fbclid text,
    status text DEFAULT 'pending'::text,
    response jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    customer_data_sent jsonb
);


--
-- Name: meta_pixel_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_pixel_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    pixel_id text NOT NULL,
    access_token text NOT NULL,
    test_event_code text,
    eventos_ativos jsonb DEFAULT '{"lead": true, "purchase": true, "initiate_checkout": true, "complete_registration": true}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    mensagem_formulario text DEFAULT 'Olá! Para finalizar seu cadastro, precisamos de algumas informações adicionais. Por favor, preencha o formulário abaixo:'::text
);


--
-- Name: metricas_preferencias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.metricas_preferencias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    presets jsonb DEFAULT '[]'::jsonb,
    visible_cards jsonb,
    selected_preset_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    funnel_column_order jsonb
);


--
-- Name: openai_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.openai_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    api_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: personalizacao_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.personalizacao_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    cor_primaria text,
    cor_secundaria text,
    cor_background text,
    cor_sidebar text,
    logo_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: procedimento_profissional; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.procedimento_profissional (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    procedimento_id uuid NOT NULL,
    profissional_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: produtos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.produtos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    nome text NOT NULL,
    descricao text,
    valor numeric DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text,
    email text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: profissionais_ausencias; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.profissionais_ausencias WITH (security_invoker='true') AS
 SELECT ap.id,
    ap.user_id,
    ap.profissional_id,
    prof.nome AS profissional_nome,
    ap.data_inicio,
    ap.data_fim,
    ap.motivo,
    ap.created_at
   FROM (public.ausencias_profissionais ap
     JOIN public.profissionais prof ON ((prof.id = ap.profissional_id)));


--
-- Name: profissionais_escalas; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.profissionais_escalas WITH (security_invoker='true') AS
 SELECT ep.id,
    ep.user_id,
    ep.profissional_id,
    prof.nome AS profissional_nome,
    ep.dia_semana,
    ep.hora_inicio,
    ep.hora_fim,
    ep.ativo,
    ep.created_at
   FROM (public.escalas_profissionais ep
     JOIN public.profissionais prof ON ((prof.id = ep.profissional_id)));


--
-- Name: profissionais_procedimentos; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.profissionais_procedimentos WITH (security_invoker='true') AS
 SELECT pp.id,
    pp.user_id,
    pp.procedimento_id,
    pp.profissional_id,
    proc.nome AS procedimento_nome,
    prof.nome AS profissional_nome,
    pp.created_at
   FROM ((public.procedimento_profissional pp
     JOIN public.profissionais prof ON ((prof.id = pp.profissional_id)))
     JOIN public.procedimentos proc ON ((proc.id = pp.procedimento_id)));


--
-- Name: stripe_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stripe_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    stripe_webhook_secret text,
    last_webhook_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: subscription_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_email text NOT NULL,
    user_id uuid,
    action text NOT NULL,
    details jsonb,
    ip_address text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: tipo_agendamento_custom; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tipo_agendamento_custom (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    nome text NOT NULL,
    cor text DEFAULT '#10b981'::text,
    ordem integer DEFAULT 0,
    ativo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    stripe_customer_id text,
    stripe_subscription_id text,
    plan_name text DEFAULT 'free'::text NOT NULL,
    status public.subscription_status DEFAULT 'trialing'::public.subscription_status,
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    cancel_at_period_end boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: webhook_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event_type text NOT NULL,
    level text DEFAULT 'info'::text NOT NULL,
    event_message text NOT NULL,
    payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: webhook_message_dedup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_message_dedup (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    instancia_id uuid,
    phone_last8 text NOT NULL,
    message_timestamp bigint NOT NULL,
    message_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: whatsapp_chat_kanban; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_chat_kanban (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    chat_id uuid NOT NULL,
    column_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: whatsapp_chat_labels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_chat_labels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chat_id uuid NOT NULL,
    label_id text NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: whatsapp_chats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_chats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    chat_id text NOT NULL,
    contact_name text NOT NULL,
    contact_number text NOT NULL,
    normalized_number text NOT NULL,
    last_message text,
    last_message_time timestamp with time zone,
    unread_count integer DEFAULT 0 NOT NULL,
    profile_pic_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    last_read_at timestamp with time zone DEFAULT now(),
    provider_unread_count integer DEFAULT 0 NOT NULL,
    provider_unread_baseline integer DEFAULT 0 NOT NULL
);


--
-- Name: whatsapp_kanban_columns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_kanban_columns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    nome text NOT NULL,
    cor text DEFAULT '#3b82f6'::text NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: whatsapp_labels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_labels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    label_id text NOT NULL,
    label_name text NOT NULL,
    label_color text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: whatsapp_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chat_id uuid NOT NULL,
    message_id text NOT NULL,
    sender_type public.sender_type NOT NULL,
    admin_id uuid,
    content text NOT NULL,
    media_type public.message_media_type DEFAULT 'text'::public.message_media_type,
    media_url text,
    "timestamp" timestamp with time zone NOT NULL,
    status public.message_status,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted boolean DEFAULT false,
    utm_source text,
    utm_campaign text,
    utm_medium text,
    utm_content text,
    utm_term text,
    fbclid text,
    ad_thumbnail_url text,
    fb_ad_id text,
    fb_campaign_name text,
    fb_adset_name text,
    fb_ad_name text
);

ALTER TABLE ONLY public.whatsapp_messages REPLICA IDENTITY FULL;


--
-- Name: whatsapp_sync_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_sync_status (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    last_sync_at timestamp with time zone NOT NULL,
    sync_status public.sync_status NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_users admin_users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_email_key UNIQUE (email);


--
-- Name: admin_users admin_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_pkey PRIMARY KEY (id);


--
-- Name: agendamentos_excluidos_log agendamentos_excluidos_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agendamentos_excluidos_log
    ADD CONSTRAINT agendamentos_excluidos_log_pkey PRIMARY KEY (id);


--
-- Name: agendamentos agendamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agendamentos
    ADD CONSTRAINT agendamentos_pkey PRIMARY KEY (id);


--
-- Name: ai_ads_reports ai_ads_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_ads_reports
    ADD CONSTRAINT ai_ads_reports_pkey PRIMARY KEY (id);


--
-- Name: apify_config apify_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apify_config
    ADD CONSTRAINT apify_config_pkey PRIMARY KEY (id);


--
-- Name: apify_config apify_config_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apify_config
    ADD CONSTRAINT apify_config_user_id_key UNIQUE (user_id);


--
-- Name: assistente_contexto assistente_contexto_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistente_contexto
    ADD CONSTRAINT assistente_contexto_pkey PRIMARY KEY (id);


--
-- Name: audios_predefinidos audios_predefinidos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audios_predefinidos
    ADD CONSTRAINT audios_predefinidos_pkey PRIMARY KEY (id);


--
-- Name: ausencias_profissionais ausencias_profissionais_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ausencias_profissionais
    ADD CONSTRAINT ausencias_profissionais_pkey PRIMARY KEY (id);


--
-- Name: avisos_agendamento avisos_agendamento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avisos_agendamento
    ADD CONSTRAINT avisos_agendamento_pkey PRIMARY KEY (id);


--
-- Name: avisos_enviados_log avisos_enviados_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avisos_enviados_log
    ADD CONSTRAINT avisos_enviados_log_pkey PRIMARY KEY (id);


--
-- Name: blocos_audios_predefinidos blocos_audios_predefinidos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocos_audios_predefinidos
    ADD CONSTRAINT blocos_audios_predefinidos_pkey PRIMARY KEY (id);


--
-- Name: blocos_mensagens_predefinidas blocos_mensagens_predefinidas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocos_mensagens_predefinidas
    ADD CONSTRAINT blocos_mensagens_predefinidas_pkey PRIMARY KEY (id);


--
-- Name: categorias_despesas categorias_despesas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias_despesas
    ADD CONSTRAINT categorias_despesas_pkey PRIMARY KEY (id);


--
-- Name: despesas despesas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despesas
    ADD CONSTRAINT despesas_pkey PRIMARY KEY (id);


--
-- Name: disparos_campanha_contatos disparos_campanha_contatos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disparos_campanha_contatos
    ADD CONSTRAINT disparos_campanha_contatos_pkey PRIMARY KEY (id);


--
-- Name: disparos_campanha_variacoes disparos_campanha_variacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disparos_campanha_variacoes
    ADD CONSTRAINT disparos_campanha_variacoes_pkey PRIMARY KEY (id);


--
-- Name: disparos_campanhas disparos_campanhas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disparos_campanhas
    ADD CONSTRAINT disparos_campanhas_pkey PRIMARY KEY (id);


--
-- Name: disparos_chat_kanban disparos_chat_kanban_chat_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disparos_chat_kanban
    ADD CONSTRAINT disparos_chat_kanban_chat_id_key UNIQUE (chat_id);


--
-- Name: disparos_chat_kanban disparos_chat_kanban_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disparos_chat_kanban
    ADD CONSTRAINT disparos_chat_kanban_pkey PRIMARY KEY (id);


--
-- Name: disparos_chats disparos_chats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disparos_chats
    ADD CONSTRAINT disparos_chats_pkey PRIMARY KEY (id);


--
-- Name: disparos_config disparos_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disparos_config
    ADD CONSTRAINT disparos_config_pkey PRIMARY KEY (id);


--
-- Name: disparos_config disparos_config_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disparos_config
    ADD CONSTRAINT disparos_config_user_id_key UNIQUE (user_id);


--
-- Name: disparos_instancias disparos_instancias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disparos_instancias
    ADD CONSTRAINT disparos_instancias_pkey PRIMARY KEY (id);


--
-- Name: disparos_kanban_columns disparos_kanban_columns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disparos_kanban_columns
    ADD CONSTRAINT disparos_kanban_columns_pkey PRIMARY KEY (id);


--
-- Name: disparos_messages disparos_messages_chat_id_message_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disparos_messages
    ADD CONSTRAINT disparos_messages_chat_id_message_id_key UNIQUE (chat_id, message_id);


--
-- Name: disparos_messages disparos_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disparos_messages
    ADD CONSTRAINT disparos_messages_pkey PRIMARY KEY (id);


--
-- Name: disparos_template_variacoes disparos_template_variacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disparos_template_variacoes
    ADD CONSTRAINT disparos_template_variacoes_pkey PRIMARY KEY (id);


--
-- Name: disparos_templates disparos_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disparos_templates
    ADD CONSTRAINT disparos_templates_pkey PRIMARY KEY (id);


--
-- Name: escalas_profissionais escalas_profissionais_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escalas_profissionais
    ADD CONSTRAINT escalas_profissionais_pkey PRIMARY KEY (id);


--
-- Name: facebook_ad_accounts facebook_ad_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facebook_ad_accounts
    ADD CONSTRAINT facebook_ad_accounts_pkey PRIMARY KEY (id);


--
-- Name: facebook_config facebook_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facebook_config
    ADD CONSTRAINT facebook_config_pkey PRIMARY KEY (id);


--
-- Name: facebook_config facebook_config_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facebook_config
    ADD CONSTRAINT facebook_config_user_id_key UNIQUE (user_id);


--
-- Name: fatura_agendamentos fatura_agendamentos_fatura_id_agendamento_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fatura_agendamentos
    ADD CONSTRAINT fatura_agendamentos_fatura_id_agendamento_id_key UNIQUE (fatura_id, agendamento_id);


--
-- Name: fatura_agendamentos fatura_agendamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fatura_agendamentos
    ADD CONSTRAINT fatura_agendamentos_pkey PRIMARY KEY (id);


--
-- Name: fatura_upsells fatura_upsells_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fatura_upsells
    ADD CONSTRAINT fatura_upsells_pkey PRIMARY KEY (id);


--
-- Name: faturas_excluidas_log faturas_excluidas_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faturas_excluidas_log
    ADD CONSTRAINT faturas_excluidas_log_pkey PRIMARY KEY (id);


--
-- Name: faturas faturas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faturas
    ADD CONSTRAINT faturas_pkey PRIMARY KEY (id);


--
-- Name: google_ads_accounts google_ads_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_ads_accounts
    ADD CONSTRAINT google_ads_accounts_pkey PRIMARY KEY (id);


--
-- Name: google_ads_config google_ads_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_ads_config
    ADD CONSTRAINT google_ads_config_pkey PRIMARY KEY (id);


--
-- Name: historico_leads historico_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historico_leads
    ADD CONSTRAINT historico_leads_pkey PRIMARY KEY (id);


--
-- Name: instagram_config instagram_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_config
    ADD CONSTRAINT instagram_config_pkey PRIMARY KEY (id);


--
-- Name: instagram_config instagram_config_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_config
    ADD CONSTRAINT instagram_config_user_id_key UNIQUE (user_id);


--
-- Name: instagram_fluxos instagram_fluxos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_fluxos
    ADD CONSTRAINT instagram_fluxos_pkey PRIMARY KEY (id);


--
-- Name: instagram_formularios instagram_formularios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_formularios
    ADD CONSTRAINT instagram_formularios_pkey PRIMARY KEY (id);


--
-- Name: instagram_formularios_respostas instagram_formularios_respostas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_formularios_respostas
    ADD CONSTRAINT instagram_formularios_respostas_pkey PRIMARY KEY (id);


--
-- Name: instagram_gatilhos instagram_gatilhos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_gatilhos
    ADD CONSTRAINT instagram_gatilhos_pkey PRIMARY KEY (id);


--
-- Name: instagram_interacoes instagram_interacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_interacoes
    ADD CONSTRAINT instagram_interacoes_pkey PRIMARY KEY (id);


--
-- Name: instagram_interacoes instagram_interacoes_user_id_instagram_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_interacoes
    ADD CONSTRAINT instagram_interacoes_user_id_instagram_user_id_key UNIQUE (user_id, instagram_user_id);


--
-- Name: instagram_mensagens instagram_mensagens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_mensagens
    ADD CONSTRAINT instagram_mensagens_pkey PRIMARY KEY (id);


--
-- Name: lead_status_custom lead_status_custom_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_status_custom
    ADD CONSTRAINT lead_status_custom_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: listas_extrator listas_extrator_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listas_extrator
    ADD CONSTRAINT listas_extrator_pkey PRIMARY KEY (id);


--
-- Name: mensagens_predefinidas mensagens_predefinidas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagens_predefinidas
    ADD CONSTRAINT mensagens_predefinidas_pkey PRIMARY KEY (id);


--
-- Name: meta_conversion_events meta_conversion_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_conversion_events
    ADD CONSTRAINT meta_conversion_events_pkey PRIMARY KEY (id);


--
-- Name: meta_pixel_config meta_pixel_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_pixel_config
    ADD CONSTRAINT meta_pixel_config_pkey PRIMARY KEY (id);


--
-- Name: meta_pixel_config meta_pixel_config_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_pixel_config
    ADD CONSTRAINT meta_pixel_config_user_id_unique UNIQUE (user_id);


--
-- Name: metricas_preferencias metricas_preferencias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metricas_preferencias
    ADD CONSTRAINT metricas_preferencias_pkey PRIMARY KEY (id);


--
-- Name: metricas_preferencias metricas_preferencias_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metricas_preferencias
    ADD CONSTRAINT metricas_preferencias_user_id_key UNIQUE (user_id);


--
-- Name: openai_config openai_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.openai_config
    ADD CONSTRAINT openai_config_pkey PRIMARY KEY (id);


--
-- Name: openai_config openai_config_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.openai_config
    ADD CONSTRAINT openai_config_user_id_key UNIQUE (user_id);


--
-- Name: personalizacao_config personalizacao_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personalizacao_config
    ADD CONSTRAINT personalizacao_config_pkey PRIMARY KEY (id);


--
-- Name: personalizacao_config personalizacao_config_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personalizacao_config
    ADD CONSTRAINT personalizacao_config_user_id_key UNIQUE (user_id);


--
-- Name: procedimento_profissional procedimento_profissional_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procedimento_profissional
    ADD CONSTRAINT procedimento_profissional_pkey PRIMARY KEY (id);


--
-- Name: procedimento_profissional procedimento_profissional_procedimento_id_profissional_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procedimento_profissional
    ADD CONSTRAINT procedimento_profissional_procedimento_id_profissional_id_key UNIQUE (procedimento_id, profissional_id);


--
-- Name: procedimentos procedimentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procedimentos
    ADD CONSTRAINT procedimentos_pkey PRIMARY KEY (id);


--
-- Name: produtos produtos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produtos
    ADD CONSTRAINT produtos_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profissionais profissionais_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profissionais
    ADD CONSTRAINT profissionais_pkey PRIMARY KEY (id);


--
-- Name: stripe_config stripe_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stripe_config
    ADD CONSTRAINT stripe_config_pkey PRIMARY KEY (id);


--
-- Name: stripe_config stripe_config_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stripe_config
    ADD CONSTRAINT stripe_config_user_id_key UNIQUE (user_id);


--
-- Name: subscription_audit subscription_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_audit
    ADD CONSTRAINT subscription_audit_pkey PRIMARY KEY (id);


--
-- Name: tipo_agendamento_custom tipo_agendamento_custom_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipo_agendamento_custom
    ADD CONSTRAINT tipo_agendamento_custom_pkey PRIMARY KEY (id);


--
-- Name: uazapi_config uazapi_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uazapi_config
    ADD CONSTRAINT uazapi_config_pkey PRIMARY KEY (id);


--
-- Name: uazapi_config uazapi_config_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uazapi_config
    ADD CONSTRAINT uazapi_config_user_id_key UNIQUE (user_id);


--
-- Name: user_subscriptions user_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: user_subscriptions user_subscriptions_stripe_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_stripe_customer_id_key UNIQUE (stripe_customer_id);


--
-- Name: user_subscriptions user_subscriptions_stripe_subscription_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_stripe_subscription_id_key UNIQUE (stripe_subscription_id);


--
-- Name: user_subscriptions user_subscriptions_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_user_id_key UNIQUE (user_id);


--
-- Name: webhook_logs webhook_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_logs
    ADD CONSTRAINT webhook_logs_pkey PRIMARY KEY (id);


--
-- Name: webhook_message_dedup webhook_message_dedup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_message_dedup
    ADD CONSTRAINT webhook_message_dedup_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_chat_kanban whatsapp_chat_kanban_chat_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_chat_kanban
    ADD CONSTRAINT whatsapp_chat_kanban_chat_id_key UNIQUE (chat_id);


--
-- Name: whatsapp_chat_kanban whatsapp_chat_kanban_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_chat_kanban
    ADD CONSTRAINT whatsapp_chat_kanban_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_chat_labels whatsapp_chat_labels_chat_id_label_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_chat_labels
    ADD CONSTRAINT whatsapp_chat_labels_chat_id_label_id_key UNIQUE (chat_id, label_id);


--
-- Name: whatsapp_chat_labels whatsapp_chat_labels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_chat_labels
    ADD CONSTRAINT whatsapp_chat_labels_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_chats whatsapp_chats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_chats
    ADD CONSTRAINT whatsapp_chats_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_kanban_columns whatsapp_kanban_columns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_kanban_columns
    ADD CONSTRAINT whatsapp_kanban_columns_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_labels whatsapp_labels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_labels
    ADD CONSTRAINT whatsapp_labels_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_labels whatsapp_labels_user_id_label_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_labels
    ADD CONSTRAINT whatsapp_labels_user_id_label_id_key UNIQUE (user_id, label_id);


--
-- Name: whatsapp_messages whatsapp_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_sync_status whatsapp_sync_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_sync_status
    ADD CONSTRAINT whatsapp_sync_status_pkey PRIMARY KEY (id);


--
-- Name: disparos_chats_active_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX disparos_chats_active_unique ON public.disparos_chats USING btree (user_id, normalized_number, instancia_id) WHERE (deleted_at IS NULL);


--
-- Name: disparos_messages_chat_message_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX disparos_messages_chat_message_unique ON public.disparos_messages USING btree (chat_id, message_id);


--
-- Name: idx_agendamentos_excluidos_log_data_agendamento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agendamentos_excluidos_log_data_agendamento ON public.agendamentos_excluidos_log USING btree (user_id, data_agendamento);


--
-- Name: idx_agendamentos_excluidos_log_excluido_em; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agendamentos_excluidos_log_excluido_em ON public.agendamentos_excluidos_log USING btree (user_id, excluido_em);


--
-- Name: idx_ai_ads_reports_user_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_ads_reports_user_account ON public.ai_ads_reports USING btree (user_id, account_id, created_at DESC);


--
-- Name: idx_assistente_contexto_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assistente_contexto_active ON public.assistente_contexto USING btree (active);


--
-- Name: idx_assistente_contexto_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assistente_contexto_phone ON public.assistente_contexto USING btree (phone);


--
-- Name: idx_assistente_contexto_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assistente_contexto_session_id ON public.assistente_contexto USING btree (session_id);


--
-- Name: idx_assistente_contexto_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assistente_contexto_user_id ON public.assistente_contexto USING btree (user_id);


--
-- Name: idx_ausencias_datas; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ausencias_datas ON public.ausencias_profissionais USING btree (data_inicio, data_fim);


--
-- Name: idx_ausencias_profissional; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ausencias_profissional ON public.ausencias_profissionais USING btree (profissional_id);


--
-- Name: idx_avisos_enviados_log_enviado_em; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_avisos_enviados_log_enviado_em ON public.avisos_enviados_log USING btree (enviado_em DESC);


--
-- Name: idx_avisos_enviados_log_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_avisos_enviados_log_user_id ON public.avisos_enviados_log USING btree (user_id);


--
-- Name: idx_despesas_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_despesas_data ON public.despesas USING btree (user_id, data_despesa);


--
-- Name: idx_disparos_campanha_contatos_campanha_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_disparos_campanha_contatos_campanha_id ON public.disparos_campanha_contatos USING btree (campanha_id);


--
-- Name: idx_disparos_campanha_contatos_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_disparos_campanha_contatos_status ON public.disparos_campanha_contatos USING btree (status);


--
-- Name: idx_disparos_campanha_variacoes_campanha_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_disparos_campanha_variacoes_campanha_id ON public.disparos_campanha_variacoes USING btree (campanha_id);


--
-- Name: idx_disparos_campanhas_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_disparos_campanhas_status ON public.disparos_campanhas USING btree (status);


--
-- Name: idx_disparos_campanhas_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_disparos_campanhas_user_id ON public.disparos_campanhas USING btree (user_id);


--
-- Name: idx_disparos_chat_kanban_column_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_disparos_chat_kanban_column_id ON public.disparos_chat_kanban USING btree (column_id);


--
-- Name: idx_disparos_chat_kanban_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_disparos_chat_kanban_user_id ON public.disparos_chat_kanban USING btree (user_id);


--
-- Name: idx_disparos_chats_normalized_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_disparos_chats_normalized_number ON public.disparos_chats USING btree (normalized_number);


--
-- Name: idx_disparos_chats_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_disparos_chats_user_id ON public.disparos_chats USING btree (user_id);


--
-- Name: idx_disparos_kanban_columns_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_disparos_kanban_columns_user_id ON public.disparos_kanban_columns USING btree (user_id);


--
-- Name: idx_disparos_messages_chat_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_disparos_messages_chat_id ON public.disparos_messages USING btree (chat_id);


--
-- Name: idx_disparos_messages_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_disparos_messages_timestamp ON public.disparos_messages USING btree ("timestamp" DESC);


--
-- Name: idx_disparos_variacoes_bloco; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_disparos_variacoes_bloco ON public.disparos_campanha_variacoes USING btree (campanha_id, bloco, ordem);


--
-- Name: idx_escalas_dia_semana; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_escalas_dia_semana ON public.escalas_profissionais USING btree (dia_semana);


--
-- Name: idx_escalas_profissional; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_escalas_profissional ON public.escalas_profissionais USING btree (profissional_id);


--
-- Name: idx_facebook_ad_accounts_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_facebook_ad_accounts_unique ON public.facebook_ad_accounts USING btree (user_id, ad_account_id);


--
-- Name: idx_facebook_ad_accounts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_facebook_ad_accounts_user_id ON public.facebook_ad_accounts USING btree (user_id);


--
-- Name: idx_leads_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_deleted_at ON public.leads USING btree (deleted_at) WHERE (deleted_at IS NULL);


--
-- Name: idx_leads_fb_adset_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_fb_adset_id ON public.leads USING btree (fb_adset_id);


--
-- Name: idx_leads_fb_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_fb_campaign_id ON public.leads USING btree (fb_campaign_id);


--
-- Name: idx_leads_fbclid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_fbclid ON public.leads USING btree (fbclid) WHERE (fbclid IS NOT NULL);


--
-- Name: idx_leads_respondeu; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_respondeu ON public.leads USING btree (respondeu) WHERE (respondeu = true);


--
-- Name: idx_leads_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_status ON public.leads USING btree (user_id, status);


--
-- Name: idx_leads_telefone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_telefone ON public.leads USING btree (user_id, telefone);


--
-- Name: idx_leads_user_phone_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_leads_user_phone_unique ON public.leads USING btree (user_id, public.normalize_br_phone(telefone)) WHERE ((origem = 'WhatsApp'::text) AND (deleted_at IS NULL));


--
-- Name: idx_leads_user_telefone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_user_telefone ON public.leads USING btree (user_id, telefone);


--
-- Name: idx_leads_utm_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_utm_campaign ON public.leads USING btree (utm_campaign) WHERE (utm_campaign IS NOT NULL);


--
-- Name: idx_meta_conversion_events_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_conversion_events_lead_id ON public.meta_conversion_events USING btree (lead_id);


--
-- Name: idx_meta_conversion_events_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_conversion_events_user_id ON public.meta_conversion_events USING btree (user_id);


--
-- Name: idx_openai_config_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_openai_config_user_id ON public.openai_config USING btree (user_id);


--
-- Name: idx_uazapi_config_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uazapi_config_user_id ON public.uazapi_config USING btree (user_id);


--
-- Name: idx_webhook_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_logs_created_at ON public.webhook_logs USING btree (created_at DESC);


--
-- Name: idx_webhook_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_logs_user_id ON public.webhook_logs USING btree (user_id, created_at DESC);


--
-- Name: idx_whatsapp_chats_normalized_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_chats_normalized_number ON public.whatsapp_chats USING btree (normalized_number);


--
-- Name: idx_whatsapp_chats_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_chats_user_id ON public.whatsapp_chats USING btree (user_id);


--
-- Name: idx_whatsapp_chats_user_last_read_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_chats_user_last_read_at ON public.whatsapp_chats USING btree (user_id, last_read_at);


--
-- Name: idx_whatsapp_chats_user_provider_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_chats_user_provider_unread ON public.whatsapp_chats USING btree (user_id, provider_unread_count, provider_unread_baseline);


--
-- Name: idx_whatsapp_messages_chat_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_messages_chat_id ON public.whatsapp_messages USING btree (chat_id);


--
-- Name: idx_whatsapp_messages_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_messages_deleted ON public.whatsapp_messages USING btree (deleted) WHERE (deleted = true);


--
-- Name: idx_whatsapp_messages_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_messages_timestamp ON public.whatsapp_messages USING btree ("timestamp");


--
-- Name: leads_user_telefone_origem_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX leads_user_telefone_origem_unique ON public.leads USING btree (user_id, telefone, COALESCE(origem, ''::text)) WHERE (deleted_at IS NULL);


--
-- Name: webhook_message_dedup_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX webhook_message_dedup_unique ON public.webhook_message_dedup USING btree (user_id, instancia_id, phone_last8, message_timestamp, message_hash);


--
-- Name: whatsapp_chats_user_id_normalized_number_active_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX whatsapp_chats_user_id_normalized_number_active_key ON public.whatsapp_chats USING btree (user_id, normalized_number) WHERE (deleted_at IS NULL);


--
-- Name: whatsapp_messages_chat_message_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX whatsapp_messages_chat_message_unique ON public.whatsapp_messages USING btree (chat_id, message_id);


--
-- Name: whatsapp_messages_message_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX whatsapp_messages_message_id_unique ON public.whatsapp_messages USING btree (message_id);


--
-- Name: leads on_lead_status_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_lead_status_change AFTER UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.log_lead_status_change();


--
-- Name: agendamentos update_agendamentos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_agendamentos_updated_at BEFORE UPDATE ON public.agendamentos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: audios_predefinidos update_audios_predefinidos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_audios_predefinidos_updated_at BEFORE UPDATE ON public.audios_predefinidos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: ausencias_profissionais update_ausencias_profissionais_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_ausencias_profissionais_updated_at BEFORE UPDATE ON public.ausencias_profissionais FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: avisos_agendamento update_avisos_agendamento_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_avisos_agendamento_updated_at BEFORE UPDATE ON public.avisos_agendamento FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: blocos_audios_predefinidos update_blocos_audios_predefinidos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_blocos_audios_predefinidos_updated_at BEFORE UPDATE ON public.blocos_audios_predefinidos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: despesas update_despesas_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_despesas_updated_at BEFORE UPDATE ON public.despesas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: disparos_instancias update_disparos_instancias_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_disparos_instancias_updated_at BEFORE UPDATE ON public.disparos_instancias FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: disparos_templates update_disparos_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_disparos_templates_updated_at BEFORE UPDATE ON public.disparos_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: escalas_profissionais update_escalas_profissionais_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_escalas_profissionais_updated_at BEFORE UPDATE ON public.escalas_profissionais FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: facebook_ad_accounts update_facebook_ad_accounts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_facebook_ad_accounts_updated_at BEFORE UPDATE ON public.facebook_ad_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: facebook_config update_facebook_config_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_facebook_config_updated_at BEFORE UPDATE ON public.facebook_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: faturas update_faturas_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_faturas_updated_at BEFORE UPDATE ON public.faturas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: google_ads_accounts update_google_ads_accounts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_google_ads_accounts_updated_at BEFORE UPDATE ON public.google_ads_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: google_ads_config update_google_ads_config_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_google_ads_config_updated_at BEFORE UPDATE ON public.google_ads_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: instagram_config update_instagram_config_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_instagram_config_updated_at BEFORE UPDATE ON public.instagram_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: instagram_fluxos update_instagram_fluxos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_instagram_fluxos_updated_at BEFORE UPDATE ON public.instagram_fluxos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: instagram_formularios update_instagram_formularios_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_instagram_formularios_updated_at BEFORE UPDATE ON public.instagram_formularios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: instagram_gatilhos update_instagram_gatilhos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_instagram_gatilhos_updated_at BEFORE UPDATE ON public.instagram_gatilhos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: lead_status_custom update_lead_status_custom_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_lead_status_custom_updated_at BEFORE UPDATE ON public.lead_status_custom FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: leads update_leads_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: listas_extrator update_listas_extrator_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_listas_extrator_updated_at BEFORE UPDATE ON public.listas_extrator FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: mensagens_predefinidas update_mensagens_predefinidas_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_mensagens_predefinidas_updated_at BEFORE UPDATE ON public.mensagens_predefinidas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: meta_pixel_config update_meta_pixel_config_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_meta_pixel_config_updated_at BEFORE UPDATE ON public.meta_pixel_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: metricas_preferencias update_metricas_preferencias_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_metricas_preferencias_updated_at BEFORE UPDATE ON public.metricas_preferencias FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: personalizacao_config update_personalizacao_config_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_personalizacao_config_updated_at BEFORE UPDATE ON public.personalizacao_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: procedimentos update_procedimentos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_procedimentos_updated_at BEFORE UPDATE ON public.procedimentos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: produtos update_produtos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_produtos_updated_at BEFORE UPDATE ON public.produtos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profissionais update_profissionais_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profissionais_updated_at BEFORE UPDATE ON public.profissionais FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: stripe_config update_stripe_config_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_stripe_config_updated_at BEFORE UPDATE ON public.stripe_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tipo_agendamento_custom update_tipo_agendamento_custom_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tipo_agendamento_custom_updated_at BEFORE UPDATE ON public.tipo_agendamento_custom FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: uazapi_config update_uazapi_config_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_uazapi_config_updated_at BEFORE UPDATE ON public.uazapi_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_subscriptions update_user_subscriptions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_subscriptions_updated_at BEFORE UPDATE ON public.user_subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: whatsapp_chat_kanban update_whatsapp_chat_kanban_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_whatsapp_chat_kanban_updated_at BEFORE UPDATE ON public.whatsapp_chat_kanban FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: whatsapp_chats update_whatsapp_chats_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_whatsapp_chats_updated_at BEFORE UPDATE ON public.whatsapp_chats FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: whatsapp_kanban_columns update_whatsapp_kanban_columns_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_whatsapp_kanban_columns_updated_at BEFORE UPDATE ON public.whatsapp_kanban_columns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: whatsapp_labels update_whatsapp_labels_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_whatsapp_labels_updated_at BEFORE UPDATE ON public.whatsapp_labels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: whatsapp_sync_status update_whatsapp_sync_status_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_whatsapp_sync_status_updated_at BEFORE UPDATE ON public.whatsapp_sync_status FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: agendamentos agendamentos_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agendamentos
    ADD CONSTRAINT agendamentos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: agendamentos agendamentos_procedimento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agendamentos
    ADD CONSTRAINT agendamentos_procedimento_id_fkey FOREIGN KEY (procedimento_id) REFERENCES public.procedimentos(id) ON DELETE SET NULL;


--
-- Name: agendamentos agendamentos_profissional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agendamentos
    ADD CONSTRAINT agendamentos_profissional_id_fkey FOREIGN KEY (profissional_id) REFERENCES public.profissionais(id) ON DELETE SET NULL;


--
-- Name: assistente_contexto assistente_contexto_procedimento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistente_contexto
    ADD CONSTRAINT assistente_contexto_procedimento_id_fkey FOREIGN KEY (procedimento_id) REFERENCES public.procedimentos(id) ON DELETE SET NULL;


--
-- Name: assistente_contexto assistente_contexto_profissional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistente_contexto
    ADD CONSTRAINT assistente_contexto_profissional_id_fkey FOREIGN KEY (profissional_id) REFERENCES public.profissionais(id) ON DELETE SET NULL;


--
-- Name: audios_predefinidos audios_predefinidos_bloco_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audios_predefinidos
    ADD CONSTRAINT audios_predefinidos_bloco_id_fkey FOREIGN KEY (bloco_id) REFERENCES public.blocos_audios_predefinidos(id) ON DELETE SET NULL;


--
-- Name: ausencias_profissionais ausencias_profissionais_profissional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ausencias_profissionais
    ADD CONSTRAINT ausencias_profissionais_profissional_id_fkey FOREIGN KEY (profissional_id) REFERENCES public.profissionais(id) ON DELETE CASCADE;


--
-- Name: ausencias_profissionais ausencias_profissionais_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ausencias_profissionais
    ADD CONSTRAINT ausencias_profissionais_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: avisos_enviados_log avisos_enviados_log_agendamento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avisos_enviados_log
    ADD CONSTRAINT avisos_enviados_log_agendamento_id_fkey FOREIGN KEY (agendamento_id) REFERENCES public.agendamentos(id) ON DELETE SET NULL;


--
-- Name: avisos_enviados_log avisos_enviados_log_aviso_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avisos_enviados_log
    ADD CONSTRAINT avisos_enviados_log_aviso_id_fkey FOREIGN KEY (aviso_id) REFERENCES public.avisos_agendamento(id) ON DELETE SET NULL;


--
-- Name: avisos_enviados_log avisos_enviados_log_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avisos_enviados_log
    ADD CONSTRAINT avisos_enviados_log_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: categorias_despesas categorias_despesas_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias_despesas
    ADD CONSTRAINT categorias_despesas_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: despesas despesas_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despesas
    ADD CONSTRAINT despesas_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias_despesas(id) ON DELETE SET NULL;


--
-- Name: despesas despesas_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despesas
    ADD CONSTRAINT despesas_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: disparos_campanha_contatos disparos_campanha_contatos_campanha_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disparos_campanha_contatos
    ADD CONSTRAINT disparos_campanha_contatos_campanha_id_fkey FOREIGN KEY (campanha_id) REFERENCES public.disparos_campanhas(id) ON DELETE CASCADE;


--
-- Name: disparos_campanha_variacoes disparos_campanha_variacoes_campanha_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disparos_campanha_variacoes
    ADD CONSTRAINT disparos_campanha_variacoes_campanha_id_fkey FOREIGN KEY (campanha_id) REFERENCES public.disparos_campanhas(id) ON DELETE CASCADE;


--
-- Name: disparos_chat_kanban disparos_chat_kanban_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disparos_chat_kanban
    ADD CONSTRAINT disparos_chat_kanban_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.disparos_chats(id) ON DELETE CASCADE;


--
-- Name: disparos_chat_kanban disparos_chat_kanban_column_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disparos_chat_kanban
    ADD CONSTRAINT disparos_chat_kanban_column_id_fkey FOREIGN KEY (column_id) REFERENCES public.disparos_kanban_columns(id) ON DELETE CASCADE;


--
-- Name: disparos_chats disparos_chats_instancia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disparos_chats
    ADD CONSTRAINT disparos_chats_instancia_id_fkey FOREIGN KEY (instancia_id) REFERENCES public.disparos_instancias(id) ON DELETE SET NULL;


--
-- Name: disparos_messages disparos_messages_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disparos_messages
    ADD CONSTRAINT disparos_messages_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.disparos_chats(id) ON DELETE CASCADE;


--
-- Name: disparos_template_variacoes disparos_template_variacoes_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disparos_template_variacoes
    ADD CONSTRAINT disparos_template_variacoes_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.disparos_templates(id) ON DELETE CASCADE;


--
-- Name: escalas_profissionais escalas_profissionais_profissional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escalas_profissionais
    ADD CONSTRAINT escalas_profissionais_profissional_id_fkey FOREIGN KEY (profissional_id) REFERENCES public.profissionais(id) ON DELETE CASCADE;


--
-- Name: escalas_profissionais escalas_profissionais_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escalas_profissionais
    ADD CONSTRAINT escalas_profissionais_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: fatura_agendamentos fatura_agendamentos_agendamento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fatura_agendamentos
    ADD CONSTRAINT fatura_agendamentos_agendamento_id_fkey FOREIGN KEY (agendamento_id) REFERENCES public.agendamentos(id) ON DELETE CASCADE;


--
-- Name: fatura_agendamentos fatura_agendamentos_fatura_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fatura_agendamentos
    ADD CONSTRAINT fatura_agendamentos_fatura_id_fkey FOREIGN KEY (fatura_id) REFERENCES public.faturas(id) ON DELETE CASCADE;


--
-- Name: fatura_upsells fatura_upsells_fatura_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fatura_upsells
    ADD CONSTRAINT fatura_upsells_fatura_id_fkey FOREIGN KEY (fatura_id) REFERENCES public.faturas(id) ON DELETE CASCADE;


--
-- Name: fatura_upsells fatura_upsells_procedimento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fatura_upsells
    ADD CONSTRAINT fatura_upsells_procedimento_id_fkey FOREIGN KEY (procedimento_id) REFERENCES public.procedimentos(id) ON DELETE SET NULL;


--
-- Name: fatura_upsells fatura_upsells_produto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fatura_upsells
    ADD CONSTRAINT fatura_upsells_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.produtos(id) ON DELETE SET NULL;


--
-- Name: faturas faturas_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faturas
    ADD CONSTRAINT faturas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: faturas faturas_procedimento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faturas
    ADD CONSTRAINT faturas_procedimento_id_fkey FOREIGN KEY (procedimento_id) REFERENCES public.procedimentos(id) ON DELETE SET NULL;


--
-- Name: faturas faturas_profissional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faturas
    ADD CONSTRAINT faturas_profissional_id_fkey FOREIGN KEY (profissional_id) REFERENCES public.profissionais(id) ON DELETE SET NULL;


--
-- Name: historico_leads historico_leads_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historico_leads
    ADD CONSTRAINT historico_leads_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: historico_leads historico_leads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historico_leads
    ADD CONSTRAINT historico_leads_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: instagram_formularios_respostas instagram_formularios_respostas_formulario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_formularios_respostas
    ADD CONSTRAINT instagram_formularios_respostas_formulario_id_fkey FOREIGN KEY (formulario_id) REFERENCES public.instagram_formularios(id) ON DELETE CASCADE;


--
-- Name: instagram_gatilhos instagram_gatilhos_formulario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_gatilhos
    ADD CONSTRAINT instagram_gatilhos_formulario_id_fkey FOREIGN KEY (formulario_id) REFERENCES public.instagram_formularios(id) ON DELETE SET NULL;


--
-- Name: instagram_mensagens instagram_mensagens_fluxo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_mensagens
    ADD CONSTRAINT instagram_mensagens_fluxo_id_fkey FOREIGN KEY (fluxo_id) REFERENCES public.instagram_fluxos(id) ON DELETE SET NULL;


--
-- Name: instagram_mensagens instagram_mensagens_gatilho_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_mensagens
    ADD CONSTRAINT instagram_mensagens_gatilho_id_fkey FOREIGN KEY (gatilho_id) REFERENCES public.instagram_gatilhos(id) ON DELETE SET NULL;


--
-- Name: leads leads_procedimento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_procedimento_id_fkey FOREIGN KEY (procedimento_id) REFERENCES public.procedimentos(id) ON DELETE SET NULL;


--
-- Name: leads leads_profissional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_profissional_id_fkey FOREIGN KEY (profissional_id) REFERENCES public.profissionais(id) ON DELETE SET NULL;


--
-- Name: leads leads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mensagens_predefinidas mensagens_predefinidas_bloco_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagens_predefinidas
    ADD CONSTRAINT mensagens_predefinidas_bloco_id_fkey FOREIGN KEY (bloco_id) REFERENCES public.blocos_mensagens_predefinidas(id) ON DELETE SET NULL;


--
-- Name: meta_conversion_events meta_conversion_events_agendamento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_conversion_events
    ADD CONSTRAINT meta_conversion_events_agendamento_id_fkey FOREIGN KEY (agendamento_id) REFERENCES public.agendamentos(id) ON DELETE SET NULL;


--
-- Name: meta_conversion_events meta_conversion_events_fatura_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_conversion_events
    ADD CONSTRAINT meta_conversion_events_fatura_id_fkey FOREIGN KEY (fatura_id) REFERENCES public.faturas(id) ON DELETE SET NULL;


--
-- Name: meta_conversion_events meta_conversion_events_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_conversion_events
    ADD CONSTRAINT meta_conversion_events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: procedimento_profissional procedimento_profissional_procedimento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procedimento_profissional
    ADD CONSTRAINT procedimento_profissional_procedimento_id_fkey FOREIGN KEY (procedimento_id) REFERENCES public.procedimentos(id) ON DELETE CASCADE;


--
-- Name: procedimento_profissional procedimento_profissional_profissional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procedimento_profissional
    ADD CONSTRAINT procedimento_profissional_profissional_id_fkey FOREIGN KEY (profissional_id) REFERENCES public.profissionais(id) ON DELETE CASCADE;


--
-- Name: procedimentos procedimentos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procedimentos
    ADD CONSTRAINT procedimentos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profissionais profissionais_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profissionais
    ADD CONSTRAINT profissionais_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: stripe_config stripe_config_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stripe_config
    ADD CONSTRAINT stripe_config_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: subscription_audit subscription_audit_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_audit
    ADD CONSTRAINT subscription_audit_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: uazapi_config uazapi_config_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uazapi_config
    ADD CONSTRAINT uazapi_config_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: uazapi_config uazapi_config_whatsapp_instancia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uazapi_config
    ADD CONSTRAINT uazapi_config_whatsapp_instancia_id_fkey FOREIGN KEY (whatsapp_instancia_id) REFERENCES public.disparos_instancias(id) ON DELETE SET NULL;


--
-- Name: user_subscriptions user_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: whatsapp_chat_kanban whatsapp_chat_kanban_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_chat_kanban
    ADD CONSTRAINT whatsapp_chat_kanban_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.whatsapp_chats(id) ON DELETE CASCADE;


--
-- Name: whatsapp_chat_kanban whatsapp_chat_kanban_column_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_chat_kanban
    ADD CONSTRAINT whatsapp_chat_kanban_column_id_fkey FOREIGN KEY (column_id) REFERENCES public.whatsapp_kanban_columns(id) ON DELETE CASCADE;


--
-- Name: whatsapp_chat_kanban whatsapp_chat_kanban_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_chat_kanban
    ADD CONSTRAINT whatsapp_chat_kanban_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: whatsapp_chat_labels whatsapp_chat_labels_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_chat_labels
    ADD CONSTRAINT whatsapp_chat_labels_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.whatsapp_chats(id) ON DELETE CASCADE;


--
-- Name: whatsapp_chat_labels whatsapp_chat_labels_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_chat_labels
    ADD CONSTRAINT whatsapp_chat_labels_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: whatsapp_chats whatsapp_chats_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_chats
    ADD CONSTRAINT whatsapp_chats_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: whatsapp_kanban_columns whatsapp_kanban_columns_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_kanban_columns
    ADD CONSTRAINT whatsapp_kanban_columns_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: whatsapp_labels whatsapp_labels_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_labels
    ADD CONSTRAINT whatsapp_labels_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: whatsapp_messages whatsapp_messages_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: whatsapp_messages whatsapp_messages_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.whatsapp_chats(id) ON DELETE CASCADE;


--
-- Name: whatsapp_sync_status whatsapp_sync_status_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_sync_status
    ADD CONSTRAINT whatsapp_sync_status_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: instagram_formularios_respostas Anyone can submit form responses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can submit form responses" ON public.instagram_formularios_respostas FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.instagram_formularios f
  WHERE ((f.id = instagram_formularios_respostas.formulario_id) AND (COALESCE(f.ativo, true) = true) AND (f.user_id = instagram_formularios_respostas.user_id)))));


--
-- Name: instagram_formularios Anyone can view active forms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active forms" ON public.instagram_formularios FOR SELECT USING ((COALESCE(ativo, true) = true));


--
-- Name: whatsapp_sync_status Service can manage sync status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service can manage sync status" ON public.whatsapp_sync_status USING (true);


--
-- Name: avisos_enviados_log Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public.avisos_enviados_log USING (true) WITH CHECK (true);


--
-- Name: instagram_interacoes Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public.instagram_interacoes USING (true) WITH CHECK (true);


--
-- Name: facebook_ad_accounts Users can create own ad accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own ad accounts" ON public.facebook_ad_accounts FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: facebook_config Users can create own facebook config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own facebook config" ON public.facebook_config FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: google_ads_accounts Users can create own google_ads_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own google_ads_accounts" ON public.google_ads_accounts FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: google_ads_config Users can create own google_ads_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own google_ads_config" ON public.google_ads_config FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: disparos_instancias Users can create own instances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own instances" ON public.disparos_instancias FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: apify_config Users can create their own apify config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own apify config" ON public.apify_config FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: blocos_audios_predefinidos Users can create their own audio blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own audio blocks" ON public.blocos_audios_predefinidos FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: audios_predefinidos Users can create their own audios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own audios" ON public.audios_predefinidos FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: avisos_agendamento Users can create their own avisos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own avisos" ON public.avisos_agendamento FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: blocos_mensagens_predefinidas Users can create their own blocos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own blocos" ON public.blocos_mensagens_predefinidas FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: disparos_chat_kanban Users can create their own chat kanban assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own chat kanban assignments" ON public.disparos_chat_kanban FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: agendamentos_excluidos_log Users can create their own deleted appointments logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own deleted appointments logs" ON public.agendamentos_excluidos_log FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: faturas_excluidas_log Users can create their own deleted invoices logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own deleted invoices logs" ON public.faturas_excluidas_log FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: fatura_upsells Users can create their own fatura_upsells; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own fatura_upsells" ON public.fatura_upsells FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.faturas
  WHERE ((faturas.id = fatura_upsells.fatura_id) AND (faturas.user_id = auth.uid())))));


--
-- Name: instagram_formularios Users can create their own forms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own forms" ON public.instagram_formularios FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: disparos_kanban_columns Users can create their own kanban columns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own kanban columns" ON public.disparos_kanban_columns FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: listas_extrator Users can create their own lists; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own lists" ON public.listas_extrator FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: personalizacao_config Users can create their own personalization config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own personalization config" ON public.personalizacao_config FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: produtos Users can create their own produtos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own produtos" ON public.produtos FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: ai_ads_reports Users can create their own reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own reports" ON public.ai_ads_reports FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: disparos_templates Users can create their own templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own templates" ON public.disparos_templates FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: disparos_campanha_variacoes Users can create variations for their campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create variations for their campaigns" ON public.disparos_campanha_variacoes FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.disparos_campanhas
  WHERE ((disparos_campanhas.id = disparos_campanha_variacoes.campanha_id) AND (disparos_campanhas.user_id = auth.uid())))));


--
-- Name: disparos_template_variacoes Users can create variations for their templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create variations for their templates" ON public.disparos_template_variacoes FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.disparos_templates
  WHERE ((disparos_templates.id = disparos_template_variacoes.template_id) AND (disparos_templates.user_id = auth.uid())))));


--
-- Name: disparos_campanha_contatos Users can delete contacts from their campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete contacts from their campaigns" ON public.disparos_campanha_contatos FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.disparos_campanhas
  WHERE ((disparos_campanhas.id = disparos_campanha_contatos.campanha_id) AND (disparos_campanhas.user_id = auth.uid())))));


--
-- Name: facebook_ad_accounts Users can delete own ad accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own ad accounts" ON public.facebook_ad_accounts FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: agendamentos Users can delete own agendamentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own agendamentos" ON public.agendamentos FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: ausencias_profissionais Users can delete own ausencias; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own ausencias" ON public.ausencias_profissionais FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: whatsapp_chat_kanban Users can delete own chat kanban; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own chat kanban" ON public.whatsapp_chat_kanban FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: whatsapp_chat_labels Users can delete own chat labels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own chat labels" ON public.whatsapp_chat_labels FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: whatsapp_chats Users can delete own chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own chats" ON public.whatsapp_chats FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: escalas_profissionais Users can delete own escalas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own escalas" ON public.escalas_profissionais FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: facebook_config Users can delete own facebook config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own facebook config" ON public.facebook_config FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: fatura_agendamentos Users can delete own fatura_agendamentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own fatura_agendamentos" ON public.fatura_agendamentos FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.faturas
  WHERE ((faturas.id = fatura_agendamentos.fatura_id) AND (faturas.user_id = auth.uid())))));


--
-- Name: faturas Users can delete own faturas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own faturas" ON public.faturas FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: google_ads_accounts Users can delete own google_ads_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own google_ads_accounts" ON public.google_ads_accounts FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: google_ads_config Users can delete own google_ads_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own google_ads_config" ON public.google_ads_config FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: disparos_instancias Users can delete own instances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own instances" ON public.disparos_instancias FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: whatsapp_kanban_columns Users can delete own kanban columns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own kanban columns" ON public.whatsapp_kanban_columns FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: whatsapp_labels Users can delete own labels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own labels" ON public.whatsapp_labels FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: leads Users can delete own leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own leads" ON public.leads FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: mensagens_predefinidas Users can delete own mensagens_predefinidas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own mensagens_predefinidas" ON public.mensagens_predefinidas FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: procedimento_profissional Users can delete own procedimento_profissional; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own procedimento_profissional" ON public.procedimento_profissional FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: procedimentos Users can delete own procedimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own procedimentos" ON public.procedimentos FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: profissionais Users can delete own profissionais; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own profissionais" ON public.profissionais FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: lead_status_custom Users can delete own status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own status" ON public.lead_status_custom FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: tipo_agendamento_custom Users can delete own tipos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own tipos" ON public.tipo_agendamento_custom FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: uazapi_config Users can delete own uazapi config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own uazapi config" ON public.uazapi_config FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: instagram_config Users can delete their own Instagram config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own Instagram config" ON public.instagram_config FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: instagram_fluxos Users can delete their own Instagram flows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own Instagram flows" ON public.instagram_fluxos FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: instagram_gatilhos Users can delete their own Instagram triggers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own Instagram triggers" ON public.instagram_gatilhos FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: openai_config Users can delete their own OpenAI config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own OpenAI config" ON public.openai_config FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: apify_config Users can delete their own apify config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own apify config" ON public.apify_config FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: blocos_audios_predefinidos Users can delete their own audio blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own audio blocks" ON public.blocos_audios_predefinidos FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: audios_predefinidos Users can delete their own audios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own audios" ON public.audios_predefinidos FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: avisos_agendamento Users can delete their own avisos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own avisos" ON public.avisos_agendamento FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: blocos_mensagens_predefinidas Users can delete their own blocos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own blocos" ON public.blocos_mensagens_predefinidas FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: disparos_campanha_variacoes Users can delete their own campaign variations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own campaign variations" ON public.disparos_campanha_variacoes FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.disparos_campanhas
  WHERE ((disparos_campanhas.id = disparos_campanha_variacoes.campanha_id) AND (disparos_campanhas.user_id = auth.uid())))));


--
-- Name: disparos_campanhas Users can delete their own campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own campaigns" ON public.disparos_campanhas FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: disparos_chat_kanban Users can delete their own chat kanban assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own chat kanban assignments" ON public.disparos_chat_kanban FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: agendamentos_excluidos_log Users can delete their own deleted appointments logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own deleted appointments logs" ON public.agendamentos_excluidos_log FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: faturas_excluidas_log Users can delete their own deleted invoices logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own deleted invoices logs" ON public.faturas_excluidas_log FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: disparos_chats Users can delete their own disparos chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own disparos chats" ON public.disparos_chats FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: disparos_config Users can delete their own disparos config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own disparos config" ON public.disparos_config FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: fatura_upsells Users can delete their own fatura_upsells; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own fatura_upsells" ON public.fatura_upsells FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.faturas
  WHERE ((faturas.id = fatura_upsells.fatura_id) AND (faturas.user_id = auth.uid())))));


--
-- Name: instagram_formularios Users can delete their own forms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own forms" ON public.instagram_formularios FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: disparos_kanban_columns Users can delete their own kanban columns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own kanban columns" ON public.disparos_kanban_columns FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: listas_extrator Users can delete their own lists; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own lists" ON public.listas_extrator FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: meta_pixel_config Users can delete their own pixel config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own pixel config" ON public.meta_pixel_config FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: produtos Users can delete their own produtos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own produtos" ON public.produtos FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: ai_ads_reports Users can delete their own reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own reports" ON public.ai_ads_reports FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: disparos_template_variacoes Users can delete their own template variations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own template variations" ON public.disparos_template_variacoes FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.disparos_templates
  WHERE ((disparos_templates.id = disparos_template_variacoes.template_id) AND (disparos_templates.user_id = auth.uid())))));


--
-- Name: disparos_templates Users can delete their own templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own templates" ON public.disparos_templates FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: disparos_campanha_contatos Users can insert contacts to their campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert contacts to their campaigns" ON public.disparos_campanha_contatos FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.disparos_campanhas
  WHERE ((disparos_campanhas.id = disparos_campanha_contatos.campanha_id) AND (disparos_campanhas.user_id = auth.uid())))));


--
-- Name: whatsapp_messages Users can insert messages to own chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert messages to own chats" ON public.whatsapp_messages FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.whatsapp_chats
  WHERE ((whatsapp_chats.id = whatsapp_messages.chat_id) AND (whatsapp_chats.user_id = auth.uid())))));


--
-- Name: disparos_messages Users can insert messages to their disparos chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert messages to their disparos chats" ON public.disparos_messages FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.disparos_chats
  WHERE ((disparos_chats.id = disparos_messages.chat_id) AND (disparos_chats.user_id = auth.uid())))));


--
-- Name: agendamentos Users can insert own agendamentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own agendamentos" ON public.agendamentos FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: ausencias_profissionais Users can insert own ausencias; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own ausencias" ON public.ausencias_profissionais FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: whatsapp_chat_kanban Users can insert own chat kanban; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own chat kanban" ON public.whatsapp_chat_kanban FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: whatsapp_chat_labels Users can insert own chat labels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own chat labels" ON public.whatsapp_chat_labels FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: whatsapp_chats Users can insert own chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own chats" ON public.whatsapp_chats FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: escalas_profissionais Users can insert own escalas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own escalas" ON public.escalas_profissionais FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: fatura_agendamentos Users can insert own fatura_agendamentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own fatura_agendamentos" ON public.fatura_agendamentos FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.faturas
  WHERE ((faturas.id = fatura_agendamentos.fatura_id) AND (faturas.user_id = auth.uid())))));


--
-- Name: faturas Users can insert own faturas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own faturas" ON public.faturas FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: historico_leads Users can insert own historico; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own historico" ON public.historico_leads FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: whatsapp_kanban_columns Users can insert own kanban columns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own kanban columns" ON public.whatsapp_kanban_columns FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: whatsapp_labels Users can insert own labels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own labels" ON public.whatsapp_labels FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: leads Users can insert own leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own leads" ON public.leads FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: mensagens_predefinidas Users can insert own mensagens_predefinidas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own mensagens_predefinidas" ON public.mensagens_predefinidas FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: procedimento_profissional Users can insert own procedimento_profissional; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own procedimento_profissional" ON public.procedimento_profissional FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: procedimentos Users can insert own procedimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own procedimentos" ON public.procedimentos FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: profissionais Users can insert own profissionais; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profissionais" ON public.profissionais FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: lead_status_custom Users can insert own status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own status" ON public.lead_status_custom FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: tipo_agendamento_custom Users can insert own tipos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own tipos" ON public.tipo_agendamento_custom FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: uazapi_config Users can insert own uazapi config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own uazapi config" ON public.uazapi_config FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: instagram_config Users can insert their own Instagram config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own Instagram config" ON public.instagram_config FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: instagram_fluxos Users can insert their own Instagram flows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own Instagram flows" ON public.instagram_fluxos FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: instagram_mensagens Users can insert their own Instagram messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own Instagram messages" ON public.instagram_mensagens FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: instagram_gatilhos Users can insert their own Instagram triggers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own Instagram triggers" ON public.instagram_gatilhos FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: openai_config Users can insert their own OpenAI config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own OpenAI config" ON public.openai_config FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: disparos_campanhas Users can insert their own campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own campaigns" ON public.disparos_campanhas FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: meta_conversion_events Users can insert their own conversion events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own conversion events" ON public.meta_conversion_events FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: agendamentos_excluidos_log Users can insert their own deleted appointments logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own deleted appointments logs" ON public.agendamentos_excluidos_log FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: disparos_chats Users can insert their own disparos chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own disparos chats" ON public.disparos_chats FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: disparos_config Users can insert their own disparos config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own disparos config" ON public.disparos_config FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: instagram_interacoes Users can insert their own interactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own interactions" ON public.instagram_interacoes FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: avisos_enviados_log Users can insert their own logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own logs" ON public.avisos_enviados_log FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: meta_pixel_config Users can insert their own pixel config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own pixel config" ON public.meta_pixel_config FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: metricas_preferencias Users can insert their own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own preferences" ON public.metricas_preferencias FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: categorias_despesas Users can manage own categorias; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own categorias" ON public.categorias_despesas USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: despesas Users can manage own despesas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own despesas" ON public.despesas USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: disparos_campanha_contatos Users can update contacts in their campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update contacts in their campaigns" ON public.disparos_campanha_contatos FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.disparos_campanhas
  WHERE ((disparos_campanhas.id = disparos_campanha_contatos.campanha_id) AND (disparos_campanhas.user_id = auth.uid())))));


--
-- Name: whatsapp_messages Users can update messages from own chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update messages from own chats" ON public.whatsapp_messages FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.whatsapp_chats
  WHERE ((whatsapp_chats.id = whatsapp_messages.chat_id) AND (whatsapp_chats.user_id = auth.uid())))));


--
-- Name: disparos_messages Users can update messages in their disparos chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update messages in their disparos chats" ON public.disparos_messages FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.disparos_chats
  WHERE ((disparos_chats.id = disparos_messages.chat_id) AND (disparos_chats.user_id = auth.uid())))));


--
-- Name: facebook_ad_accounts Users can update own ad accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own ad accounts" ON public.facebook_ad_accounts FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: agendamentos Users can update own agendamentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own agendamentos" ON public.agendamentos FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: ausencias_profissionais Users can update own ausencias; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own ausencias" ON public.ausencias_profissionais FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: whatsapp_chat_kanban Users can update own chat kanban; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own chat kanban" ON public.whatsapp_chat_kanban FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: whatsapp_chats Users can update own chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own chats" ON public.whatsapp_chats FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: escalas_profissionais Users can update own escalas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own escalas" ON public.escalas_profissionais FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: facebook_config Users can update own facebook config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own facebook config" ON public.facebook_config FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: faturas Users can update own faturas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own faturas" ON public.faturas FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: google_ads_accounts Users can update own google_ads_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own google_ads_accounts" ON public.google_ads_accounts FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: google_ads_config Users can update own google_ads_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own google_ads_config" ON public.google_ads_config FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: disparos_instancias Users can update own instances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own instances" ON public.disparos_instancias FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: whatsapp_kanban_columns Users can update own kanban columns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own kanban columns" ON public.whatsapp_kanban_columns FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: whatsapp_labels Users can update own labels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own labels" ON public.whatsapp_labels FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: leads Users can update own leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own leads" ON public.leads FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: mensagens_predefinidas Users can update own mensagens_predefinidas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own mensagens_predefinidas" ON public.mensagens_predefinidas FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: procedimentos Users can update own procedimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own procedimentos" ON public.procedimentos FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: profissionais Users can update own profissionais; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profissionais" ON public.profissionais FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: lead_status_custom Users can update own status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own status" ON public.lead_status_custom FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: tipo_agendamento_custom Users can update own tipos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own tipos" ON public.tipo_agendamento_custom FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: uazapi_config Users can update own uazapi config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own uazapi config" ON public.uazapi_config FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: instagram_config Users can update their own Instagram config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own Instagram config" ON public.instagram_config FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: instagram_fluxos Users can update their own Instagram flows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own Instagram flows" ON public.instagram_fluxos FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: instagram_gatilhos Users can update their own Instagram triggers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own Instagram triggers" ON public.instagram_gatilhos FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: openai_config Users can update their own OpenAI config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own OpenAI config" ON public.openai_config FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: apify_config Users can update their own apify config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own apify config" ON public.apify_config FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: blocos_audios_predefinidos Users can update their own audio blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own audio blocks" ON public.blocos_audios_predefinidos FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: audios_predefinidos Users can update their own audios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own audios" ON public.audios_predefinidos FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: avisos_agendamento Users can update their own avisos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own avisos" ON public.avisos_agendamento FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: blocos_mensagens_predefinidas Users can update their own blocos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own blocos" ON public.blocos_mensagens_predefinidas FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: disparos_campanhas Users can update their own campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own campaigns" ON public.disparos_campanhas FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: disparos_chat_kanban Users can update their own chat kanban assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own chat kanban assignments" ON public.disparos_chat_kanban FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: disparos_chats Users can update their own disparos chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own disparos chats" ON public.disparos_chats FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: disparos_config Users can update their own disparos config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own disparos config" ON public.disparos_config FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: fatura_upsells Users can update their own fatura_upsells; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own fatura_upsells" ON public.fatura_upsells FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.faturas
  WHERE ((faturas.id = fatura_upsells.fatura_id) AND (faturas.user_id = auth.uid())))));


--
-- Name: instagram_formularios Users can update their own forms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own forms" ON public.instagram_formularios FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: instagram_interacoes Users can update their own interactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own interactions" ON public.instagram_interacoes FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: disparos_kanban_columns Users can update their own kanban columns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own kanban columns" ON public.disparos_kanban_columns FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: listas_extrator Users can update their own lists; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own lists" ON public.listas_extrator FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: personalizacao_config Users can update their own personalization config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own personalization config" ON public.personalizacao_config FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: meta_pixel_config Users can update their own pixel config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own pixel config" ON public.meta_pixel_config FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: metricas_preferencias Users can update their own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own preferences" ON public.metricas_preferencias FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: produtos Users can update their own produtos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own produtos" ON public.produtos FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: disparos_template_variacoes Users can update their own template variations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own template variations" ON public.disparos_template_variacoes FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.disparos_templates
  WHERE ((disparos_templates.id = disparos_template_variacoes.template_id) AND (disparos_templates.user_id = auth.uid())))));


--
-- Name: disparos_templates Users can update their own templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own templates" ON public.disparos_templates FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: disparos_campanha_contatos Users can view contacts from their campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view contacts from their campaigns" ON public.disparos_campanha_contatos FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.disparos_campanhas
  WHERE ((disparos_campanhas.id = disparos_campanha_contatos.campanha_id) AND (disparos_campanhas.user_id = auth.uid())))));


--
-- Name: whatsapp_messages Users can view messages from own chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view messages from own chats" ON public.whatsapp_messages FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.whatsapp_chats
  WHERE ((whatsapp_chats.id = whatsapp_messages.chat_id) AND (whatsapp_chats.user_id = auth.uid())))));


--
-- Name: disparos_messages Users can view messages from their disparos chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view messages from their disparos chats" ON public.disparos_messages FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.disparos_chats
  WHERE ((disparos_chats.id = disparos_messages.chat_id) AND (disparos_chats.user_id = auth.uid())))));


--
-- Name: facebook_ad_accounts Users can view own ad accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own ad accounts" ON public.facebook_ad_accounts FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: agendamentos Users can view own agendamentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own agendamentos" ON public.agendamentos FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: ausencias_profissionais Users can view own ausencias; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own ausencias" ON public.ausencias_profissionais FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: categorias_despesas Users can view own categorias; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own categorias" ON public.categorias_despesas FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: whatsapp_chat_kanban Users can view own chat kanban; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own chat kanban" ON public.whatsapp_chat_kanban FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: whatsapp_chat_labels Users can view own chat labels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own chat labels" ON public.whatsapp_chat_labels FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: whatsapp_chats Users can view own chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own chats" ON public.whatsapp_chats FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: despesas Users can view own despesas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own despesas" ON public.despesas FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: escalas_profissionais Users can view own escalas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own escalas" ON public.escalas_profissionais FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: facebook_config Users can view own facebook config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own facebook config" ON public.facebook_config FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: fatura_agendamentos Users can view own fatura_agendamentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own fatura_agendamentos" ON public.fatura_agendamentos FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.faturas
  WHERE ((faturas.id = fatura_agendamentos.fatura_id) AND (faturas.user_id = auth.uid())))));


--
-- Name: faturas Users can view own faturas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own faturas" ON public.faturas FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: google_ads_accounts Users can view own google_ads_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own google_ads_accounts" ON public.google_ads_accounts FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: google_ads_config Users can view own google_ads_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own google_ads_config" ON public.google_ads_config FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: historico_leads Users can view own historico; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own historico" ON public.historico_leads FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: disparos_instancias Users can view own instances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own instances" ON public.disparos_instancias FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: whatsapp_kanban_columns Users can view own kanban columns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own kanban columns" ON public.whatsapp_kanban_columns FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: whatsapp_labels Users can view own labels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own labels" ON public.whatsapp_labels FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: leads Users can view own leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own leads" ON public.leads FOR SELECT USING (((auth.uid() = user_id) AND (deleted_at IS NULL)));


--
-- Name: mensagens_predefinidas Users can view own mensagens_predefinidas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own mensagens_predefinidas" ON public.mensagens_predefinidas FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: procedimento_profissional Users can view own procedimento_profissional; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own procedimento_profissional" ON public.procedimento_profissional FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: procedimentos Users can view own procedimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own procedimentos" ON public.procedimentos FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: profissionais Users can view own profissionais; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profissionais" ON public.profissionais FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: lead_status_custom Users can view own status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own status" ON public.lead_status_custom FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: stripe_config Users can view own stripe config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own stripe config" ON public.stripe_config FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_subscriptions Users can view own subscription; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own subscription" ON public.user_subscriptions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: whatsapp_sync_status Users can view own sync status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own sync status" ON public.whatsapp_sync_status FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: tipo_agendamento_custom Users can view own tipos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own tipos" ON public.tipo_agendamento_custom FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: uazapi_config Users can view own uazapi config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own uazapi config" ON public.uazapi_config FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: webhook_message_dedup Users can view own webhook dedup; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own webhook dedup" ON public.webhook_message_dedup FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: instagram_formularios_respostas Users can view their form submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their form submissions" ON public.instagram_formularios_respostas FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: instagram_config Users can view their own Instagram config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own Instagram config" ON public.instagram_config FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: instagram_fluxos Users can view their own Instagram flows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own Instagram flows" ON public.instagram_fluxos FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: instagram_mensagens Users can view their own Instagram messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own Instagram messages" ON public.instagram_mensagens FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: instagram_gatilhos Users can view their own Instagram triggers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own Instagram triggers" ON public.instagram_gatilhos FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: openai_config Users can view their own OpenAI config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own OpenAI config" ON public.openai_config FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: apify_config Users can view their own apify config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own apify config" ON public.apify_config FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: blocos_audios_predefinidos Users can view their own audio blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own audio blocks" ON public.blocos_audios_predefinidos FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: audios_predefinidos Users can view their own audios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own audios" ON public.audios_predefinidos FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: avisos_agendamento Users can view their own avisos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own avisos" ON public.avisos_agendamento FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: blocos_mensagens_predefinidas Users can view their own blocos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own blocos" ON public.blocos_mensagens_predefinidas FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: disparos_campanha_variacoes Users can view their own campaign variations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own campaign variations" ON public.disparos_campanha_variacoes FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.disparos_campanhas
  WHERE ((disparos_campanhas.id = disparos_campanha_variacoes.campanha_id) AND (disparos_campanhas.user_id = auth.uid())))));


--
-- Name: disparos_campanhas Users can view their own campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own campaigns" ON public.disparos_campanhas FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: disparos_chat_kanban Users can view their own chat kanban assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own chat kanban assignments" ON public.disparos_chat_kanban FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: meta_conversion_events Users can view their own conversion events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own conversion events" ON public.meta_conversion_events FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: agendamentos_excluidos_log Users can view their own deleted appointments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own deleted appointments" ON public.agendamentos_excluidos_log FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: agendamentos_excluidos_log Users can view their own deleted appointments logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own deleted appointments logs" ON public.agendamentos_excluidos_log FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: faturas_excluidas_log Users can view their own deleted invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own deleted invoices" ON public.faturas_excluidas_log FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: disparos_chats Users can view their own disparos chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own disparos chats" ON public.disparos_chats FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: disparos_config Users can view their own disparos config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own disparos config" ON public.disparos_config FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: fatura_upsells Users can view their own fatura_upsells; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own fatura_upsells" ON public.fatura_upsells FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.faturas
  WHERE ((faturas.id = fatura_upsells.fatura_id) AND (faturas.user_id = auth.uid())))));


--
-- Name: instagram_formularios Users can view their own forms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own forms" ON public.instagram_formularios FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: instagram_interacoes Users can view their own interactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own interactions" ON public.instagram_interacoes FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: disparos_kanban_columns Users can view their own kanban columns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own kanban columns" ON public.disparos_kanban_columns FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: listas_extrator Users can view their own lists; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own lists" ON public.listas_extrator FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: avisos_enviados_log Users can view their own logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own logs" ON public.avisos_enviados_log FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: personalizacao_config Users can view their own personalization config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own personalization config" ON public.personalizacao_config FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: meta_pixel_config Users can view their own pixel config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own pixel config" ON public.meta_pixel_config FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: metricas_preferencias Users can view their own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own preferences" ON public.metricas_preferencias FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: produtos Users can view their own produtos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own produtos" ON public.produtos FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: ai_ads_reports Users can view their own reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own reports" ON public.ai_ads_reports FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: disparos_template_variacoes Users can view their own template variations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own template variations" ON public.disparos_template_variacoes FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.disparos_templates
  WHERE ((disparos_templates.id = disparos_template_variacoes.template_id) AND (disparos_templates.user_id = auth.uid())))));


--
-- Name: disparos_templates Users can view their own templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own templates" ON public.disparos_templates FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: webhook_logs Users can view their own webhook logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own webhook logs" ON public.webhook_logs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: admin_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

--
-- Name: agendamentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;

--
-- Name: agendamentos_excluidos_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agendamentos_excluidos_log ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_ads_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_ads_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: apify_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.apify_config ENABLE ROW LEVEL SECURITY;

--
-- Name: assistente_contexto; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assistente_contexto ENABLE ROW LEVEL SECURITY;

--
-- Name: audios_predefinidos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audios_predefinidos ENABLE ROW LEVEL SECURITY;

--
-- Name: ausencias_profissionais; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ausencias_profissionais ENABLE ROW LEVEL SECURITY;

--
-- Name: avisos_agendamento; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.avisos_agendamento ENABLE ROW LEVEL SECURITY;

--
-- Name: avisos_enviados_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.avisos_enviados_log ENABLE ROW LEVEL SECURITY;

--
-- Name: blocos_audios_predefinidos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blocos_audios_predefinidos ENABLE ROW LEVEL SECURITY;

--
-- Name: blocos_mensagens_predefinidas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blocos_mensagens_predefinidas ENABLE ROW LEVEL SECURITY;

--
-- Name: categorias_despesas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categorias_despesas ENABLE ROW LEVEL SECURITY;

--
-- Name: despesas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;

--
-- Name: disparos_campanha_contatos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.disparos_campanha_contatos ENABLE ROW LEVEL SECURITY;

--
-- Name: disparos_campanha_variacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.disparos_campanha_variacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: disparos_campanhas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.disparos_campanhas ENABLE ROW LEVEL SECURITY;

--
-- Name: disparos_chat_kanban; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.disparos_chat_kanban ENABLE ROW LEVEL SECURITY;

--
-- Name: disparos_chats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.disparos_chats ENABLE ROW LEVEL SECURITY;

--
-- Name: disparos_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.disparos_config ENABLE ROW LEVEL SECURITY;

--
-- Name: disparos_instancias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.disparos_instancias ENABLE ROW LEVEL SECURITY;

--
-- Name: disparos_kanban_columns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.disparos_kanban_columns ENABLE ROW LEVEL SECURITY;

--
-- Name: disparos_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.disparos_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: disparos_template_variacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.disparos_template_variacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: disparos_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.disparos_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: escalas_profissionais; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.escalas_profissionais ENABLE ROW LEVEL SECURITY;

--
-- Name: facebook_ad_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.facebook_ad_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: facebook_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.facebook_config ENABLE ROW LEVEL SECURITY;

--
-- Name: fatura_agendamentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fatura_agendamentos ENABLE ROW LEVEL SECURITY;

--
-- Name: fatura_upsells; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fatura_upsells ENABLE ROW LEVEL SECURITY;

--
-- Name: faturas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.faturas ENABLE ROW LEVEL SECURITY;

--
-- Name: faturas_excluidas_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.faturas_excluidas_log ENABLE ROW LEVEL SECURITY;

--
-- Name: google_ads_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.google_ads_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: google_ads_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.google_ads_config ENABLE ROW LEVEL SECURITY;

--
-- Name: historico_leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.historico_leads ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_config ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_fluxos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_fluxos ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_formularios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_formularios ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_formularios_respostas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_formularios_respostas ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_gatilhos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_gatilhos ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_interacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_interacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_mensagens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_mensagens ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_status_custom; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_status_custom ENABLE ROW LEVEL SECURITY;

--
-- Name: leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

--
-- Name: listas_extrator; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listas_extrator ENABLE ROW LEVEL SECURITY;

--
-- Name: mensagens_predefinidas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mensagens_predefinidas ENABLE ROW LEVEL SECURITY;

--
-- Name: meta_conversion_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_conversion_events ENABLE ROW LEVEL SECURITY;

--
-- Name: meta_pixel_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_pixel_config ENABLE ROW LEVEL SECURITY;

--
-- Name: metricas_preferencias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.metricas_preferencias ENABLE ROW LEVEL SECURITY;

--
-- Name: openai_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.openai_config ENABLE ROW LEVEL SECURITY;

--
-- Name: personalizacao_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.personalizacao_config ENABLE ROW LEVEL SECURITY;

--
-- Name: procedimento_profissional; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.procedimento_profissional ENABLE ROW LEVEL SECURITY;

--
-- Name: procedimentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.procedimentos ENABLE ROW LEVEL SECURITY;

--
-- Name: produtos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profissionais; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profissionais ENABLE ROW LEVEL SECURITY;

--
-- Name: stripe_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stripe_config ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscription_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: tipo_agendamento_custom; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tipo_agendamento_custom ENABLE ROW LEVEL SECURITY;

--
-- Name: uazapi_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.uazapi_config ENABLE ROW LEVEL SECURITY;

--
-- Name: user_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_message_dedup; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_message_dedup ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_chat_kanban; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_chat_kanban ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_chat_labels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_chat_labels ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_chats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_chats ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_kanban_columns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_kanban_columns ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_labels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_labels ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_sync_status; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_sync_status ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--




COMMIT;