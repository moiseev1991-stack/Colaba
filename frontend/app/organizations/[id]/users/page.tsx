'use client';

import { useState, useEffect, useCallback } from 'react';
import { UserPlus, Trash2, ArrowLeft, UserCheck, User, Shield } from 'lucide-react';
import { ButtonV2 } from '@/components/ui/ButtonV2';
import { CardV2 } from '@/components/ui/CardV2';
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

// §4.17 ТЗ редизайна 2026-06-03 (Phase C batch 5): пользователи организации на v2.

const SELECT_CLS =
  'w-full h-9 px-3 py-2 border rounded-v2-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500';
const SELECT_STYLE = {
  background: 'hsl(var(--surface))',
  borderColor: 'hsl(var(--border))',
  color: 'hsl(var(--text))',
} as const;

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

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      await apiClient.get('/auth/me');
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
  }, [organizationId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  // §4.17: иконки ролей на signal-токенах вместо tailwind palette
  const getRoleIcon = (role: OrganizationRole) => {
    switch (role) {
      case OrganizationRole.OWNER:
        return <Shield className="h-4 w-4" style={{ color: 'var(--signal-warm)' }} />;
      case OrganizationRole.ADMIN:
        return <UserCheck className="h-4 w-4" style={{ color: 'var(--signal-cool)' }} />;
      case OrganizationRole.MEMBER:
        return <User className="h-4 w-4" style={{ color: 'hsl(var(--muted))' }} />;
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 overflow-x-hidden">
        <div className="text-center" style={{ color: 'hsl(var(--muted))' }}>Загрузка...</div>
      </div>
    );
  }

  if (error) {
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
          <div className="mt-4 inline-block">
            <ButtonV2
              variant="primary"
              size="md"
              onClick={() => router.push('/organizations')}
              iconLeft={<ArrowLeft />}
            >
              Назад к организациям
            </ButtonV2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 overflow-x-hidden">
      <div className="space-y-6">
        <PageHeader
          breadcrumb={[
            { label: 'Главная', href: '/' },
            { label: 'Организации', href: '/organizations' },
            { label: organization?.name ?? 'Организация', href: undefined },
          ]}
          title={organization ? `Пользователи: ${organization.name}` : 'Пользователи организации'}
          actions={
            <ButtonV2
              variant="primary"
              size="sm"
              onClick={() => setShowAddUser(!showAddUser)}
              iconLeft={<UserPlus />}
            >
              Добавить пользователя
            </ButtonV2>
          }
        />

        {/* Add user form */}
        {showAddUser && (
          <CardV2 className="p-6">
            <h3
              className="font-display font-semibold tracking-tight text-lg mb-4"
              style={{ color: 'hsl(var(--text))' }}
            >
              Добавить пользователя
            </h3>
            <div className="space-y-4">
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: 'hsl(var(--text))' }}
                >
                  ID пользователя
                </label>
                <input
                  type="number"
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                  className={SELECT_CLS}
                  style={SELECT_STYLE}
                  placeholder="Введите ID пользователя"
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: 'hsl(var(--text))' }}
                >
                  Роль
                </label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as OrganizationRole)}
                  className={SELECT_CLS}
                  style={SELECT_STYLE}
                >
                  <option value={OrganizationRole.MEMBER}>Участник</option>
                  <option value={OrganizationRole.ADMIN}>Администратор</option>
                  <option value={OrganizationRole.OWNER}>Владелец</option>
                </select>
              </div>
              <div className="flex gap-2">
                <ButtonV2 variant="primary" size="md" onClick={handleAddUser}>
                  Добавить
                </ButtonV2>
                <ButtonV2 variant="secondary" size="md" onClick={() => setShowAddUser(false)}>
                  Отмена
                </ButtonV2>
              </div>
            </div>
          </CardV2>
        )}

        {/* Users list */}
        {users.length === 0 ? (
          <CardV2 className="p-8 text-center">
            <p style={{ color: 'hsl(var(--muted))' }}>Пользователи не найдены</p>
          </CardV2>
        ) : (
          <CardV2 className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead
                  style={{
                    background: 'hsl(var(--surface-2))',
                    borderBottom: '1px solid hsl(var(--border))',
                  }}
                >
                  <tr>
                    {['ID пользователя', 'Роль', 'Дата добавления', 'Действия'].map((label, idx) => (
                      <th
                        key={label}
                        className={`px-6 py-3 ${idx === 3 ? 'text-right' : 'text-left'} text-xs font-medium uppercase tracking-wider th-muted`}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr
                      key={`${user.user_id}-${user.organization_id}`}
                      className="transition-colors hover:bg-[hsl(var(--surface-2))]"
                      style={{ borderTop: '1px solid hsl(var(--border))' }}
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm td-default">
                        {user.user_id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          {getRoleIcon(user.role)}
                          <span className="text-sm td-default">{getRoleLabel(user.role)}</span>
                          <select
                            value={user.role}
                            onChange={(e) =>
                              handleUpdateRole(user.user_id, e.target.value as OrganizationRole)
                            }
                            className="ml-2 px-2 py-1 text-xs border rounded-v2-sm"
                            style={SELECT_STYLE}
                          >
                            <option value={OrganizationRole.MEMBER}>Участник</option>
                            <option value={OrganizationRole.ADMIN}>Администратор</option>
                            <option value={OrganizationRole.OWNER}>Владелец</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm td-muted">
                        {new Date(user.created_at).toLocaleDateString('ru-RU')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <ButtonV2
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveUser(user.user_id)}
                          iconLeft={<Trash2 />}
                          className="hover:text-[color:var(--signal-hot)]"
                        >
                          <span className="sr-only">Удалить</span>
                        </ButtonV2>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardV2>
        )}
      </div>
    </div>
  );
}
