'use client';

import { useState, useEffect } from 'react';
import { UserPlus, Trash2, ArrowLeft, UserCheck, User, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import {
  getOrganizationUsers,
  addUserToOrganization,
  updateUserRole,
  removeUserFromOrganization,
  getOrganization,
  type UserOrganizationResponse,
  type OrganizationResponse,
  OrganizationRole,
} from '@/src/services/api/organizations';
import { apiClient } from '@/client';
import { useRouter, useParams } from 'next/navigation';

export default function OrganizationUsersPage() {
  const params = useParams();
  const organizationId = parseInt(params.id as string);
  const router = useRouter();

  const [organization, setOrganization] = useState<OrganizationResponse | null>(null);
  const [users, setUsers] = useState<UserOrganizationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [newUserRole, setNewUserRole] = useState<OrganizationRole>(OrganizationRole.MEMBER);

  useEffect(() => {
    loadData();
  }, [organizationId]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Check if user is superuser or has admin access (401/403 → catch)
      await apiClient.get('/auth/me');

      // Load organization and users
      const [orgData, usersData] = await Promise.all([
        getOrganization(organizationId),
        getOrganizationUsers(organizationId),
      ]);

      setOrganization(orgData);
      setUsers(usersData);
      setError(null);
    } catch (err: any) {
      if (err.response?.status === 403 || err.response?.status === 401) {
        setError('Доступ запрещен. Только администраторы организации могут управлять пользователями.');
      } else if (err.response?.status === 404) {
        setError('Организация не найдена');
      } else {
        setError('Ошибка при загрузке данных');
      }
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async () => {
    if (!newUserId || !newUserRole) {
      alert('Пожалуйста, заполните все поля');
      return;
    }

    try {
      await addUserToOrganization(organizationId, {
        user_id: parseInt(newUserId),
        role: newUserRole,
      });
      setNewUserId('');
      setNewUserRole(OrganizationRole.MEMBER);
      setShowAddUser(false);
      await loadData();
    } catch (err: any) {
      alert(`Ошибка при добавлении пользователя: ${err.response?.data?.detail || err.message}`);
    }
  };

  const handleUpdateRole = async (userId: number, newRole: OrganizationRole) => {
    try {
      await updateUserRole(organizationId, userId, { role: newRole });
      await loadData();
    } catch (err: any) {
      alert(`Ошибка при обновлении роли: ${err.response?.data?.detail || err.message}`);
    }
  };

  const handleRemoveUser = async (userId: number) => {
    if (!confirm('Вы уверены, что хотите удалить пользователя из организации?')) {
      return;
    }

    try {
      await removeUserFromOrganization(organizationId, userId);
      await loadData();
    } catch (err: any) {
      alert(`Ошибка при удалении пользователя: ${err.response?.data?.detail || err.message}`);
    }
  };

  const getRoleIcon = (role: OrganizationRole) => {
    switch (role) {
      case OrganizationRole.OWNER:
        return <Shield className="h-4 w-4 text-yellow-600" />;
      case OrganizationRole.ADMIN:
        return <UserCheck className="h-4 w-4 text-blue-600" />;
      case OrganizationRole.MEMBER:
        return <User className="h-4 w-4 text-gray-600" />;
    }
  };

  const getRoleLabel = (role: OrganizationRole) => {
    switch (role) {
      case OrganizationRole.OWNER:
        return 'Владелец';
      case OrganizationRole.ADMIN:
        return 'Администратор';
      case OrganizationRole.MEMBER:
        return 'Участник';
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 overflow-x-hidden">
        <div className="text-center text-gray-600 dark:text-gray-400">Загрузка...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 overflow-x-hidden">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-[14px] p-4">
          <p className="text-red-800 dark:text-red-200">{error}</p>
          <Button onClick={() => router.push('/organizations')} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Назад к организациям
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 overflow-x-hidden">
      <div className="space-y-6">
        <PageHeader
          breadcrumb={[
            { label: 'Главная', href: '/' },
            { label: 'Организации', href: '/organizations' },
            { label: organization?.name ?? 'Организация', href: undefined },
          ]}
          title={organization ? `Пользователи: ${organization.name}` : 'Пользователи организации'}
          actions={
            <Button onClick={() => setShowAddUser(!showAddUser)} variant="default" size="sm">
              <UserPlus className="h-4 w-4 mr-2" />
              Добавить пользователя
            </Button>
          }
        />

        {/* Add user form */}
        {showAddUser && (
          <div className="bg-white dark:bg-gray-800 rounded-[14px] border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Добавить пользователя
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  ID пользователя
                </label>
                <input
                  type="number"
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                  className="w-full h-9 px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-[10px] bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Введите ID пользователя"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Роль
                </label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as OrganizationRole)}
                  className="w-full h-9 px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-[10px] bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value={OrganizationRole.MEMBER}>Участник</option>
                  <option value={OrganizationRole.ADMIN}>Администратор</option>
                  <option value={OrganizationRole.OWNER}>Владелец</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleAddUser} className="bg-red-600 hover:bg-red-700 text-white">
                  Добавить
                </Button>
                <Button variant="outline" onClick={() => setShowAddUser(false)}>
                  Отмена
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Users list */}
        {users.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-[14px] border border-gray-200 dark:border-gray-700 p-8 text-center">
            <p className="text-gray-500 dark:text-gray-400">Пользователи не найдены</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-[14px] border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    ID пользователя
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Роль
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Дата добавления
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {users.map((user) => (
                  <tr key={`${user.user_id}-${user.organization_id}`} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {user.user_id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getRoleIcon(user.role)}
                        <span className="text-sm text-gray-900 dark:text-white">
                          {getRoleLabel(user.role)}
                        </span>
                        <select
                          value={user.role}
                          onChange={(e) =>
                            handleUpdateRole(user.user_id, e.target.value as OrganizationRole)
                          }
                          className="ml-2 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          <option value={OrganizationRole.MEMBER}>Участник</option>
                          <option value={OrganizationRole.ADMIN}>Администратор</option>
                          <option value={OrganizationRole.OWNER}>Владелец</option>
                        </select>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {new Date(user.created_at).toLocaleDateString('ru-RU')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveUser(user.user_id)}
                        className="text-saas-danger hover:text-saas-danger-hover hover:bg-saas-danger-weak dark:hover:bg-saas-danger-weak"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
