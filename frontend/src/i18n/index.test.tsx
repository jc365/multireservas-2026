/**
 * @file index.test.tsx
 * @module i18n
 *
 * Tests del provider y del hook (F4.6a): `t(key)`, fallback a `en`,
 * clave inexistente, cambio de idioma con persistencia, `<html lang>`
 * y precedencia usuario > tenant > navegador.
 *
 * Se mockea `./locales` para poder simular un idioma SIN traducción
 * (fallback a `en`) y una clave con parámetros.
 */

import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import {
  I18nProvider,
  useI18n,
  LOCALE_STORAGE_KEY,
  type I18nContextValue,
  type Locale,
} from './index';

vi.mock('./locales', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./locales')>();
  const es = { ...actual.dictionaries.es } as Record<string, unknown>;
  // auth sin traducir en "es" → debe caer a la clave de `en`.
  delete es.auth;
  return {
    dictionaries: {
      ...actual.dictionaries,
      en: {
        ...actual.dictionaries.en,
        demo: { hello: 'Hi {name}' },
      },
      es,
    },
  };
});

let captured: I18nContextValue | null = null;

function Probe() {
  captured = useI18n();
  return <span data-testid="probe">{captured.t('buttons.save')}</span>;
}

function renderI18n(ui: ReactNode, props: { tenantLanguage?: string | null } = {}) {
  return render(
    <I18nProvider {...props}>
      {ui}
    </I18nProvider>
  );
}

describe('I18nProvider / useI18n', () => {
  beforeEach(() => {
    captured = null;
    localStorage.clear();
    document.documentElement.lang = '';
  });

  it('t(key) resuelve el idioma por defecto (en)', () => {
    renderI18n(<Probe />);

    expect(screen.getByTestId('probe')).toHaveTextContent('Save');
    expect(captured?.locale).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('locale es activo → traduce y actualiza <html lang>', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'es');

    renderI18n(<Probe />);

    expect(screen.getByTestId('probe')).toHaveTextContent('Guardar');
    expect(captured?.locale).toBe('es');
    expect(document.documentElement.lang).toBe('es');
  });

  it('clave sin traducir en el idioma activo → fallback a en', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'es');

    renderI18n(<Probe />);

    // auth fue borrado del diccionario es en el mock
    expect(captured?.t('auth.login.submit')).toBe('Sign in');
  });

  it('clave inexistente en ambos idiomas → devuelve la propia clave', () => {
    renderI18n(<Probe />);

    expect(captured?.t('nope.missing')).toBe('nope.missing');
  });

  it('interpola parámetros {name}', () => {
    renderI18n(<Probe />);

    expect(captured?.t('demo.hello', { name: 'Ana' })).toBe('Hi Ana');
    // parámetro ausente → el marcador se queda tal cual
    expect(captured?.t('demo.hello')).toBe('Hi {name}');
  });

  it('formatPrice del contexto usa el locale activo', () => {
    renderI18n(<Probe />);

    expect(captured?.formatPrice(43)).toBe('€43.00');
    expect(captured?.formatPrice(null)).toBe('—');
  });

  it('setLocale cambia el idioma, lo persiste y actualiza <html lang>', () => {
    renderI18n(<Probe />);

    act(() => {
      captured?.setLocale('es' satisfies Locale);
    });

    expect(captured?.locale).toBe('es');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('es');
    expect(document.documentElement.lang).toBe('es');
    expect(screen.getByTestId('probe')).toHaveTextContent('Guardar');
  });

  it('preferencia del usuario (localStorage) gana al tenant', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');

    renderI18n(<Probe />, { tenantLanguage: 'es' });

    expect(captured?.locale).toBe('en');
  });

  it('tenantLanguage inyectado gana al navegador', () => {
    renderI18n(<Probe />, { tenantLanguage: 'es' });

    expect(captured?.locale).toBe('es');
  });

  it('sin preferencia ni tenant → navigator.language', () => {
    const spy = vi
      .spyOn(window.navigator, 'language', 'get')
      .mockReturnValue('es-MX');

    renderI18n(<Probe />);

    expect(captured?.locale).toBe('es');

    spy.mockRestore();
  });

  it('idioma no soportado en las 3 fuentes → fallback a en', () => {
    const spy = vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('fr-FR');

    renderI18n(<Probe />, { tenantLanguage: 'de-DE' });

    expect(captured?.locale).toBe('en');

    spy.mockRestore();
  });

  it('useI18n fuera del provider lanza error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('useI18n must be used within an I18nProvider');
    spy.mockRestore();
  });
});
