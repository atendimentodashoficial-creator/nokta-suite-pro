import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTabPersistence } from "@/hooks/useTabPersistence";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Users, TrendingUp, Calendar, FileText, LogOut, UserPlus, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown, Pencil, GripVertical, Check, X, Shield, Settings } from "lucide-react";
import { AdminNotificationsConfig } from "@/components/admin/AdminNotificationsConfig";
import { AdminInstanceManager } from "@/components/admin/AdminInstanceManager";
import { UserPermissionsDialog } from "@/components/admin/UserPermissionsDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
interface Metrics {
  totalUsers: number;
  totalLeads: number;
  totalClientes: number;
  totalAgendamentos: number;
  totalFaturas: number;
  totalFaturasFechadas: number;
  totalFaturasNegociacao: number;
  totalAuthUsers: number;
}
interface User {
  id: string;
  email: string;
  created_at: string;
  banned_until?: string;
  user_metadata?: {
    full_name?: string;
    display_order?: number;
  };
  leadsCount?: number;
  faturasCount?: number;
  faturasCountFechadas?: number;
  faturasCountNegociacao?: number;
  agendamentosCount?: number;
  totalFaturado?: number;
  totalPago?: number;
  emNegociacao?: number;
}
interface WeekdayData {
  day: string;
  leads: number;
  agendamentos: number;
  faturamentoAberto: number;
  faturamentoFechado: number;
}
interface DailyData {
  date: string;
  leads: number;
  agendamentos: number;
  faturamentoAberto: number;
  faturamentoFechado: number;
}
type SortField = 'email' | 'created_at' | 'leadsCount' | 'agendamentosCount' | 'faturasCount' | 'totalFaturado' | 'emNegociacao' | 'totalPago' | 'status';
type SortDirection = 'asc' | 'desc';

// Função para obter o primeiro dia do mês atual
const getFirstDayOfCurrentMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
};

// Função para obter o último dia do mês atual
const getLastDayOfCurrentMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
};

// Função para obter o primeiro dia do mês passado
const getFirstDayOfLastMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
};

// Função para obter o último dia do mês passado
const getLastDayOfLastMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
};
type PeriodPreset = 'current_month' | 'last_month' | 'custom';
// Componente para card arrastável
interface SortableUserCardProps {
  user: User;
  onEdit: (userId: string, currentName: string) => void;
  onBlock: (userId: string) => void;
  onUnblock: (userId: string) => void;
  onLogin: (email: string) => void;
  onPermissions: (userId: string, userName: string) => void;
}

// Componente para linha de tabela arrastável (desktop)
interface SortableUserRowProps extends SortableUserCardProps {}

const SortableUserRow = ({ user, onEdit, onBlock, onUnblock, onLogin, onPermissions }: SortableUserRowProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: user.id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const expiryDate = (user.user_metadata as any)?.expiry_date;
  const isExpired = expiryDate && new Date(expiryDate) < new Date();
  const displayName = user.user_metadata?.full_name || user.email;

  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell className="w-8 px-2">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none p-1">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      </TableCell>
      <TableCell className="font-medium">
        <div>
          <span>{displayName}</span>
          {user.user_metadata?.full_name && (
            <span className="text-xs text-muted-foreground block">{user.email}</span>
          )}
        </div>
      </TableCell>
      <TableCell>{new Date(user.created_at).toLocaleDateString('pt-BR')}</TableCell>
      <TableCell>{user.leadsCount || 0}</TableCell>
      <TableCell>{user.agendamentosCount || 0}</TableCell>
      <TableCell>
        {user.faturasCount || 0}{' '}
        (<span className="text-[#fba82d]">{user.faturasCountNegociacao || 0}</span>/<span className="text-[#00b312]">{user.faturasCountFechadas || 0}</span>)
      </TableCell>
      <TableCell>
        {new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL'
        }).format(user.totalFaturado || 0)}
      </TableCell>
      <TableCell className="text-[#fba82d]">
        {new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL'
        }).format(user.emNegociacao || 0)}
      </TableCell>
      <TableCell className="text-[#00b312]">
        {new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL'
        }).format(user.totalPago || 0)}
      </TableCell>
      <TableCell>
        {user.banned_until ? (
          <Badge variant="destructive" className="cursor-pointer hover:opacity-80" onClick={() => onUnblock(user.id)} title="Clique para ativar">
            Inativo
          </Badge>
        ) : isExpired ? (
          <Badge variant="secondary">Expirado</Badge>
        ) : (
          <Badge variant="default" className="cursor-pointer hover:opacity-80" onClick={() => onBlock(user.id)} title="Clique para inativar">
            Ativo
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => onEdit(user.id, user.user_metadata?.full_name || '')} title="Editar nome">
            <Pencil className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onPermissions(user.id, displayName)} title="Gerenciar permissões">
            <Shield className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onLogin(user.email)} title="Acessar como este usuário">
            <ExternalLink className="w-4 h-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
};

