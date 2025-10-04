import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { toast } from 'react-hot-toast';
import { approvalService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import {
  CheckIcon,
  XMarkIcon as XIcon,
  EyeIcon,
  ClockIcon
} from '@heroicons/react/24/outline';

const Approvals = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [actionType, setActionType] = useState('');
  const [comments, setComments] = useState('');

  const { data: approvals, isLoading, refetch } = useQuery(
    'pending-approvals',
    approvalService.getPendingApprovals
  );

  const processMutation = useMutation(
    ({ expenseId, action, comments }) => 
      approvalService.processApproval(expenseId, { action, comments }),
    {
      onSuccess: (data) => {
        toast.success(`Expense ${data.finalStatus || actionType} successfully!`);
        queryClient.invalidateQueries('pending-approvals');
        queryClient.invalidateQueries('expenses');
        setShowModal(false);
        setSelectedExpense(null);
        setComments('');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to process approval');
      }
    }
  );

  const overrideMutation = useMutation(
    ({ expenseId, action, comments }) => 
      approvalService.overrideApproval(expenseId, { action, comments }),
    {
      onSuccess: () => {
        toast.success(`Expense ${actionType} successfully (admin override)!`);
        queryClient.invalidateQueries('pending-approvals');
        queryClient.invalidateQueries('expenses');
        setShowModal(false);
        setSelectedExpense(null);
        setComments('');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to override approval');
      }
    }
  );

  const handleAction = (expense, action) => {
    setSelectedExpense(expense);
    setActionType(action);
    setShowModal(true);
  };

  const handleSubmit = () => {
    if (!selectedExpense || !actionType) return;

    const data = {
      expenseId: selectedExpense.id,
      action: actionType,
      comments: comments.trim()
    };

    if (user?.role === 'admin' && actionType === 'override') {
      overrideMutation.mutate(data);
    } else {
      processMutation.mutate(data);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved':
        return 'text-green-600';
      case 'rejected':
        return 'text-red-600';
      case 'pending':
        return 'text-yellow-600';
      default:
        return 'text-gray-600';
    }
  };

  if (isLoading) {
    return <LoadingSpinner className="h-64" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pending Approvals</h1>
        <p className="text-gray-600">Review and approve expense submissions</p>
      </div>

      {/* Approvals List */}
      <div className="card">
        {approvals?.approvals?.length > 0 ? (
          <div className="space-y-4">
            {approvals.approvals.map((expense) => (
              <div
                key={expense.id}
                className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-4 mb-3">
                      <h3 className="text-lg font-medium text-gray-900">
                        {expense.description}
                      </h3>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        <ClockIcon className="w-3 h-3 mr-1" />
                        Pending
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div>
                        <p className="text-sm text-gray-500">Employee</p>
                        <p className="font-medium text-gray-900">
                          {expense.first_name} {expense.last_name}
                        </p>
                        <p className="text-sm text-gray-500">{expense.email}</p>
                      </div>

                      <div>
                        <p className="text-sm text-gray-500">Amount</p>
                        <p className="font-medium text-gray-900">
                          {expense.currency} {expense.amount}
                        </p>
                        {expense.currency !== expense.base_currency && (
                          <p className="text-sm text-gray-500">
                            {expense.base_currency} {expense.converted_amount}
                          </p>
                        )}
                      </div>

                      <div>
                        <p className="text-sm text-gray-500">Category & Date</p>
                        <p className="font-medium text-gray-900">{expense.category_name}</p>
                        <p className="text-sm text-gray-500">
                          {new Date(expense.expense_date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    {expense.receipt_url && (
                      <div className="mb-4">
                        <p className="text-sm text-gray-500 mb-2">Receipt</p>
                        <a
                          href={`${process.env.REACT_APP_API_URL || 'http://localhost:3000'}${expense.receipt_url}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-blue-600 hover:text-blue-700"
                        >
                          <EyeIcon className="w-4 h-4 mr-1" />
                          View Receipt
                        </a>
                      </div>
                    )}

                    {expense.approval_comments && (
                      <div className="mb-4">
                        <p className="text-sm text-gray-500 mb-1">Previous Comments</p>
                        <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded">
                          {expense.approval_comments}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col space-y-2 ml-6">
                    <button
                      onClick={() => handleAction(expense, 'approved')}
                      className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                    >
                      <CheckIcon className="w-4 h-4 mr-1" />
                      Approve
                    </button>

                    <button
                      onClick={() => handleAction(expense, 'rejected')}
                      className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                    >
                      <XIcon className="w-4 h-4 mr-1" />
                      Reject
                    </button>

                    {user?.role === 'admin' && (
                      <button
                        onClick={() => handleAction(expense, 'override')}
                        className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        Override
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <ClockIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No pending approvals</h3>
            <p className="mt-1 text-sm text-gray-500">
              All expenses have been processed or there are no submissions yet.
            </p>
          </div>
        )}
      </div>

      {/* Approval Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {actionType === 'approved' ? 'Approve Expense' : 
                 actionType === 'rejected' ? 'Reject Expense' : 'Override Approval'}
              </h3>

              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">
                  <strong>Expense:</strong> {selectedExpense?.description}
                </p>
                <p className="text-sm text-gray-600 mb-2">
                  <strong>Amount:</strong> {selectedExpense?.currency} {selectedExpense?.amount}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Employee:</strong> {selectedExpense?.first_name} {selectedExpense?.last_name}
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Comments {actionType === 'rejected' ? '(Required)' : '(Optional)'}
                </label>
                <textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  rows={3}
                  className="input-field"
                  placeholder={`Add comments for ${actionType === 'approved' ? 'approval' : 'rejection'}...`}
                />
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowModal(false);
                    setSelectedExpense(null);
                    setComments('');
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={
                    (actionType === 'rejected' && !comments.trim()) ||
                    processMutation.isLoading ||
                    overrideMutation.isLoading
                  }
                  className={`btn-primary ${
                    actionType === 'rejected' ? 'bg-red-600 hover:bg-red-700' : ''
                  }`}
                >
                  {processMutation.isLoading || overrideMutation.isLoading ? (
                    <LoadingSpinner size="small" />
                  ) : (
                    `Confirm ${actionType === 'approved' ? 'Approval' : 
                              actionType === 'rejected' ? 'Rejection' : 'Override'}`
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Approvals;