'use client';

import { useState } from 'react';
import { createAccount, type CreateAccountInput } from '@/lib/api';
import AccountRoleField from './AccountRoleField';

interface CreateAccountFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

/**
 * Component for creating a new account
 */
export default function CreateAccountForm({ onSuccess, onCancel }: CreateAccountFormProps) {
  const [formData, setFormData] = useState<CreateAccountInput>({
    code: '',
    name: '',
    type: 'ASSET',
    role: 'GENERAL',
    description: '',
    isActive: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await createAccount(formData);
      setSuccess(true);
      // Reset form
      setFormData({
        code: '',
        name: '',
        type: 'ASSET',
        role: 'GENERAL',
        description: '',
        isActive: true,
      });
      // Call success callback after a short delay
      setTimeout(() => {
        onSuccess?.();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6">
      <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-4">Create New Account</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-green-800 dark:text-green-200 text-sm">Account created successfully!</p>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor="code" className="block text-sm font-medium mb-1 text-zinc-700 dark:text-zinc-300">
            Account Code *
          </label>
          <input
            type="text"
            id="code"
            required
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500"
            placeholder="e.g., 1000"
          />
        </div>

        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-1 text-zinc-700 dark:text-zinc-300">
            Account Name *
          </label>
          <input
            type="text"
            id="name"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500"
            placeholder="e.g., Cash"
          />
        </div>

        <div>
          <label htmlFor="type" className="block text-sm font-medium mb-1 text-zinc-700 dark:text-zinc-300">
            Account Type *
          </label>
          <select
            id="type"
            required
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value as CreateAccountInput['type'], role: 'GENERAL', isBankAccount: false })}
            className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500"
          >
            <option value="ASSET">Asset</option>
            <option value="LIABILITY">Liability</option>
            <option value="EQUITY">Equity</option>
            <option value="REVENUE">Revenue</option>
            <option value="EXPENSE">Expense</option>
          </select>
        </div>

        <div>
          <AccountRoleField type={formData.type} value={formData.role ?? 'GENERAL'}
            onChange={role => setFormData({ ...formData, role, isBankAccount: role === 'BANK' })} />
          <label htmlFor="description" className="mt-4 block text-sm font-medium mb-1 text-zinc-700 dark:text-zinc-300">
            Description
          </label>
          <textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500"
            rows={3}
            placeholder="Optional description"
          />
        </div>

        <div>
            <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="mr-2"
            />
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Active</span>
          </label>
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={loading}
          className="flex-1 px-4 py-2 bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {loading ? 'Creating...' : 'Create Account'}
        </button>
      </div>
      </form>
    </div>
  );
}

