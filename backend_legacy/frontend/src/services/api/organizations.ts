/**
 * Organizations API client.
 */

import { apiClient } from '@/client';

export enum OrganizationRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export interface OrganizationResponse {
  id: number;
  name: string;
  created_at: string;
  updated_at?: string;
}

export interface OrganizationWithUsersResponse extends OrganizationResponse {
  users_count: number;
  searches_count: number;
}

export interface OrganizationCreate {
  name: string;
}

export interface OrganizationUpdate {
  name?: string;
}

export interface UserOrganizationResponse {
  user_id: number;
  organization_id: number;
  role: OrganizationRole;
  created_at: string;
}

export interface AddUserToOrganizationRequest {
  user_id: number;
  role: OrganizationRole;
}

export interface UpdateUserRoleRequest {
  role: OrganizationRole;
}

/**
 * Create a new organization.
 */
export async function createOrganization(data: OrganizationCreate): Promise<OrganizationResponse> {
  const response = await apiClient.post<OrganizationResponse>('/organizations', data);
  return response.data;
}

/**
 * Get all organizations with statistics.
 */
export async function listOrganizations(): Promise<OrganizationWithUsersResponse[]> {
  const response = await apiClient.get<OrganizationWithUsersResponse[]>('/organizations');
  return response.data;
}

/**
 * Get a specific organization by ID.
 */
export async function getOrganization(id: number): Promise<OrganizationResponse> {
  const response = await apiClient.get<OrganizationResponse>(`/organizations/${id}`);
  return response.data;
}

/**
 * Update an organization.
 */
export async function updateOrganization(
  id: number,
  data: OrganizationUpdate
): Promise<OrganizationResponse> {
  const response = await apiClient.put<OrganizationResponse>(`/organizations/${id}`, data);
  return response.data;
}

/**
 * Delete an organization.
 */
export async function deleteOrganization(id: number): Promise<void> {
  await apiClient.delete(`/organizations/${id}`);
}

/**
 * Get all users in an organization.
 */
export async function getOrganizationUsers(
  organizationId: number
): Promise<UserOrganizationResponse[]> {
  const response = await apiClient.get<UserOrganizationResponse[]>(
    `/organizations/${organizationId}/users`
  );
  return response.data;
}

/**
 * Add a user to an organization.
 */
export async function addUserToOrganization(
  organizationId: number,
  data: AddUserToOrganizationRequest
): Promise<UserOrganizationResponse> {
  const response = await apiClient.post<UserOrganizationResponse>(
    `/organizations/${organizationId}/users`,
    data
  );
  return response.data;
}

/**
 * Update user's role in an organization.
 */
export async function updateUserRole(
  organizationId: number,
  userId: number,
  data: UpdateUserRoleRequest
): Promise<UserOrganizationResponse> {
  const response = await apiClient.put<UserOrganizationResponse>(
    `/organizations/${organizationId}/users/${userId}/role`,
    data
  );
  return response.data;
}

/**
 * Remove a user from an organization.
 */
export async function removeUserFromOrganization(
  organizationId: number,
  userId: number
): Promise<void> {
  await apiClient.delete(`/organizations/${organizationId}/users/${userId}`);
}