const SortableUserCard = ({ user, onEdit, onBlock, onUnblock, onLogin, onPermissions }: SortableUserCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: user.id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const expiryDate = (user.user_metadata as any)?.expiry_date;
  const isExpired = expiryDate && new Date(expiryDate) < new Date();
  const displayName = user.user_metadata?.full_name || user.email;

  return (
    <Card ref={setNodeRef} style={style} className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none">
              <GripVertical className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base truncate">{displayName}</CardTitle>
              {user.user_metadata?.full_name && (
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={() => onPermissions(user.id, displayName)} className="h-8 w-8" title="Permissões">
              <Shield className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onEdit(user.id, user.user_metadata?.full_name || '')} className="h-8 w-8" title="Editar nome">
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <CardDescription className="text-xs">
              Criado em {new Date(user.created_at).toLocaleDateString('pt-BR')}
            </CardDescription>
            <div>
              {user.banned_until ? (
                <Badge variant="destructive" className="cursor-pointer hover:opacity-80" onClick={() => onUnblock(user.id)}>
                  Inativo
                </Badge>
              ) : isExpired ? (
                <Badge variant="secondary">Expirado</Badge>
              ) : (
                <Badge variant="default" className="cursor-pointer hover:opacity-80" onClick={() => onBlock(user.id)}>
                  Ativo
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Leads</p>
            <p className="font-medium">{user.leadsCount || 0}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Agendamentos</p>
            <p className="font-medium">{user.agendamentosCount || 0}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Faturas</p>
            <p className="font-medium">
              {user.faturasCount || 0}{' '}
              (<span className="text-[#fba82d]">{user.faturasCountNegociacao || 0}</span>/<span className="text-[#00b312]">{user.faturasCountFechadas || 0}</span>)
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Previsto</p>
            <p className="font-medium">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(user.totalFaturado || 0)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Negociação</p>
            <p className="font-medium text-[#fba82d]">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(user.emNegociacao || 0)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Pago</p>
            <p className="font-medium text-[#00b312]">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(user.totalPago || 0)}
            </p>
          </div>
        </div>
        
        <div className="border-t pt-[18px]">
          <Button variant="outline" size="sm" onClick={() => onLogin(user.email)} className="w-full pt-[2px]">
            <ExternalLink className="w-4 h-4 mr-2" />
            Acessar como usuário
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [activeAdminTab, setActiveAdminTab] = useTabPersistence("tab", "metrics");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserExpiryDate, setNewUserExpiryDate] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [weekdayData, setWeekdayData] = useState<WeekdayData[]>([]);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('current_month');
  const [startDate, setStartDate] = useState<string>(getFirstDayOfCurrentMonth());
  const [endDate, setEndDate] = useState<string>(getLastDayOfCurrentMonth());
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  
  // Estados para edição de nome
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingPassword, setEditingPassword] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  
  // Estados para permissões
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [selectedUserForPermissions, setSelectedUserForPermissions] = useState<{ id: string; name: string } | null>(null);

  // Trigger para recarregar instâncias no AdminNotificationsConfig quando uma nova for criada
  const [instancesRefreshTrigger, setInstancesRefreshTrigger] = useState(0);
  const handleInstancesChange = () => {
    setInstancesRefreshTrigger(prev => prev + 1);
  };

  // Sensores para drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Ordenar usuários
  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      let aValue: any;
      let bValue: any;
      switch (sortField) {
        case 'email':
          aValue = a.email?.toLowerCase() || '';
          bValue = b.email?.toLowerCase() || '';
          break;
        case 'created_at':
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
          break;
        case 'leadsCount':
          aValue = a.leadsCount || 0;
          bValue = b.leadsCount || 0;
          break;
        case 'agendamentosCount':
          aValue = a.agendamentosCount || 0;
          bValue = b.agendamentosCount || 0;
          break;
        case 'faturasCount':
          aValue = a.faturasCount || 0;
          bValue = b.faturasCount || 0;
          break;
        case 'totalFaturado':
          aValue = a.totalFaturado || 0;
          bValue = b.totalFaturado || 0;
          break;
        case 'emNegociacao':
          aValue = a.emNegociacao || 0;
          bValue = b.emNegociacao || 0;
          break;
        case 'totalPago':
          aValue = a.totalPago || 0;
          bValue = b.totalPago || 0;
          break;
        case 'status':
          aValue = a.banned_until ? 1 : 0;
          bValue = b.banned_until ? 1 : 0;
          break;
        default:
          return 0;
      }
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [users, sortField, sortDirection]);
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };
  const SortIcon = ({
    field
  }: {
    field: SortField;
  }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground" />;
    }
    return sortDirection === 'asc' ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />;
  };
  // Atualizar datas quando o preset mudar
  const handlePeriodPresetChange = (preset: PeriodPreset) => {
    setPeriodPreset(preset);
    if (preset === 'current_month') {
      setStartDate(getFirstDayOfCurrentMonth());
      setEndDate(getLastDayOfCurrentMonth());
    } else if (preset === 'last_month') {
      setStartDate(getFirstDayOfLastMonth());
      setEndDate(getLastDayOfLastMonth());
    }
    // Para 'custom', mantém as datas atuais
  };
  useEffect(() => {
    const adminToken = localStorage.getItem('admin_token');
    if (!adminToken) {
      navigate('/admin/login');
      return;
    }
    loadData();
  }, [navigate, selectedUserId, startDate, endDate]);
  const loadData = async () => {
    try {
      const adminToken = localStorage.getItem('admin_token');

      // Construir URL com filtros
      const params = new URLSearchParams();
      if (selectedUserId) params.append('user_id', selectedUserId);
      if (startDate) params.append('start_date', new Date(startDate).toISOString());
      if (endDate) params.append('end_date', new Date(endDate).toISOString());
      const queryString = params.toString() ? `?${params.toString()}` : '';

      // Carregar métricas
      const {
        data: metricsData,
        error: metricsError
      } = await supabase.functions.invoke(`admin-metrics${queryString}`, {
        headers: {
          Authorization: `Bearer ${adminToken}`
        }
      });
      if (metricsError) throw metricsError;
      setMetrics(metricsData.metrics);

      // Usar recentUsers retornado pelas métricas que já inclui estatísticas
      // Ordenar por display_order se existir
      const usersData = metricsData.metrics.recentUsers || [];
      const orderedUsers = usersData.sort((a: User, b: User) => {
        const orderA = a.user_metadata?.display_order ?? 9999;
        const orderB = b.user_metadata?.display_order ?? 9999;
        return orderA - orderB;
      });
      setUsers(orderedUsers);

      // Usar dados de weekday e daily retornados pelas métricas
      setWeekdayData(metricsData.metrics.weekdayData || []);
      setDailyData(metricsData.metrics.dailyData || []);
    } catch (error: any) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setIsLoading(false);
    }
  };
  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    navigate('/admin/login');
    toast.success('Logout realizado');
  };
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      const adminToken = localStorage.getItem('admin_token');
      const {
        data,
        error
      } = await supabase.functions.invoke('admin-manage-users', {
        body: {
          action: 'create',
          email: newUserEmail,
          password: newUserPassword,
          fullName: newUserName,
          expiryDate: newUserExpiryDate || null
        },
        headers: {
          Authorization: `Bearer ${adminToken}`
        }
      });
      if (error) throw error;
      toast.success('Usuário criado com sucesso!');
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserName("");
      setNewUserExpiryDate("");
      setDialogOpen(false);
      loadData();
    } catch (error: any) {
      console.error('Erro ao criar usuário:', error);
      toast.error(error.message || 'Erro ao criar usuário');
    } finally {
      setIsCreating(false);
    }
  };
  const handleBlockUser = async (userId: string) => {
    try {
      const adminToken = localStorage.getItem('admin_token');
      const {
        error
      } = await supabase.functions.invoke('admin-manage-users', {
        body: {
          action: 'block',
          userId
        },
        headers: {
          Authorization: `Bearer ${adminToken}`
        }
      });
      if (error) throw error;
      toast.success('Usuário bloqueado');
      loadData();
    } catch (error: any) {
      console.error('Erro ao bloquear usuário:', error);
      toast.error('Erro ao bloquear usuário');
    }
  };
  const handleUnblockUser = async (userId: string) => {
    try {
      const adminToken = localStorage.getItem('admin_token');
      const {
        error
      } = await supabase.functions.invoke('admin-manage-users', {
        body: {
          action: 'unblock',
          userId
        },
        headers: {
          Authorization: `Bearer ${adminToken}`
        }
      });
      if (error) throw error;
      toast.success('Usuário desbloqueado');
      loadData();
    } catch (error: any) {
      console.error('Erro ao desbloquear usuário:', error);
      toast.error('Erro ao desbloquear usuário');
    }
  };
  
  // Função para abrir dialog de edição de nome
  const handleOpenEditDialog = (userId: string, currentName: string) => {
    setEditingUserId(userId);
    setEditingName(currentName);
    setEditingPassword("");
    setEditDialogOpen(true);
  };

  // Função para salvar nome editado
  const handleSaveUserEdit = async () => {
    if (!editingUserId) return;
    
    try {
      const adminToken = localStorage.getItem('admin_token');
      
      // Update name
      const { error } = await supabase.functions.invoke('admin-manage-users', {
        body: {
          action: 'update_name',
          userId: editingUserId,
          fullName: editingName
        },
        headers: {
          Authorization: `Bearer ${adminToken}`
        }
      });
      if (error) throw error;

      // Update password if provided
      if (editingPassword.trim()) {
        const { error: pwError } = await supabase.functions.invoke('admin-manage-users', {
          body: {
            action: 'update_password',
            userId: editingUserId,
            password: editingPassword.trim()
          },
          headers: {
            Authorization: `Bearer ${adminToken}`
          }
        });
        if (pwError) throw pwError;
      }

      toast.success('Dados atualizados com sucesso!');
      setEditDialogOpen(false);
      setEditingUserId(null);
      setEditingName("");
      setEditingPassword("");
      loadData();
    } catch (error: any) {
      console.error('Erro ao atualizar dados:', error);
      toast.error('Erro ao atualizar dados');
    }
  };

  // Função para lidar com drag and drop
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = users.findIndex(u => u.id === active.id);
      const newIndex = users.findIndex(u => u.id === over.id);
      
      const newOrder = arrayMove(users, oldIndex, newIndex);
      setUsers(newOrder);
      
      // Atualizar a ordem no backend
      const adminToken = localStorage.getItem('admin_token');
      
      try {
        // Atualizar a ordem de cada usuário afetado
        await Promise.all(newOrder.map((user, index) => 
          supabase.functions.invoke('admin-manage-users', {
            body: {
              action: 'update_order',
              userId: user.id,
              displayOrder: index
            },
            headers: {
              Authorization: `Bearer ${adminToken}`
            }
          })
        ));
        
        // Atualizar também no localStorage para o switcher
        const usersForSwitcher = newOrder.map(u => ({
          id: u.id,
          email: u.email,
          user_metadata: { ...u.user_metadata, display_order: newOrder.findIndex(x => x.id === u.id) }
        }));
        localStorage.setItem('admin_users_list', JSON.stringify(usersForSwitcher));
        
        toast.success('Ordem atualizada!');
      } catch (error) {
        console.error('Erro ao atualizar ordem:', error);
        toast.error('Erro ao salvar nova ordem');
        loadData(); // Recarregar ordem original em caso de erro
      }
    }
  };

  const handleLoginAsUser = async (userEmail: string) => {
    try {
      const adminToken = localStorage.getItem('admin_token');
      
      // Salvar a lista de usuários para o switcher no sidebar
      const usersForSwitcher = users.map((u, index) => ({
        id: u.id,
        email: u.email,
        user_metadata: { ...u.user_metadata, display_order: index }
      }));
      localStorage.setItem('admin_users_list', JSON.stringify(usersForSwitcher));
      
      const {
        data,
        error
      } = await supabase.functions.invoke('admin-manage-users', {
        body: {
          action: 'generate_link',
          email: userEmail
        },
        headers: {
          Authorization: `Bearer ${adminToken}`
        }
      });
      if (error) throw error;
      if (data?.link) {
        // Para mobile, usar window.open que é mais compatível
        // Fallback para location.href se window.open falhar (bloqueado por popup blocker)
        const newWindow = window.open(data.link, '_blank', 'noopener,noreferrer');
        if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
          // Popup foi bloqueado ou não suportado, usar redirecionamento direto
          window.location.href = data.link;
        }
        toast.success('Link de acesso gerado! Abrindo...');
      } else {
        toast.error('Não foi possível gerar o link de acesso');
      }
    } catch (error: any) {
      console.error('Erro ao gerar link de acesso:', error);
      toast.error('Erro ao gerar link de acesso');
    }
  };
  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">
        <p>Carregando...</p>
      </div>;
  }
  return <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Painel Administrativo</h1>
          <Button variant="ghost" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Sair
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs value={activeAdminTab} onValueChange={setActiveAdminTab} className="w-full">
          <TabsList className="h-8 mx-auto mb-8">
            <TabsTrigger value="metrics" className="text-xs px-3 h-7">Métricas</TabsTrigger>
            <TabsTrigger value="dashboard" className="text-xs px-3 h-7">Dashboard</TabsTrigger>
            <TabsTrigger value="settings" className="text-xs px-3 h-7">
              <Settings className="h-3 w-3 mr-1" />
              Configurações
            </TabsTrigger>
          </TabsList>

          {/* Aba Métricas - Informações Gerais */}
          <TabsContent value="metrics" className="space-y-8">
            {/* Filtros */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Filtrar por Usuário</CardTitle>
                </CardHeader>
                <CardContent>
                  <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    <option value="">Todos os usuários</option>
                    {users.map(user => <option key={user.id} value={user.id}>
                        {user.email}
                      </option>)}
                  </select>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Período</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <select value={periodPreset} onChange={e => handlePeriodPresetChange(e.target.value as PeriodPreset)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    <option value="current_month">Mês Atual</option>
                    <option value="last_month">Mês Passado</option>
                    <option value="custom">Personalizado</option>
                  </select>
                  {periodPreset === 'custom' && <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="metrics-start-date" className="text-xs">Início</Label>
                        <Input id="metrics-start-date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-9" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="metrics-end-date" className="text-xs">Fim</Label>
                        <Input id="metrics-end-date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-9" />
                      </div>
                    </div>}
                </CardContent>
              </Card>
            </div>

            {/* Métricas Gerais */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Usuários Ativos</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metrics?.totalAuthUsers || 0}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Leads</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metrics?.totalLeads || 0}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Agendamentos</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metrics?.totalAgendamentos || 0}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Faturas</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metrics?.totalFaturas || 0}</div>
                </CardContent>
              </Card>
            </div>

            {/* Gestão de Usuários */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Gestão de Usuários</CardTitle>
                    
                  </div>
                  <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <UserPlus className="w-4 h-4 mr-2" />
                        Novo Usuário
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Criar Novo Usuário</DialogTitle>
                        <DialogDescription>
                          Preencha os dados para criar um novo usuário
                        </DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleCreateUser} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="name">Nome Completo</Label>
                          <Input id="name" value={newUserName} onChange={e => setNewUserName(e.target.value)} required disabled={isCreating} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="email">Email</Label>
                          <Input id="email" type="email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} required disabled={isCreating} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="password">Senha</Label>
                          <Input id="password" type="password" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} required disabled={isCreating} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="expiry">Data de Expiração (opcional)</Label>
                          <Input id="expiry" type="date" value={newUserExpiryDate} onChange={e => setNewUserExpiryDate(e.target.value)} disabled={isCreating} min={new Date().toISOString().split('T')[0]} />
                          <p className="text-xs text-muted-foreground">
                            Deixe em branco para acesso ilimitado
                          </p>
                        </div>
                        <Button type="submit" className="w-full" disabled={isCreating}>
                          {isCreating ? "Criando..." : "Criar Usuário"}
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
            {/* Versão Desktop - Tabela com Drag and Drop */}
            {!isMobile && (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={sortedUsers.map(u => u.id)} strategy={verticalListSortingStrategy}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8 px-2"></TableHead>
                        <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('email')}>
                          <div className="flex items-center">Email<SortIcon field="email" /></div>
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('created_at')}>
                          <div className="flex items-center">Data de Criação<SortIcon field="created_at" /></div>
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('leadsCount')}>
                          <div className="flex items-center">Leads<SortIcon field="leadsCount" /></div>
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('agendamentosCount')}>
                          <div className="flex items-center">Agendamentos<SortIcon field="agendamentosCount" /></div>
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('faturasCount')}>
                          <div className="flex items-center">Faturas<SortIcon field="faturasCount" /></div>
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('totalFaturado')}>
                          <div className="flex items-center">Previsto<SortIcon field="totalFaturado" /></div>
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('emNegociacao')}>
                          <div className="flex items-center">Negociação<SortIcon field="emNegociacao" /></div>
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('totalPago')}>
                          <div className="flex items-center">Pago<SortIcon field="totalPago" /></div>
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('status')}>
                          <div className="flex items-center">Status<SortIcon field="status" /></div>
                        </TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedUsers.map(user => (
                        <SortableUserRow 
                          key={user.id} 
                          user={user}
                          onEdit={handleOpenEditDialog}
                          onBlock={handleBlockUser}
                          onUnblock={handleUnblockUser}
                          onLogin={handleLoginAsUser}
                          onPermissions={(userId, userName) => {
                            setSelectedUserForPermissions({ id: userId, name: userName });
                            setPermissionsDialogOpen(true);
                          }}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </SortableContext>
              </DndContext>
            )}

            {/* Versão Mobile - Cards com Drag and Drop */}
            {isMobile && (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={sortedUsers.map(u => u.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-4">
                    {sortedUsers.map(user => (
                      <SortableUserCard 
                        key={user.id} 
                        user={user}
                        onEdit={handleOpenEditDialog}
                        onBlock={handleBlockUser}
                        onUnblock={handleUnblockUser}
                        onLogin={handleLoginAsUser}
                        onPermissions={(userId, userName) => {
                          setSelectedUserForPermissions({ id: userId, name: userName });
                          setPermissionsDialogOpen(true);
                        }}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </CardContent>
        </Card>

        {/* Dialog para Editar Cliente */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Cliente</DialogTitle>
              <DialogDescription>
                Altere o nome e/ou a senha do cliente
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nome</Label>
                <Input 
                  id="edit-name" 
                  value={editingName} 
                  onChange={e => setEditingName(e.target.value)} 
                  placeholder="Nome do cliente"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-password">Nova Senha</Label>
                <Input 
                  id="edit-password" 
                  type="password"
                  value={editingPassword} 
                  onChange={e => setEditingPassword(e.target.value)} 
                  placeholder="Deixe vazio para manter a senha atual"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSaveUserEdit}>
                  Salvar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog para Permissões */}
        {selectedUserForPermissions && (
          <UserPermissionsDialog
            open={permissionsDialogOpen}
            onOpenChange={setPermissionsDialogOpen}
            userId={selectedUserForPermissions.id}
            userName={selectedUserForPermissions.name}
          />
        )}
      </TabsContent>

      {/* Aba Dashboard - Filtros e Gráficos */}
      <TabsContent value="dashboard" className="space-y-8">
        {/* Filtros */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Filtrar por Usuário</CardTitle>
            </CardHeader>
            <CardContent>
              <select id="user-filter" value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                <option value="">Todos os usuários</option>
                {users.map(user => <option key={user.id} value={user.id}>
                    {user.email}
                  </option>)}
              </select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Período</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <select value={periodPreset} onChange={e => handlePeriodPresetChange(e.target.value as PeriodPreset)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                <option value="current_month">Mês Atual</option>
                <option value="last_month">Mês Passado</option>
                <option value="custom">Personalizado</option>
              </select>
              {periodPreset === 'custom' && <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="dashboard-start-date" className="text-xs">Início</Label>
                    <Input id="dashboard-start-date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="dashboard-end-date" className="text-xs">Fim</Label>
                    <Input id="dashboard-end-date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-9" />
                  </div>
                </div>}
            </CardContent>
          </Card>
        </div>

        {/* Gráficos de Evolução Diária */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Evolução Diária de Leads</CardTitle>
              <CardDescription>Período selecionado</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "var(--radius)"
                    }} />
                  <Line type="monotone" dataKey="leads" stroke="hsl(var(--primary))" strokeWidth={2} name="Leads" dot={{
                      fill: "hsl(var(--primary))",
                      r: 4
                    }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Evolução Diária de Agendamentos</CardTitle>
              <CardDescription>Período selecionado</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "var(--radius)"
                    }} />
                  <Line type="monotone" dataKey="agendamentos" stroke="hsl(var(--accent))" strokeWidth={2} name="Agendamentos" dot={{
                      fill: "hsl(var(--accent))",
                      r: 4
                    }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Evolução Diária de Faturamento</CardTitle>
              <CardDescription>Período selecionado</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "var(--radius)"
                    }} formatter={(value: number) => [`R$ ${value.toFixed(2)}`]} />
                  <Line type="monotone" dataKey="faturamentoAberto" stroke="#f59e0b" strokeWidth={2} name="Em Aberto" dot={{
                      fill: "#f59e0b",
                      r: 4
                    }} />
                  <Line type="monotone" dataKey="faturamentoFechado" stroke="#10b981" strokeWidth={2} name="Fechado" dot={{
                      fill: "#10b981",
                      r: 4
                    }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Gráficos por Dia da Semana */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Captação de Leads por Dia da Semana</CardTitle>
              <CardDescription>Últimos 30 dias</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={weekdayData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "var(--radius)"
                    }} formatter={(value: number, name: string) => {
                      if (name.includes('Faturamento')) {
                        return [`R$ ${value.toFixed(2)}`, name];
                      }
                      return [value, name];
                    }} />
                  <Bar dataKey="leads" fill="hsl(var(--primary))" name="Leads" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="faturamentoAberto" fill="#f59e0b" name="Faturamento em Aberto (R$)" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="faturamentoFechado" fill="#10b981" name="Faturamento Fechado (R$)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Novos Agendamentos por Dia da Semana</CardTitle>
              <CardDescription>Últimos 30 dias</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={weekdayData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "var(--radius)"
                    }} formatter={(value: number, name: string) => {
                      if (name.includes('Faturamento')) {
                        return [`R$ ${value.toFixed(2)}`, name];
                      }
                      return [value, name];
                    }} />
                  <Bar dataKey="agendamentos" fill="hsl(var(--accent))" name="Agendamentos" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="faturamentoAberto" fill="#f59e0b" name="Faturamento em Aberto (R$)" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="faturamentoFechado" fill="#10b981" name="Faturamento Fechado (R$)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

          {/* Aba Configurações */}
          <TabsContent value="settings" className="space-y-6">
            <AdminInstanceManager onInstancesChange={handleInstancesChange} />
            <AdminNotificationsConfig 
              users={users} 
              isActive={activeAdminTab === "settings"} 
              instancesRefreshTrigger={instancesRefreshTrigger}
            />
          </TabsContent>
    </Tabs>
  </main>
    </div>;
}