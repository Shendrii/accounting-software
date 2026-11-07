'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useWorkspaces } from './WorkspaceProvider';
export default function WorkbenchDrawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { active } = useWorkspaces();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={dialog} aria-labelledby={titleId} className="workbench-drawer" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="workbench-drawer-header"><div className="min-w-0"><h2 id={titleId}>{title}</h2><p className="mt-1 break-words text-xs text-slate-600">{active?.name || 'Workspace name unavailable'}</p></div><button type="button" aria-label="Close preview" className="workspace-button" onClick={onClose}><X className="size-4" aria-hidden="true" /></button></header>
    <div className="space-y-5 p-4 sm:p-6">{children}</div>
  </dialog>;
}
