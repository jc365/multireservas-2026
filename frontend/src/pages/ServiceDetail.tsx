/**
 * @file ServiceDetail.tsx
 * @module pages
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import client from '../api/client';
import { useUser } from '../context/UserContext';
import { can } from '../utils/roleConfig';
import { useToast } from '../context/ToastContext';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatPrice, serviceDurationOptions } from '../utils/booking';

interface Service {
  id: string;
  name: string;
  description: string | null;
  duration: number;
  price: number | null;
  category: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function ServiceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useUser();
  const { showSuccess, showError } = useToast();
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const fetchService = () => {
    if (!id) return;
    client.get(`/services/${id}`)
      .then((res) => setService(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchService(); }, [id]);

  const handleDelete = async () => {
    if (!id) return;
    try {
      await client.delete(`/services/${id}`);
      showSuccess('Service deleted');
      navigate('/services');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete service');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin">progress_activity</span>
        Loading service...
      </div>
    );
  }

  if (error || !service) {
    return (
      <div className="bg-error-container text-on-error-container p-4 rounded-xl">
        Error: {error || 'Service not found'}
      </div>
    );
  }

  const canEdit = user ? can(user.role, 'editServices') : false;

  return (
    <div>
      <div className="mb-8">
        <Link to="/services" className="text-primary hover:text-primary-fixed-dim transition-colors font-body-sm text-body-sm flex items-center gap-1 mb-4">
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Back to Services
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="font-display-lg text-display-lg text-on-background">
              {service.name}
            </h1>
            {service.description && (
              <p className="text-on-surface-variant mt-2 font-body-lg text-lg leading-relaxed">
                {service.description}
              </p>
            )}
            <div className="flex items-center gap-3 mt-3">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-label-caps border ${
                service.isActive
                  ? 'bg-[var(--color-green,#22c55e)]/10 text-[var(--color-green,#22c55e)] border-[var(--color-green,#22c55e)]/30'
                  : 'bg-surface-container text-on-surface-variant border-outline-variant/30'
              }`}>
                {service.isActive ? 'active' : 'inactive'}
              </span>
              <span className="text-on-surface-variant font-body-sm text-body-sm">
                {service.duration} min
              </span>
              <span className="text-on-surface font-body-sm text-body-sm font-medium">
                {formatPrice(service.price)}
              </span>
              {service.category && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-label-caps border bg-surface-container text-on-surface-variant border-outline-variant/30">
                  {service.category}
                </span>
              )}
              <span className="text-on-surface-variant font-body-sm text-body-sm">
                Created {new Date(service.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
          {canEdit && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowEditModal(true)}
                className="p-2 rounded hover:bg-surface-container transition-colors"
                aria-label="Edit service"
              >
                <span className="material-symbols-outlined text-on-surface-variant">edit</span>
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-2 rounded hover:bg-error-container/30 transition-colors"
                title="Delete service"
              >
                <span className="material-symbols-outlined text-error">delete</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <EditServiceModal
          service={service}
          onClose={() => setShowEditModal(false)}
          onSaved={() => {
            setShowEditModal(false);
            fetchService();
            showSuccess('Service updated');
          }}
        />
      )}

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Service"
        message={`Are you sure you want to delete "${service.name}"?`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}

function EditServiceModal({
  service,
  onClose,
  onSaved,
}: {
  service: Service;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(service.name);
  const [description, setDescription] = useState(service.description ?? '');
  const [duration, setDuration] = useState(service.duration);
  const [price, setPrice] = useState(service.price === null ? '' : String(service.price));
  const [category, setCategory] = useState(service.category ?? '');
  const [isActive, setIsActive] = useState(service.isActive);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await client.put(`/services/${service.id}`, {
        name: name.trim(),
        description: description.trim(),
        duration,
        price: price === '' ? null : Number(price),
        category: category.trim(),
        isActive,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update service');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Edit service">
      <div className="bg-surface-container-lowest rounded-xl shadow-2xl border border-outline-variant/30 w-full max-w-md mx-4 p-6">
        <h2 className="font-headline-md text-headline-md text-on-surface mb-4">Edit Service</h2>
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="service-name" className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block">Name</label>
            <input
              id="service-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface border border-outline-variant/50 rounded-lg p-3 font-body-sm text-body-sm text-on-surface focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label htmlFor="service-description" className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block">Description</label>
            <textarea
              id="service-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-surface border border-outline-variant/50 rounded-lg p-3 font-body-sm text-body-sm text-on-surface focus:outline-none focus:border-primary resize-none"
            />
          </div>
          <div>
            <label htmlFor="service-duration" className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block">Duration (minutes)</label>
            <select
              id="service-duration"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full bg-surface border border-outline-variant/50 rounded-lg p-3 font-body-sm text-body-sm text-on-surface focus:outline-none focus:border-primary"
            >
              {serviceDurationOptions().map((option) => (
                <option key={option} value={option}>
                  {option} min
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="service-price" className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block">Price</label>
            <input
              id="service-price"
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full bg-surface border border-outline-variant/50 rounded-lg p-3 font-body-sm text-body-sm text-on-surface focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label htmlFor="service-category" className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block">Category</label>
            <input
              id="service-category"
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-surface border border-outline-variant/50 rounded-lg p-3 font-body-sm text-body-sm text-on-surface focus:outline-none focus:border-primary"
            />
          </div>
          <label className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Active (available for booking)
          </label>
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
