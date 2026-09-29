/**
 * @file Services.test.tsx
 * @module pages
 *
 * Tests de las páginas de services: lista, crear, editar (F3.1).
 */

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Services from './Services';
import CreateService from './CreateService';
import ServiceDetail from './ServiceDetail';
import { formatPrice } from '../utils/booking';

let mockUser: { id: string; name: string; email: string; role: string } | null = null;

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../context/UserContext', () => ({
  useUser: () => ({ user: mockUser }),
  UserProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showInfo: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import client from '../api/client';

const mockedGet = vi.mocked(client.get);
const mockedPost = vi.mocked(client.post);
const mockedPut = vi.mocked(client.put);

const demoService = {
  id: 'svc-1',
  tenantId: 'tenant-demo',
  name: 'Classic Haircut',
  description: 'Cut, wash and style.',
  duration: 30,
  price: 25,
  category: 'hair',
  isActive: true,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
};

/**
 * Intl emite NBSP antes del símbolo; testing-library normaliza el texto del DOM
 * (`\s+` → espacio simple) pero no el matcher, así que normalizamos el esperado.
 */
const priceText = (price: number) => formatPrice(price).replace(/\u00a0/g, ' ');

describe('Services (lista)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'usr-owner', name: 'Owner', email: 'owner@demo.com', role: 'owner' };
  });

  it('lista los servicios del tenant', async () => {
    mockedGet.mockResolvedValue({ data: [demoService] });

    render(
      <MemoryRouter>
        <Services />
      </MemoryRouter>
    );

    expect(await screen.findByText('Classic Haircut')).toBeInTheDocument();
    expect(screen.getByText('Cut, wash and style.')).toBeInTheDocument();
    expect(screen.getByText('30 min')).toBeInTheDocument();
    expect(screen.getByText(priceText(25))).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith('/services');
  });

  it('estado vacío sin servicios', async () => {
    mockedGet.mockResolvedValue({ data: [] });

    render(
      <MemoryRouter>
        <Services />
      </MemoryRouter>
    );

    expect(await screen.findByText('No services yet.')).toBeInTheDocument();
  });

  it('employee sin permiso de edición ve la lista', async () => {
    mockUser = { id: 'usr-emp', name: 'Employee', email: 'employee@demo.com', role: 'employee' };
    mockedGet.mockResolvedValue({ data: [demoService] });

    render(
      <MemoryRouter>
        <Services />
      </MemoryRouter>
    );

    expect(await screen.findByText('Classic Haircut')).toBeInTheDocument();
  });
});

describe('CreateService (crear)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'usr-owner', name: 'Owner', email: 'owner@demo.com', role: 'owner' };
  });

  it('crea un servicio con los campos del formulario', async () => {
    mockedPost.mockResolvedValue({ data: demoService });

    render(
      <MemoryRouter>
        <CreateService />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Classic Haircut' } });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Cut, wash and style.' },
    });
    fireEvent.change(screen.getByLabelText('Duration (minutes)'), { target: { value: '45' } });
    fireEvent.change(screen.getByLabelText('Price (optional)'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Category (optional)'), { target: { value: 'hair' } });
    fireEvent.click(screen.getByRole('button', { name: /create service/i }));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/services', {
        name: 'Classic Haircut',
        description: 'Cut, wash and style.',
        duration: 45,
        price: 25,
        category: 'hair',
      });
    });
  });

  it('el select de duration solo ofrece múltiplos de 15 hasta 180', async () => {
    render(
      <MemoryRouter>
        <CreateService />
      </MemoryRouter>
    );

    const select = screen.getByLabelText('Duration (minutes)') as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);

    expect(values).toEqual(['15', '30', '45', '60', '75', '90', '105', '120', '135', '150', '165', '180']);
  });

  it('employee sin editServices no ve el formulario', () => {
    mockUser = { id: 'usr-emp', name: 'Employee', email: 'employee@demo.com', role: 'employee' };

    render(
      <MemoryRouter>
        <CreateService />
      </MemoryRouter>
    );

    expect(screen.getByText("You don't have permission to create services.")).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    expect(mockedPost).not.toHaveBeenCalled();
  });
});

describe('ServiceDetail (editar)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'usr-owner', name: 'Owner', email: 'owner@demo.com', role: 'owner' };
  });

  it('muestra el detalle y actualiza el servicio', async () => {
    mockedGet.mockResolvedValue({ data: demoService });
    mockedPut.mockResolvedValue({ data: demoService });

    render(
      <MemoryRouter initialEntries={['/services/svc-1']}>
        <Routes>
          <Route path="/services/:id" element={<ServiceDetail />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Classic Haircut')).toBeInTheDocument();
    expect(screen.getByText('30 min')).toBeInTheDocument();
    expect(screen.getByText(priceText(25))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit service' }));
    const dialog = await screen.findByRole('dialog');

    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'Premium Haircut' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(mockedPut).toHaveBeenCalledWith(
        '/services/svc-1',
        expect.objectContaining({
          name: 'Premium Haircut',
          duration: 30,
          price: 25,
          isActive: true,
        })
      );
    });
  });

  it('employee sin editServices no ve los botones de editar/borrar', async () => {
    mockUser = { id: 'usr-emp', name: 'Employee', email: 'employee@demo.com', role: 'employee' };
    mockedGet.mockResolvedValue({ data: demoService });

    render(
      <MemoryRouter initialEntries={['/services/svc-1']}>
        <Routes>
          <Route path="/services/:id" element={<ServiceDetail />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Classic Haircut')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit service' })).not.toBeInTheDocument();
    expect(screen.queryByTitle('Delete service')).not.toBeInTheDocument();
  });
});
