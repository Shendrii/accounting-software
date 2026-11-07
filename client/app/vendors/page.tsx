'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Plus, Search, Pencil, ToggleLeft, ToggleRight, X, Loader2,
} from 'lucide-react';
import {
  getVendors, createVendor, updateVendor, deleteVendor,
  type Vendor, type CreateVendorInput,
} from '@/lib/api';
import { toast } from '@/lib/toast';
import { LegacyRedirect } from '@/app/components/LegacyRedirect';
import PhoneInput from '@/app/components/PhoneInput';

const emptyForm: CreateVendorInput = { name: '', email: '', phone: '', address: '' };

import { WorkflowTabs, WorkspaceHeading, WorkspaceNotice } from '@/app/components/WorkspaceUI';

export function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Vendor | null>(null);
  const [form, setForm] = useState<CreateVendorInput>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getVendors(showInactive ? {} : { isActive: true });
      setVendors(data);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load vendors');
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => { void load(); }, [load]);

  const filtered = vendors.filter(
    (v) =>
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      (v.email ?? '').toLowerCase().includes(search.toLowerCase())
  );

  function openCreate() {
    setEditTarget(null);
    setForm(emptyForm);
    setError(null);
    setFormOpen(true);
  }

  function openEdit(vendor: Vendor) {
    setEditTarget(vendor);
    setForm({ name: vendor.name, email: vendor.email ?? '', phone: vendor.phone ?? '', address: vendor.address ?? '' });
    setError(null);
    setFormOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError(null);
    try {
      if (editTarget) {
        await updateVendor(editTarget.id, form);
        toast.success('Vendor updated successfully');
      } else {
        await createVendor(form);
        toast.success('Vendor created successfully');
      }
      setFormOpen(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save vendor');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(vendor: Vendor) {
    try {
      if (vendor.isActive) {
        await deleteVendor(vendor.id);
        toast.success(`${vendor.name} deactivated`);
      } else {
        await updateVendor(vendor.id, { isActive: true });
        toast.success(`${vendor.name} activated`);
      }
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update vendor');
    }
  }

  return (
    <div className="workspace-page">
      <div className="workspace-content">
        <div className="mb-5 space-y-4">
          <WorkspaceHeading section="Purchases" title="Vendors" description="Manage supplier records and contact details."
            actions={<button type="button" onClick={openCreate} className="workspace-primary"><Plus className="size-4" aria-hidden="true" />New vendor</button>} />
          <WorkflowTabs area="purchases" active="vendors" />
        </div>

        {loadError && (
          <div className="mb-5"><WorkspaceNotice title="Vendors could not load" onRetry={load}>{loadError}</WorkspaceNotice></div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search vendors…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-zinc-300"
            />
            Show inactive
          </label>
        </div>

        <div className="workspace-panel overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-zinc-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-zinc-500 dark:text-zinc-400">
              No vendors found.{' '}
              <button onClick={openCreate} className="text-zinc-700 dark:text-zinc-300 underline">
                Add one
              </button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  {['Name', 'Email', 'Phone', 'Address', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((vendor) => (
                  <tr
                    key={vendor.id}
                    className="border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">{vendor.name}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{vendor.email ?? '-'}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{vendor.phone ?? '-'}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{vendor.address ?? '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        vendor.isActive
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}>
                        {vendor.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(vendor)} className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-500" title="Edit">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => toggleActive(vendor)}
                          className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-500"
                          title={vendor.isActive ? 'Deactivate' : 'Activate'}
                        >
                          {vendor.isActive ? <ToggleRight className="h-4 w-4 text-emerald-500" /> : <ToggleLeft className="h-4 w-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Slide-over Form */}
        {formOpen && (
          <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={() => setFormOpen(false)} />
            <div className="w-full max-w-md bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 h-full overflow-y-auto p-6 shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                  {editTarget ? 'Edit Vendor' : 'New Vendor'}
                </h2>
                <button onClick={() => setFormOpen(false)} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 text-red-700 dark:text-red-400 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Name *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Phone</label>
                  <PhoneInput
                    value={form.phone ?? ''}
                    onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
                  />
                </div>

                {/* Address */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Address</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setFormOpen(false)}
                    className="flex-1 px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-700 text-white text-sm font-medium disabled:opacity-50"
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    {editTarget ? 'Save Changes' : 'Create Vendor'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LegacyVendorsPage() {
  return <LegacyRedirect to="/purchases/vendors" />;
}
