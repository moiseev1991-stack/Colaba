'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, Search, Plus, Trash2, Edit, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
      <div className="max-w-6xl mx-auto px-4 sm:px-6 overflow-x-hidden">
        <div className="text-center text-gray-600 dark:text-gray-400">Загрузка...</div>
      </div>
    );
  }

  if (error && !isSuperuser) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 overflow-x-hidden">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-[14px] p-4">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 overflow-x-hidden">
      <div className="space-y-6">
        <PageHeader
          breadcrumb={[{ label: 'Главная', href: '/' }, { label: 'Организации' }]}
          title="Организации"
          actions={
            <Button
              onClick={() => setCreateModalOpen(true)}
              variant="default"
            >
              <Plus className="h-4 w-4 mr-2" />
              Создать организацию
            </Button>
          }
        />

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-[14px] p-4">
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {organizations.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-[14px] border border-gray-200 dark:border-gray-700 p-8 text-center">
            <p className="text-gray-500 dark:text-gray-400">Организации не найдены</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {organizations.map((org) => (
              <div
                key={org.id}
                className="bg-white dark:bg-gray-800 rounded-[14px] border border-gray-200 dark:border-gray-700 p-6 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                      {org.name}
                    </h2>
                    <div className="flex gap-6 text-sm text-gray-600 dark:text-gray-400">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        <span>{org.users_count} пользователей</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Search className="h-4 w-4" />
                        <span>{org.searches_count} поисков</span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-500">
                        Создана: {new Date(org.created_at).toLocaleDateString('ru-RU')}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewUsers(org.id)}
                      className="flex items-center gap-2"
                    >
                      <Eye className="h-4 w-4" />
                      Пользователи
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditModal(org)}
                      className="flex items-center gap-2"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(org.id, org.name)}
                      className="flex items-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
          <Button variant="outline" onClick={closeModals} disabled={submitting}>
            Отмена
          </Button>
          <Button onClick={handleCreateOrg} disabled={submitting}>
            {submitting ? 'Создание...' : 'Создать'}
          </Button>
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
          <Button variant="outline" onClick={closeModals} disabled={submitting}>
            Отмена
          </Button>
          <Button onClick={handleEditOrg} disabled={submitting}>
            {submitting ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
