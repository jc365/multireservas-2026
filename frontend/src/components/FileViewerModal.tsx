/**
 * @file FileViewerModal.tsx
 * @module components
 *
 * Modal genérico para previsualizar ficheros (imagen, video, audio, pdf, texto, json).
 */

import { useState, useEffect, useMemo } from 'react';
import { useFileUrls } from '../hooks/useFileUrls';

interface FileViewerModalProps {
  isOpen: boolean;
  file: {
    key: string;
    mimeType: string;
    url?: string | null;
    name?: string;
  } | null;
  onClose: () => void;
}

function getFileKind(mimeType: string): 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'other' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'text/plain' || mimeType === 'application/json') return 'text';
  return 'other';
}

function TextPreview({ url }: { url: string }) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) {
          setContent(text);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load text');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [url]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-on-surface-variant p-8">
        <span className="material-symbols-outlined animate-spin">progress_activity</span>
        Loading text...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-error-container text-on-error-container p-4 rounded text-sm">
        {error}
      </div>
    );
  }

  return (
    <pre className="w-full max-h-[80vh] overflow-auto bg-surface-container-low border border-outline-variant/30 rounded-lg p-4 font-body-sm text-body-sm text-on-surface whitespace-pre-wrap break-words">
      {content}
    </pre>
  );
}

export default function FileViewerModal({ isOpen, file, onClose }: FileViewerModalProps) {
  const fileRefs = useMemo(
    () => file ? [{ id: 'current', fileKey: file.key }] : [],
    [file?.key],
  );
  const { fileUrls, loading: urlLoading } = useFileUrls(fileRefs);
  const resolvedUrl = file?.url ?? fileUrls['current'] ?? null;

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen || !file) return null;

  const kind = getFileKind(file.mimeType);

  const renderContent = () => {
    if (urlLoading && !resolvedUrl) {
      return (
        <div className="flex items-center gap-3 text-on-surface-variant p-8">
          <span className="material-symbols-outlined animate-spin">progress_activity</span>
          Loading file...
        </div>
      );
    }

    if (!resolvedUrl) {
      return (
        <div className="text-on-surface-variant p-8 text-center">
          Could not load file
        </div>
      );
    }

    switch (kind) {
      case 'image':
        return <img src={resolvedUrl} alt={file.name || file.key} className="max-w-full max-h-[80vh] object-contain" />;
      case 'video':
        return <video src={resolvedUrl} controls className="max-w-full max-h-[80vh]" />;
      case 'audio':
        return <audio src={resolvedUrl} controls className="w-full" />;
      case 'pdf':
        return <iframe src={resolvedUrl} className="w-full h-[80vh]" title={file.name || file.key} />;
      case 'text':
        return <TextPreview url={resolvedUrl} />;
      default:
        return (
          <div className="text-center p-8">
            <span className="material-symbols-outlined text-on-surface-variant text-[48px] block mb-3">description</span>
            <p className="text-on-surface-variant mb-4">Preview not available for this file type</p>
            <a
              href={resolvedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 py-2.5 px-5 bg-primary-container text-on-primary-container font-title-sm text-title-sm rounded hover:bg-primary transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              Download
            </a>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-md" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`File: ${file.name || file.key}`}
        className="relative w-full max-w-5xl mx-4 max-h-[90vh] overflow-y-auto bg-surface rounded-xl border border-outline-variant/30 shadow-xl"
      >
        <div className="flex items-center justify-between p-4 border-b border-outline-variant/30">
          <h2 className="font-title-sm text-title-sm text-on-surface truncate">
            {file.name || file.key}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full hover:bg-surface-container-high flex items-center justify-center transition-colors shrink-0 ml-4"
          >
            <span className="material-symbols-outlined text-on-surface-variant">close</span>
          </button>
        </div>
        <div className="p-4 flex justify-center">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
