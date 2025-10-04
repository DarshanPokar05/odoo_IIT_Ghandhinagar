import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { toast } from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { companyService, approvalService } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import {
  CogIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  BuildingOfficeIcon,
  CurrencyDollarIcon,
  TagIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';

const Settings = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('company');
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingRule, setEditingRule] = useState(null);

  const { register: registerCompany, handleSubmit: handleCompanySubmit, formState: { errors: companyErrors }, setValue: setCompanyValue } = useForm();
  const { register: registerCategory, handleSubmit: handleCategorySubmit, formState: { errors: categoryErrors }, reset: resetCategory } = useForm();
  const { register: registerRule, handleSubmit: handleRuleSubmit, formState: { errors: ruleErrors }, reset: resetRule, watch: watchRule } = useForm();

  // Queries
  const { data: company, isLoading: companyLoading } = useQuery(
    'company-profile',
    companyService.getProfile,
    {
      onSuccess: (data) => {
        setCompanyValue('name', data.name);
        setCompanyValue('baseCurrency', data.base_currency);
      }
    }
  );

  const { data: currencies } = useQuery('currencies', companyService.getCurrencies);
  const { data: categories } = useQuery('categories', companyService.getCategories);
  const { data: approvalRules } = useQuery('approval-rules', approvalService.getApprovalRules);

  // Mutations
  const updateCompanyMutation = useMutation(companyService.updateProfile, {
    onSuccess: () => {
      toast.success('Company profile updated successfully!');
      queryClient.invalidateQueries('company-profile');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to update company profile');
    }
  });

  const createCategoryMutation = useMutation(companyService.createCategory, {
    onSuccess: () => {
      toast.success('Category created successfully!');
      queryClient.invalidateQueries('categories');
      setShowCategoryModal(false);
      resetCategory();
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to create category');
    }
  });

  const updateCategoryMutation = useMutation(
    ({ id, data }) => companyService.updateCategory(id, data),
    {
      onSuccess: () => {
        toast.success('Category updated successfully!');
        queryClient.invalidateQueries('categories');
        setShowCategoryModal(false);
        setEditingCategory(null);
        resetCategory();
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to update category');
      }
    }
  );

  const deleteCategoryMutation = useMutation(companyService.deleteCategory, {
    onSuccess: () => {
      toast.success('Category deleted successfully!');
      queryClient.invalidateQueries('categories');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to delete category');
    }
  });

  const createRuleMutation = useMutation(approvalService.createApprovalRule, {
    onSuccess: () => {
      toast.success('Approval rule created successfully!');
      queryClient.invalidateQueries('approval-rules');
      setShowRuleModal(false);
      resetRule();
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to create approval rule');
    }
  });

  // Handlers
  const onCompanySubmit = (data) => {
    updateCompanyMutation.mutate(data);
  };

  const handleCreateCategory = () => {
    setEditingCategory(null);
    resetCategory();
    setShowCategoryModal(true);
  };

  const handleEditCategory = (category) => {
    setEditingCategory(category);
    resetCategory({
      name: category.name,
      description: category.description
    });
    setShowCategoryModal(true);
  };

  const handleDeleteCategory = (category) => {
    if (window.confirm(`Are you sure you want to delete the category "${category.name}"?`)) {
      deleteCategoryMutation.mutate(category.id);
    }
  };

  const onCategorySubmit = (data) => {
    if (editingCategory) {
      updateCategoryMutation.mutate({ id: editingCategory.id, data });
    } else {
      createCategoryMutation.mutate(data);
    }
  };

  const handleCreateRule = () => {
    setEditingRule(null);
    resetRule();
    setShowRuleModal(true);
  };

  const onRuleSubmit = (data) => {
    const formData = {
      ...data,
      minAmount: parseFloat(data.minAmount) || 0,
      maxAmount: data.maxAmount ? parseFloat(data.maxAmount) : null,
      percentageRequired: data.percentageRequired ? parseInt(data.percentageRequired) : null,
      specificApproverId: data.specificApproverId ? parseInt(data.specificApproverId) : null,
      sequenceOrder: parseInt(data.sequenceOrder) || 1
    };

    createRuleMutation.mutate(formData);
  };

  const tabs = [
    { id: 'company', name: 'Company Profile', icon: BuildingOfficeIcon },
    { id: 'categories', name: 'Expense Categories', icon: TagIcon },
    { id: 'approval-rules', name: 'Approval Rules', icon: CheckCircleIcon }
  ];

  if (companyLoading) {
    return <LoadingSpinner className="h-64" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600">Manage your company configuration</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon className="w-5 h-5 mr-2" />
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Company Profile Tab */}
      {activeTab === 'company' && (
        <div className="card">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Company Profile</h2>
          <form onSubmit={handleCompanySubmit(onCompanySubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Company Name
              </label>
              <input
                {...registerCompany('name', { required: 'Company name is required' })}
                type="text"
                className="input-field"
              />
              {companyErrors.name && (
                <p className="mt-1 text-sm text-red-600">{companyErrors.name.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Base Currency
              </label>
              <select
                {...registerCompany('baseCurrency', { required: 'Base currency is required' })}
                className="input-field"
              >
                {currencies?.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
              {companyErrors.baseCurrency && (
                <p className="mt-1 text-sm text-red-600">{companyErrors.baseCurrency.message}</p>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={updateCompanyMutation.isLoading}
                className="btn-primary"
              >
                {updateCompanyMutation.isLoading ? <LoadingSpinner size="small" /> : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Categories Tab */}
      {activeTab === 'categories' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-medium text-gray-900">Expense Categories</h2>
            <button onClick={handleCreateCategory} className="btn-primary flex items-center">
              <PlusIcon className="w-5 h-5 mr-2" />
              Add Category
            </button>
          </div>

          <div className="card">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories?.map((category) => (
                <div key={category.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-medium text-gray-900">{category.name}</h3>
                    <div className="flex space-x-1">
                      <button
                        onClick={() => handleEditCategory(category)}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(category)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {category.description && (
                    <p className="text-sm text-gray-600">{category.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Approval Rules Tab */}
      {activeTab === 'approval-rules' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-medium text-gray-900">Approval Rules</h2>
            <button onClick={handleCreateRule} className="btn-primary flex items-center">
              <PlusIcon className="w-5 h-5 mr-2" />
              Add Rule
            </button>
          </div>

          <div className="card">
            <div className="space-y-4">
              {approvalRules?.map((rule) => (
                <div key={rule.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium text-gray-900">{rule.name}</h3>
                      <p className="text-sm text-gray-600 capitalize">{rule.rule_type.replace('_', ' ')}</p>
                      <div className="mt-2 text-sm text-gray-600">
                        <p>Amount Range: ${rule.min_amount || 0} - ${rule.max_amount || '∞'}</p>
                        {rule.percentage_required && (
                          <p>Required Approval: {rule.percentage_required}%</p>
                        )}
                        {rule.first_name && (
                          <p>Specific Approver: {rule.first_name} {rule.last_name}</p>
                        )}
                      </div>
                    </div>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      rule.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {rule.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {editingCategory ? 'Edit Category' : 'Create New Category'}
              </h3>

              <form onSubmit={handleCategorySubmit(onCategorySubmit)} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category Name *
                  </label>
                  <input
                    {...registerCategory('name', { required: 'Category name is required' })}
                    type="text"
                    className="input-field"
                  />
                  {categoryErrors.name && (
                    <p className="mt-1 text-sm text-red-600">{categoryErrors.name.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    {...registerCategory('description')}
                    rows={3}
                    className="input-field"
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCategoryModal(false);
                      setEditingCategory(null);
                      resetCategory();
                    }}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createCategoryMutation.isLoading || updateCategoryMutation.isLoading}
                    className="btn-primary"
                  >
                    {createCategoryMutation.isLoading || updateCategoryMutation.isLoading ? (
                      <LoadingSpinner size="small" />
                    ) : (
                      editingCategory ? 'Update Category' : 'Create Category'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Approval Rule Modal */}
      {showRuleModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Create Approval Rule</h3>

              <form onSubmit={handleRuleSubmit(onRuleSubmit)} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rule Name *
                  </label>
                  <input
                    {...registerRule('name', { required: 'Rule name is required' })}
                    type="text"
                    className="input-field"
                  />
                  {ruleErrors.name && (
                    <p className="mt-1 text-sm text-red-600">{ruleErrors.name.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rule Type *
                  </label>
                  <select
                    {...registerRule('ruleType', { required: 'Rule type is required' })}
                    className="input-field"
                  >
                    <option value="">Select rule type</option>
                    <option value="sequential">Sequential Approval</option>
                    <option value="percentage">Percentage Approval</option>
                    <option value="specific_approver">Specific Approver</option>
                  </select>
                  {ruleErrors.ruleType && (
                    <p className="mt-1 text-sm text-red-600">{ruleErrors.ruleType.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Min Amount
                    </label>
                    <input
                      {...registerRule('minAmount')}
                      type="number"
                      step="0.01"
                      className="input-field"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Max Amount
                    </label>
                    <input
                      {...registerRule('maxAmount')}
                      type="number"
                      step="0.01"
                      className="input-field"
                      placeholder="No limit"
                    />
                  </div>
                </div>

                {watchRule('ruleType') === 'percentage' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Required Percentage *
                    </label>
                    <input
                      {...registerRule('percentageRequired', { 
                        required: 'Percentage is required',
                        min: { value: 1, message: 'Minimum 1%' },
                        max: { value: 100, message: 'Maximum 100%' }
                      })}
                      type="number"
                      min="1"
                      max="100"
                      className="input-field"
                      placeholder="60"
                    />
                    {ruleErrors.percentageRequired && (
                      <p className="mt-1 text-sm text-red-600">{ruleErrors.percentageRequired.message}</p>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sequence Order
                  </label>
                  <input
                    {...registerRule('sequenceOrder')}
                    type="number"
                    min="1"
                    className="input-field"
                    placeholder="1"
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRuleModal(false);
                      resetRule();
                    }}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createRuleMutation.isLoading}
                    className="btn-primary"
                  >
                    {createRuleMutation.isLoading ? (
                      <LoadingSpinner size="small" />
                    ) : (
                      'Create Rule'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;