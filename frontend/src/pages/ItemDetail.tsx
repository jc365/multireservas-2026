/**
 * @file ItemDetail.tsx
 * @module pages
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import client from '../api/client';
import { useUser } from '../context/UserContext';
import { can } from '../utils/roleConfig';
import { useToast } from '../context/ToastContext';
import ConfirmDialog from '../components/ConfirmDialog';
import SubmitFileModal from '../components/SubmitFileModal';
import FileViewerModal from '../components/FileViewerModal';

interface Item {
  id: string;
  title: string;
  description: string | null;
  status: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  fileKey: string | null;
  mimeType: string | null;
  fileUrl: string | null;
}

export default function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useUser();
  const { showSuccess, showError } = useToast();
  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showFileViewer, setShowFileViewer] = useState(false);

  const fetchItem = () => {
    if (!id) return;
    client.get(`/items/${id}`)
      .then((res) => setItem(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchItem(); }, [id]);

  const handleDelete = async () => {
    if (!id) return;
    try {
      await client.delete(`/items/${id}`);
      showSuccess('Item deleted');
      navigate('/dashboard');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete item');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin">progress_activity</span>
        Loading item...
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="bg-error-container text-on-error-container p-4 rounded-xl">
        Error: {error || 'Item not found'}
      </div>
    );
  }

  const canEdit = user ? can(user.role, 'editItems') : false;

  return (
    <div>
      <div className="mb-8">
        <Link to="/dashboard" className="text-primary hover:text-primary-fixed-dim transition-colors font-body-sm text-body-sm flex items-center gap-1 mb-4">
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Back to Dashboard
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="font-display-lg text-display-lg text-on-background">
              {item.title}
            </h1>
            {item.description && (
              <p className="text-on-surface-variant mt-2 font-body-lg text-lg leading-relaxed">
                {item.description}
              </p>
            )}
            <div className="flex items-center gap-3 mt-3">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-label-caps border ${
                item.status === 'active'
                  ? 'bg-[var(--color-green,#22c55e)]/10 text-[var(--color-green,#22c55e)] border-[var(--color-green,#22c55e)]/30'
                  : 'bg-surface-container text-on-surface-variant border-outline-variant/30'
              }`}>
                {item.status}
              </span>
              <span className="text-on-surface-variant font-body-sm text-body-sm">
                Created {new Date(item.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
          {canEdit && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowEditModal(true)}
                className="p-2 rounded hover:bg-surface-container transition-colors"
                aria-label="Edit item"
              >
                <span className="material-symbols-outlined text-on-surface-variant">edit</span>
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-2 rounded hover:bg-error-container/30 transition-colors"
                title="Delete item"
              >
                <span className="material-symbols-outlined text-error">delete</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* File section */}
      <div className="bg-surface border border-outline-variant/30 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-title-sm text-title-sm text-on-surface">Attached File</h2>
          {canEdit && (
            <button
              onClick={() => setShowUploadModal(true)}
              className="inline-flex items-center gap-2 py-2 px-4 bg-primary-container text-on-primary-container font-title-sm text-title-sm rounded hover:bg-primary transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">upload_file</span>
              {item.fileKey ? 'Replace File' : 'Upload File'}
            </button>
          )}
        </div>
        {item.fileKey ? (
          <div className="flex items-center gap-4">
            <span className="material-symbols-outlined text-primary text-[32px]">insert_drive_file</span>
            <div className="flex-1 min-w-0">
              <p className="font-body-sm text-body-sm text-on-surface truncate">{item.fileKey.split('/').pop()}</p>
              <p className="text-xs text-on-surface-variant">{item.mimeType || 'Unknown type'}</p>
            </div>
            <button
              onClick={() => setShowFileViewer(true)}
              className="inline-flex items-center gap-2 py-2 px-4 border border-outline-variant/50 text-on-surface-variant font-title-sm text-title-sm rounded hover:bg-surface-container transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">visibility</span>
              View File
            </button>
          </div>
        ) : (
          <p className="text-on-surface-variant font-body-sm text-body-sm">
            No file attached yet.
          </p>
        )}
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <EditItemModal
          item={item}
          onClose={() => setShowEditModal(false)}
          onSaved={() => {
            setShowEditModal(false);
            fetchItem();
            showSuccess('Item updated');
          }}
        />
      )}

      {/* Upload Modal */}
      <SubmitFileModal
        itemId={item.id}
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onSuccess={() => {
          setShowUploadModal(false);
          fetchItem();
          showSuccess('File uploaded');
        }}
      />

      {/* File Viewer Modal */}
      <FileViewerModal
        isOpen={showFileViewer}
        file={item.fileKey ? {
          key: item.fileKey,
          mimeType: item.mimeType || 'application/octet-stream',
          url: item.fileUrl,
          name: item.fileKey.split('/').pop(),
        } : null}
        onClose={() => setShowFileViewer(false)}
      />

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Item"
        message={`Are you sure you want to delete "${item.title}"?`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}

function EditItemModal({
  item,
  onClose,
  onSaved,
}: {
  item: Item;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await client.put(`/items/${item.id}`, {
        title: title.trim(),
        description: description.trim(),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update item');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Edit item">
      <div className="bg-surface-container-lowest rounded-xl shadow-2xl border border-outline-variant/30 w-full max-w-md mx-4 p-6">
        <h2 className="font-headline-md text-headline-md text-on-surface mb-4">Edit Item</h2>
        <div className="flex flex-col gap-4">
          <div>
            <label className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-surface border border-outline-variant/50 rounded-lg p-3 font-body-sm text-body-sm text-on-surface focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-surface border border-outline-variant/50 rounded-lg p-3 font-body-sm text-body-sm text-on-surface focus:outline-none focus:border-primary resize-none"
            />
          </div>
          {error && (
            <p className="text-error font-body-sm text-body-sm">{error}</p>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="py-2 px-4 rounded font-title-sm text-title-sm text-on-surface-variant hover:bg-surface-container transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="py-2 px-5 rounded font-title-sm text-title-sm bg-primary-container text-on-primary-container hover:bg-primary-container/80 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
