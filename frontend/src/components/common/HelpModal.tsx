import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
  role?: string;
}

const MANUAL_BY_ROLE: Record<string, string> = {
  ADMIN: '/USER_MANUAL_ADMIN.md',
  HR: '/USER_MANUAL_HR.md',
  DEPARTMENT_HEAD: '/USER_MANUAL_DEPT_HEAD.md',
};

export default function HelpModal({ open, onClose, role }: HelpModalProps) {
  const [content, setContent] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    const file = (role && MANUAL_BY_ROLE[role]) ? MANUAL_BY_ROLE[role] : '/USER_MANUAL_EMPLOYEE.md';
    fetch(file)
      .then((r) => r.text())
      .then((t) => {
        if (mounted) setContent(t);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-4xl h-[80vh] p-6 overflow-auto animate-slide-in z-50">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Help</h3>
          <button onClick={onClose} aria-label="Close help" className="p-2 hover:bg-gray-100 rounded-lg">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="prose max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
