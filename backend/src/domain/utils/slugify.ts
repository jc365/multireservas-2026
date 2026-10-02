/**
 * @file slugify.ts
 * @module domain/utils
 *
 * Slug kebab-case a partir de un nombre libre (F4.4a — registro
 * público auto-genera el slug del tenant). Minúsculas, sin
 * acentos, solo [a-z0-9] unidos por guiones. Si no queda nada
 * (p. ej. "!!!"), devuelve el fallback `tenant`.
 */

export default function slugify(value: string, fallback: string = 'tenant'): string {
  const slug = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : fallback;
}
