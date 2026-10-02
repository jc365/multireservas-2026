/**
 * @file CreateService.tsx
 * @module pages
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useUser } from '../context/UserContext';
import { can } from '../utils/roleConfig';
import { SLOT_DURATION, serviceDurationOptions } from '../utils/booking';
import useEmailVerified from '../hooks/useEmailVerified';
import VerificationBanner from '../components/VerificationBanner';

export default function CreateService() {
  const navigate = useNavigate();
  const { user } = useUser();
  const canEdit = user ? can(user.role, 'editServices') : false;
  const { emailVerified } = useEmailVerified();
  // F4.4b: gating local (defensa en profundidad) — el backend devuelve
  // 403 EMAIL_NOT_VERIFIED en POST /services si el tenant no verifica.
  const locked = emailVerified === false;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState<number>(SLOT_DURATION);
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!canEdit) {
    return (
      <div className="bg-surface border border-outline-variant/30 rounded-xl p-6 max-w-lg">
        <p className="text-on-surface-variant font-body-lg text-body-lg">
          You don't have permission to create services.
        </p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (locked) return;
    setError('');
    setLoading(true);

    try {
      await client.post('/services', {
        name,
        description,
        duration,
        price: price === '' ? null : Number(price),
        category,
      });
      navigate('/services');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creating service');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg">
      <h1 className="font-display-lg-mobile text-display-lg-mobile text-on-background mb-6">
        Create Service
      </h1>
      {error && (
        <div className="bg-error-container text-on-error-container p-3 rounded mb-4 text-sm">
          {error}
        </div>
      )}
      {locked && (
        <div className="mb-4">
          <VerificationBanner
            message="Confirma tu email para editar"
            linkTo="/tenant-config"
            linkLabel="Confirmar email"
          />
        </div>
      )}
      <form
        onSubmit={handleSubmit}
        className="bg-surface border border-outline-variant/30 rounded-xl p-6"
      >
        <fieldset disabled={locked} className="space-y-4 border-0 p-0 min-w-0">
          <div>
            <label htmlFor="service-name" className="block font-label-caps text-label-caps text-on-surface-variant uppercase mb-2">
              Name
            </label>
            <input
              id="service-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full bg-surface-container border-b-2 border-outline-variant/30 text-on-surface px-3 py-2 rounded focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          <div>
            <label htmlFor="service-description" className="block font-label-caps text-label-caps text-on-surface-variant uppercase mb-2">
              Description
            </label>
            <textarea
              id="service-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-surface-container border-b-2 border-outline-variant/30 text-on-surface px-3 py-2 rounded focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          <div>
            <label htmlFor="service-duration" className="block font-label-caps text-label-caps text-on-surface-variant uppercase mb-2">
              Duration (minutes)
            </label>
            <select
              id="service-duration"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              required
              className="w-full bg-surface-container border-b-2 border-outline-variant/30 text-on-surface px-3 py-2 rounded focus:outline-none focus:border-primary transition-colors"
            >
              {serviceDurationOptions().map((option) => (
                <option key={option} value={option}>
                  {option} min
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="service-price" className="block font-label-caps text-label-caps text-on-surface-variant uppercase mb-2">
              Price (optional)
            </label>
            <input
              id="service-price"
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full bg-surface-container border-b-2 border-outline-variant/30 text-on-surface px-3 py-2 rounded focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          <div>
            <label htmlFor="service-category" className="block font-label-caps text-label-caps text-on-surface-variant uppercase mb-2">
              Category (optional)
            </label>
            <input
              id="service-category"
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-surface-container border-b-2 border-outline-variant/30 text-on-surface px-3 py-2 rounded focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-container text-on-primary-container font-title-sm text-title-sm py-3 px-4 rounded hover:bg-primary transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Service'}
          </button>
        </fieldset>
      </form>
    </div>
  );
}
