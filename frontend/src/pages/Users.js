import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { toast } from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { userService } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  UserIcon
} from '@heroicons/react/24/outline';

const Users = () => {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [filters, setFilters] = useState({
    page: 1,
    limit: 10,
    role: '',
    search: ''
  });

  const { register, handleSubmit, formState: { errors }, reset, setValue } = useForm();

  const { data: users, isLoading } = useQuery(
    ['users', filters],
    () => userService.getUsers(filters),
    {
      keepPreviousData: true
    }
  );

  const { data: managers } = useQuery(
    'managers',
    userService.getManagers
  );

  const createMutation = useMutation(userService.createUser, {
    onSuccess: () => {
      toast.success('User created successfully!');
      queryClient.invalidateQueries('users');
      setShowModal(false);
      reset();
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to create user');
    }
  });

  const updateMutation = useMutation(
    ({ id, data }) => userService.updateUser(id, data),
    {
      onSuccess: () => {
        toast.success('User updated successfully!');
        queryClient.invalidateQueries('users');
        setShowModal(false);
        setEditingUser(null);
        reset();
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to update user');
      }
    }
  );

  const deleteMutation = useMutation(userService.deleteUser, {
    onSuccess: () => {
      toast.success('User deactivated successfully!');
      queryClient.invalidateQueries('users');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to deactivate user');
    }
  });

  const handleCreate = () => {
    setEditingUser(null);
    reset();
    setShowModal(true);
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setValue('firstName', user.first_name);
    setValue('lastName', user.last_name);
    setValue('email', user.email);
    setValue('role', user.role);
    setValue('managerId', user.manager_id || '');
    setShowModal(true);
  };

  const handleDelete = (user) => {
    if (window.confirm(`Are you sure you want to deactivate ${user.first_name} ${user.last_name}?`)) {
      deleteMutation.mutate(user.id);
    }
  };

  const onSubmit = (data) => {
    const formData = {
      ...data,
      managerId: data.managerId ? parseInt(data.managerId) : null
    };

    if (editingUser) {
      updateMutation.mutate({ id: editingUser.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: 1
    }));
  };

  if (isLoading && !users) {
    return <LoadingSpinner className="h-64" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-600">Manage company users and their roles</p>
        </div>
        <button
          onClick={handleCreate}
          className="btn-primary flex items-center"
        >
          <PlusIcon className="w-5 h-5 mr-2" />
          Add User
        </button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <input
              type="text"
              placeholder="Search users..."
              className="input-field"
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role
            </label>
            <select
              className="input-field"
              value={filters.role}
              onChange={(e) => handleFilterChange('role', e.target.value)}
            >
              <option value="">All Roles</option>
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => setFilters({
                page: 1,
                limit: 10,
                role: '',
                search: ''
              })}
              className="btn-secondary w-full"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Manager
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users?.users?.length > 0 ? (
                users.users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                            <UserIcon className="h-6 w-6 text-gray-600" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {user.first_name} {user.last_name}
                          </div>
                          <div className="text-sm text-gray-500">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                        user.role === 'manager' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {user.manager_first_name ? (
                        `${user.manager_first_name} ${user.manager_last_name}`
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(user)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        {user.is_active && (
                          <button
                            onClick={() => handleDelete(user)}
                            className="text-red-600 hover:text-red-900"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="px-6 py-4 text-center text-gray-500">
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Modal */}
      {showModal && (
        <div className="modal-overlay animate-fade-in">
          <div className="modal-content animate-bounce-in max-w-lg">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 -m-6 mb-6 px-6 py-4 rounded-t-xl">
              <h3 className="text-xl font-semibold text-white">
                {editingUser ? 'Edit User' : 'Add New User'}
              </h3>
              <p className="text-blue-100 text-sm mt-1">
                {editingUser ? 'Update user information' : 'Create a new employee or manager account'}
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      First Name *
                    </label>
                    <input
                      {...register('firstName', { required: 'First name is required' })}
                      type="text"
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                      placeholder="Enter first name"
                    />
                    {errors.firstName && (
                      <p className="mt-1 text-sm text-red-600 animate-fade-in">{errors.firstName.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Last Name *
                    </label>
                    <input
                      {...register('lastName', { required: 'Last name is required' })}
                      type="text"
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                      placeholder="Enter last name"
                    />
                    {errors.lastName && (
                      <p className="mt-1 text-sm text-red-600 animate-fade-in">{errors.lastName.message}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email *
                  </label>
                  <input
                    {...register('email', {
                      required: 'Email is required',
                      pattern: {
                        value: /^\S+@\S+$/i,
                        message: 'Invalid email address'
                      }
                    })}
                    type="email"
                    className="input-field"
                    disabled={editingUser}
                  />
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
                  )}
                </div>

                {!editingUser && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Password *
                    </label>
                    <input
                      {...register('password', {
                        required: 'Password is required',
                        minLength: { value: 6, message: 'Password must be at least 6 characters' }
                      })}
                      type="password"
                      className="input-field"
                    />
                    {errors.password && (
                      <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role *
                  </label>
                  <select
                    {...register('role', { required: 'Role is required' })}
                    className="input-field"
                  >
                    <option value="">Select role</option>
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                  </select>
                  {errors.role && (
                    <p className="mt-1 text-sm text-red-600">{errors.role.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Manager
                  </label>
                  <select
                    {...register('managerId')}
                    className="input-field"
                  >
                    <option value="">No manager</option>
                    {managers?.map((manager) => (
                      <option key={manager.id} value={manager.id}>
                        {manager.first_name} {manager.last_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      setEditingUser(null);
                      reset();
                    }}
                    className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-all duration-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isLoading || updateMutation.isLoading}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    {createMutation.isLoading || updateMutation.isLoading ? (
                      <div className="flex items-center justify-center">
                        <LoadingSpinner size="small" />
                        <span className="ml-2">{editingUser ? 'Updating...' : 'Creating...'}</span>
                      </div>
                    ) : (
                      editingUser ? 'Update User' : 'Create User'
                    )}
                  </button>
                </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;