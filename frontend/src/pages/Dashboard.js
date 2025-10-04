import React from 'react';
import { useQuery } from 'react-query';
import { Link } from 'react-router-dom';
import { companyService, expenseService, approvalService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import {
  CreditCardIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  PlusIcon,
  CurrencyDollarIcon,
  ArrowTrendingUpIcon
} from '@heroicons/react/24/outline';

const Dashboard = () => {
  const { user } = useAuth();

  const { data: companyData, isLoading: companyLoading } = useQuery(
    'company-profile',
    companyService.getProfile
  );

  const { data: recentExpenses, isLoading: expensesLoading } = useQuery(
    'recent-expenses',
    () => expenseService.getExpenses({ limit: 5 })
  );

  const { data: pendingApprovals, isLoading: approvalsLoading } = useQuery(
    'pending-approvals',
    approvalService.getPendingApprovals,
    {
      enabled: user?.role === 'manager' || user?.role === 'admin'
    }
  );

  if (companyLoading) {
    return <LoadingSpinner className="h-64" />;
  }

  const stats = [
    {
      name: 'Total Expenses',
      value: `$${(companyData?.expense_stats?.total_approved_amount || 0).toLocaleString()}`,
      count: companyData?.expense_stats?.total_expenses || 0,
      icon: CurrencyDollarIcon,
      color: 'icon-blue',
      change: '+12.5% from last month'
    },
    {
      name: 'Approved',
      value: companyData?.expense_stats?.approved_expenses || 0,
      icon: CheckCircleIcon,
      color: 'icon-green'
    },
    {
      name: 'Pending',
      value: companyData?.expense_stats?.pending_expenses || 0,
      icon: ClockIcon,
      color: 'icon-orange'
    },
    {
      name: 'Rejected',
      value: companyData?.expense_stats?.rejected_expenses || 0,
      icon: XCircleIcon,
      color: 'icon-red'
    }
  ];

  const topCategories = [
    { name: 'Travel', amount: '$12,450', progress: 85 },
    { name: 'Food', amount: '$6,890', progress: 60 },
    { name: 'Accommodation', amount: '$5,240', progress: 45 }
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">Welcome back, {user?.firstName}</p>
        </div>
        <Link to="/expenses/new" className="btn-primary flex items-center animate-bounce-in">
          <PlusIcon className="w-5 h-5 mr-2" />
          New Expense
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <div key={stat.name} className="stat-card animate-slide-up" style={{ animationDelay: `${index * 100}ms` }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                {stat.change && (
                  <div className="flex items-center mt-2">
                    <ArrowTrendingUpIcon className="w-4 h-4 text-green-500 mr-1" />
                    <span className="text-sm text-green-600">{stat.change}</span>
                  </div>
                )}
              </div>
              <div className={`icon-wrapper ${stat.color}`}>
                <stat.icon className="w-6 h-6" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Expenses */}
        <div className="lg:col-span-2">
          <div className="card animate-slide-up" style={{ animationDelay: '400ms' }}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Recent Expenses</h2>
                <p className="text-sm text-gray-600">Your latest expense submissions</p>
              </div>
              <Link to="/expenses" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                View all
              </Link>
            </div>
            {expensesLoading ? (
              <LoadingSpinner />
            ) : (
              <div className="space-y-4">
                {recentExpenses?.expenses?.length > 0 ? (
                  recentExpenses.expenses.slice(0, 5).map((expense) => (
                    <div key={expense.id} className="expense-item">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center mr-4">
                            <CurrencyDollarIcon className="w-5 h-5 text-gray-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{expense.description}</p>
                            <div className="flex items-center mt-1 space-x-4">
                              <span className="text-sm text-gray-500">
                                {new Date(expense.expense_date).toLocaleDateString()}
                              </span>
                              <span className="text-sm text-gray-500">{expense.first_name} {expense.last_name}</span>
                              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                                {expense.category_name}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">
                            {expense.currency} {expense.amount.toLocaleString()}
                          </p>
                          <span className={`status-${expense.status} mt-1`}>
                            {expense.status.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <CreditCardIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No expenses yet</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Quick Stats & Top Categories */}
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="card animate-slide-up" style={{ animationDelay: '500ms' }}>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Stats</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">This Month</span>
                <span className="font-semibold text-gray-900">$8,430</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Last Month</span>
                <span className="font-semibold text-gray-900">$7,250</span>
              </div>
              <div className="flex items-center text-sm">
                <ArrowTrendingUpIcon className="w-4 h-4 text-green-500 mr-1" />
                <span className="text-green-600 font-medium">16.3% increase</span>
              </div>
            </div>
          </div>

          {/* Top Categories */}
          <div className="card animate-slide-up" style={{ animationDelay: '600ms' }}>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Categories</h3>
            <div className="space-y-4">
              {topCategories.map((category) => (
                <div key={category.name}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-700">{category.name}</span>
                    <span className="text-sm font-semibold text-gray-900">{category.amount}</span>
                  </div>
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${category.progress}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pending Approvals (for managers/admins) */}
          {(user?.role === 'manager' || user?.role === 'admin') && (
            <div className="card animate-slide-up" style={{ animationDelay: '700ms' }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Pending Approvals</h3>
                <Link to="/approvals" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                  View all
                </Link>
              </div>
              {approvalsLoading ? (
                <LoadingSpinner />
              ) : (
                <div className="space-y-3">
                  {pendingApprovals?.approvals?.length > 0 ? (
                    pendingApprovals.approvals.slice(0, 3).map((approval) => (
                      <div key={approval.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{approval.description}</p>
                          <p className="text-xs text-gray-600">
                            by {approval.first_name} {approval.last_name}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900 text-sm">
                            {approval.currency} {approval.amount}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 text-center py-4 text-sm">No pending approvals</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;