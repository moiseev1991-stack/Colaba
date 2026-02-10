'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, Search, Plus, Trash2, Edit, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import {
  listOrganizations,
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

  const checkSuperuserAndLoad = useCallback(async () => {
    try {
      // Check if user is superuser
      const userResponse = await apiClient.get('/auth/me');
      const isSuper = userResponse.data.is_superuser || false;
      setIsSuperuser(isSuper);

      if (!isSuper) {
        setError('Доступ запрещен. Только суперадминистраторы могут просматривать организации.');
        setLoading(false);
        return;
      }

      // Load organizations
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
              onClick={() => {
                // TODO: Open create organization modal
                alert('Функция создания организации будет добавлена');
              }}
              variant="default"
            >
              <Plus className="h-4 w-4 mr-2" />
              Создать организацию
            </Button>
          }
        />


        {/* Error message */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-[14px] p-4">
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Organizations list */}
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
                      onClick={() => {
                        // TODO: Open edit modal
                        alert('Функция редактирования будет добавлена');
                      }}
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
    </div>
  );
}
