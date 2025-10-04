import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { toast } from 'react-hot-toast';
import { expenseService, companyService } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { 
  CurrencyDollarIcon, 
  CalendarDaysIcon, 
  TagIcon, 
  DocumentTextIcon,
  BuildingStorefrontIcon,
  ArrowLeftIcon
} from '@heroicons/react/24/outline';

const CreateExpense = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      expenseDate: new Date().toISOString().split('T')[0]
    }
  });

  const { data: categories } = useQuery('expense-categories', expenseService.getCategories);
  const { data: currencies } = useQuery('currencies', companyService.getCurrencies);

  const createMutation = useMutation(expenseService.createExpense, {
    onSuccess: () => {
      toast.success('Expense created successfully! 🎉');
      queryClient.invalidateQueries('expenses');
      navigate('/expenses');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to create expense');
    }
  });

  const onSubmit = async (data) => {
    const formData = {
      ...data,
      categoryId: parseInt(data.categoryId),
      amount: parseFloat(data.amount)
    };
    createMutation.mutate(formData);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <button
            onClick={() => navigate('/expenses')}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4 transition-colors duration-200"
          >
            <ArrowLeftIcon className="w-5 h-5 mr-2" />
            Back to Expenses
          </button>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Create New Expense</h1>
          <p className="text-gray-600">Submit a new expense for approval</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden animate-slide-up">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-6">
            <h2 className="text-xl font-semibold text-white">Expense Details</h2>
            <p className="text-blue-100 text-sm mt-1">Fill in the information below</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Category */}
              <div className="space-y-2">
                <label className="flex items-center text-sm font-medium text-gray-700">
                  <TagIcon className="w-4 h-4 mr-2 text-gray-500" />
                  Category
                </label>
                <select 
                  {...register('categoryId', { required: 'Category is required' })} 
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                >
                  <option value="">Select a category</option>
                  {categories?.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
                {errors.categoryId && (
                  <p className="text-sm text-red-600 animate-fade-in">{errors.categoryId.message}</p>
                )}
              </div>

              {/* Amount */}
              <div className="space-y-2">
                <label className="flex items-center text-sm font-medium text-gray-700">
                  <CurrencyDollarIcon className="w-4 h-4 mr-2 text-gray-500" />
                  Amount
                </label>
                <input
                  {...register('amount', {
                    required: 'Amount is required',
                    min: { value: 0.01, message: 'Amount must be greater than 0' }
                  })}
                  type="number" 
                  step="0.01" 
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white" 
                  placeholder="0.00"
                />
                {errors.amount && (
                  <p className="text-sm text-red-600 animate-fade-in">{errors.amount.message}</p>
                )}
              </div>

              {/* Currency */}
              <div className="space-y-2">
                <label className="flex items-center text-sm font-medium text-gray-700">
                  <CurrencyDollarIcon className="w-4 h-4 mr-2 text-gray-500" />
                  Currency
                </label>
                <select 
                  {...register('currency', { required: 'Currency is required' })} 
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                >
                  <option value="">Select currency</option>
                  {currencies?.map((currency) => (
                    <option key={currency} value={currency}>{currency}</option>
                  ))}
                </select>
                {errors.currency && (
                  <p className="text-sm text-red-600 animate-fade-in">{errors.currency.message}</p>
                )}
              </div>

              {/* Date */}
              <div className="space-y-2">
                <label className="flex items-center text-sm font-medium text-gray-700">
                  <CalendarDaysIcon className="w-4 h-4 mr-2 text-gray-500" />
                  Date
                </label>
                <input
                  {...register('expenseDate', { required: 'Date is required' })}
                  type="date" 
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white" 
                  max={new Date().toISOString().split('T')[0]}
                />
                {errors.expenseDate && (
                  <p className="text-sm text-red-600 animate-fade-in">{errors.expenseDate.message}</p>
                )}
              </div>
            </div>

            {/* Merchant Name */}
            <div className="space-y-2">
              <label className="flex items-center text-sm font-medium text-gray-700">
                <BuildingStorefrontIcon className="w-4 h-4 mr-2 text-gray-500" />
                Merchant Name
              </label>
              <input 
                {...register('merchantName')} 
                type="text" 
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white" 
                placeholder="e.g., Restaurant ABC, Hotel XYZ"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="flex items-center text-sm font-medium text-gray-700">
                <DocumentTextIcon className="w-4 h-4 mr-2 text-gray-500" />
                Description
              </label>
              <textarea
                {...register('description', {
                  required: 'Description is required',
                  minLength: { value: 5, message: 'Description must be at least 5 characters' }
                })}
                rows={4} 
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white resize-none" 
                placeholder="Describe the expense purpose..."
              />
              {errors.description && (
                <p className="text-sm text-red-600 animate-fade-in">{errors.description.message}</p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-gray-100">
              <button
                type="button"
                onClick={() => navigate('/expenses')}
                className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isLoading}
                className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {createMutation.isLoading ? (
                  <div className="flex items-center justify-center">
                    <LoadingSpinner size="small" />
                    <span className="ml-2">Creating...</span>
                  </div>
                ) : (
                  'Create Expense'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateExpense;