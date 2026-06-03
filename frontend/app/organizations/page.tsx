'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, Search, Plus, Trash2, Edit, Eye } from 'lucide-react';
import { ButtonV2 } from '@/components/ui/ButtonV2';
import { CardV2 } from '@/components/ui/CardV2';
import { Input } from '@/components/ui/input';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { PageHeader } from '@/components/PageHeader';
import {
  listOrganizations,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  type OrganizationWithUsersResponse,
} from '@/src/services/api/organizations';
import { apiClient } from '@/client';
import { useRouter } from 'next/navigation';

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<OrganizationWithUsersResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<OrganizationWithUsersResponse | null>(null);
  const [orgName, setOrgName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const checkSuperuserAndLoad = useCallback(async () => {
    try {
      const userResponse = await apiClient.get('/auth/me');
      const isSuper = userResponse.data.is_superuser || false;
      setIsSuperuser(isSuper);

      if (!isSuper) {
        setError('Доступ запрещен. Только суперадминистраторы могут просматривать организации.');
        setLoading(false);
        return;
      }

      await loadOrganizations();
    } catch (err: any) {
      if (err.response?.status === 403 || err.response?.status === 401) {
        setError('Доступ запрещен. Только суперадминистраторы могут просматривать организации.');
      } else {
        setError('Ошибка при загрузке организаций');
      }
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSuperuserAndLoad();
  }, [checkSuperuserAndLoad]);

  const loadOrganizations = async () => {
    try {
      setLoading(true);
      const data = await listOrganizations();
      setOrganizations(data);
      setError(null);
    } catch (err: any) {
      setError('Ошибка при загрузке организаций');
      console.error('Error loading organizations:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrg = async () => {
    if (!orgName.trim()) {
      alert('Введите название организации');
      return;
    }

    try {
      setSubmitting(true);
      await createOrganization({ name: orgName.trim() });
      setCreateModalOpen(false);
      setOrgName('');
      await loadOrganizations();
    } catch (err: any) {
      alert(`Ошибка при создании организации: ${err.response?.data?.detail || err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditOrg = async () => {
    if (!orgName.trim() || !editingOrg) {
      alert('Введите название организации');
      return;
    }

    try {
      setSubmitting(true);
      await updateOrganization(editingOrg.id, { name: orgName.trim() });
      setEditModalOpen(false);
      setEditingOrg(null);
      setOrgName('');
      await loadOrganizations();
    } catch (err: any) {
      alert(`Ошибка при обновлении организации: ${err.response?.data?.detail || err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const openEditModal = (org: OrganizationWithUsersResponse) => {
    setEditingOrg(org);
    setOrgName(org.name);
    setEditModalOpen(true);
  };

  const closeModals = () => {
    setCreateModalOpen(false);
    setEditModalOpen(false);
    setEditingOrg(null);
    setOrgName('');
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Вы уверены, что хотите удалить организацию "${name}"? Это действие нельзя отменить.`)) {
      return;
    }

    try {
      await deleteOrganization(id);
      await loadOrganizations();
    } catch (err: any) {
      alert(`Ошибка при удалении организации: ${err.response?.data?.detail || err.message}`);
    }
  };

  const handleViewUsers = (id: number) => {
    router.push(`/organizations/${id}/users`);
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 overflow-x-hidden">
        <div className="text-center" style={{ color: 'hsl(var(--muted))' }}>Загрузка...</div>
      </div>
    );
  }

  if (error && !isSuperuser) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 overflow-x-hidden">
        <div
          className="rounded-v2-sm border p-4"
          style={{
            background: 'var(--signal-hot-bg)',
            borderColor: 'rgb(239 68 68 / 0.3)',
            color: 'var(--signal-hot)',
          }}
        >
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 overflow-x-hidden">
      <div className="space-y-6">
        <PageHeader
          breadcrumb={[{ label: 'Главная', href: '/' }, { label: 'Организации' }]}
          title="Организации"
          actions={
            <ButtonV2
              variant="primary"
              size="md"
              onClick={() => setCreateModalOpen(true)}
              iconLeft={<Plus />}
            >
              Создать организацию
            </ButtonV2>
          }
        />

        {error && (
          <div
            className="rounded-v2-sm border p-4"
            style={{
              background: 'var(--signal-hot-bg)',
              borderColor: 'rgb(239 68 68 / 0.3)',
              color: 'var(--signal-hot)',
            }}
          >
            <p>{error}</p>
          </div>
        )}

        {organizations.length === 0 ? (
          <CardV2 className="p-8 text-center">
            <p style={{ color: 'hsl(var(--muted))' }}>Организации не найдены</p>
          </CardV2>
        ) : (
          <div className="reveal-stack grid gap-4">
            {organizations.map((org) => (
              <CardV2 key={org.id} reveal className="p-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <h2
                      className="font-display font-semibold tracking-tight text-2xl mb-4"
                      style={{ color: 'hsl(var(--text))' }}
                    >
                      {org.name}
                    </h2>
                    <div className="flex gap-6 text-sm flex-wrap" style={{ color: 'hsl(var(--muted))' }}>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        <span>{org.users_count} пользователей</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Search className="h-4 w-4" />
                        <span>{org.searches_count} поисков</span>
                      </div>
                      <div className="text-xs" style={{ color: 'hsl(var(--muted))' }}>
                        Создана: {new Date(org.created_at).toLocaleDateString('ru-RU')}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <ButtonV2
                      variant="secondary"
                      size="sm"
                      onClick={() => handleViewUsers(org.id)}
                      iconLeft={<Eye />}
                    >
                      Пользователи
                    </ButtonV2>
                    <ButtonV2
                      variant="secondary"
                      size="sm"
                      onClick={() => openEditModal(org)}
                      iconLeft={<Edit />}
                    >
                      <span className="sr-only">Редактировать</span>
                    </ButtonV2>
                    <ButtonV2
                      variant="danger"
                      size="sm"
                      onClick={() => handleDelete(org.id, org.name)}
                      iconLeft={<Trash2 />}
                    >
                      <span className="sr-only">Удалить</span>
                    </ButtonV2>
                  </div>
                </div>
              </CardV2>
            ))}
          </div>
        )}
      </div>

      {/* Create Organization Modal */}
      <Dialog
        open={createModalOpen}
        onClose={closeModals}
        title="Создать организацию"
      >
        <div className="space-y-4">
          <div>
            <label
              className="block text-sm font-medium mb-1"
              style={{ color: 'hsl(var(--text))' }}
            >
              Название организации
            </label>
            <Input
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Введите название"
              disabled={submitting}
            />
          </div>
        </div>
        <DialogFooter>
          <ButtonV2 variant="secondary" size="md" onClick={closeModals} disabled={submitting}>
            Отмена
          </ButtonV2>
          <ButtonV2 variant="primary" size="md" onClick={handleCreateOrg} loading={submitting}>
            Создать
          </ButtonV2>
        </DialogFooter>
      </Dialog>

      {/* Edit Organization Modal */}
      <Dialog
        open={editModalOpen}
        onClose={closeModals}
        title="Редактировать организацию"
      >
        <div className="space-y-4">
          <div>
            <label
              className="block text-sm font-medium mb-1"
              style={{ color: 'hsl(var(--text))' }}
            >
              Название организации
            </label>
            <Input
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Введите название"
              disabled={submitting}
            />
          </div>
        </div>
        <DialogFooter>
          <ButtonV2 variant="secondary" size="md" onClick={closeModals} disabled={submitting}>
            Отмена
          </ButtonV2>
          <ButtonV2 variant="primary" size="md" onClick={handleEditOrg} loading={submitting}>
            Сохранить
          </ButtonV2>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
