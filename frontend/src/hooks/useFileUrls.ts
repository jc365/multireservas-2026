/**
 * @file useFileUrls.ts
 * @module hooks
 *
 * Hook que precarga URLs para ficheros con fileKey (R2 o local).
 * Llama a GET /files/:key/url por cada fichero con fileKey.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import client from '../api/client';

export interface FileRef {
  id: string;
  fileKey?: string | null;
}

interface FileUrlMap {
  [fileId: string]: string;
}

export function useFileUrls(files: FileRef[]): {
  fileUrls: FileUrlMap;
  loading: boolean;
  refreshAll: () => void;
} {
  const [fileUrls, setFileUrls] = useState<FileUrlMap>({});
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);
  const lastKeysRef = useRef<string>('');

  const fetchUrls = useCallback(async (refs: Array<{ id: string; key: string }>) => {
    if (refs.length === 0) return;
    setLoading(true);

    const results = await Promise.allSettled(
      refs.map(async ({ id, key }) => {
        const res = await client.get(`/files/${key}/url`);
        return { id, url: res.data.url as string };
      })
    );

    if (!mountedRef.current) return;

    const newUrls: FileUrlMap = {};
    for (const result of results) {
      if (result.status === 'fulfilled') {
        newUrls[result.value.id] = result.value.url;
      }
    }
    setFileUrls((prev) => ({ ...prev, ...newUrls }));
    setLoading(false);
  }, []);

  const refreshAll = useCallback(() => {
    const keys = files
      .filter((f) => f.fileKey)
      .map((f) => f.fileKey as string)
      .sort()
      .join(',');
    if (keys === lastKeysRef.current) return;
    lastKeysRef.current = keys;

    const refs = files
      .filter((f) => f.fileKey)
      .map((f) => ({ id: f.id, key: f.fileKey as string }));
    fetchUrls(refs);
  }, [files, fetchUrls]);

  useEffect(() => {
    mountedRef.current = true;
    refreshAll();
    return () => { mountedRef.current = false; };
  }, [refreshAll]);

  return { fileUrls, loading, refreshAll };
}
