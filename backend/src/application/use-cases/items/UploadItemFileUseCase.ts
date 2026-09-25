/**
 * @file UploadItemFileUseCase.ts
 * @module application/use-cases/items
 */

import Item from '../../../domain/entities/Item';
import IItemRepository from '../../interfaces/IItemRepository';
import logger from '../../../infrastructure/logging/requestContext';
import BitacoraService from '../../../infrastructure/logging/BitacoraService';
import { uploadFile, deleteFile } from '../../../infrastructure/storage/storageService';
import { dispatchEvent } from '../../../infrastructure/webhooks/webhookClient';

interface UploadItemFileInput {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export default class UploadItemFileUseCase {
  constructor(
    private readonly itemRepository: IItemRepository,
    private readonly bitacoraService: BitacoraService
  ) {}

  async execute(itemId: string, file: UploadItemFileInput, uploadedBy: string): Promise<Item> {
    logger.info({ itemId, mimetype: file.mimetype, size: file.size }, 'UploadItemFileUseCase: starting');

    const item = await this.itemRepository.findById(itemId);
    if (!item) {
      throw new Error('Item not found');
    }

    // Borrar el fichero anterior si existía
    if (item.fileKey) {
      try {
        await deleteFile(item.fileKey);
      } catch (err) {
        logger.warn({ itemId, oldKey: item.fileKey, err }, 'Failed to delete previous file, continuing');
      }
    }

    const key = `items/${itemId}/${Date.now()}-${sanitizeFilename(file.originalname)}`;
    await uploadFile(key, file.buffer, file.mimetype);

    const updated = item.withUpdates({ fileKey: key, mimeType: file.mimetype });
    await this.itemRepository.save(updated);

    await this.bitacoraService.log({
      userId: uploadedBy,
      action: 'file_uploaded',
      entityType: 'item',
      entityId: itemId,
      metadata: { fileKey: key, mimetype: file.mimetype, size: file.size },
    });

    await dispatchEvent('file_uploaded', {
      item_id: itemId,
      file_key: key,
      uploaded_at: new Date().toISOString(),
      size: file.size,
      mimetype: file.mimetype,
    });

    logger.info({ itemId, key }, 'UploadItemFileUseCase: completed');
    return updated;
  }
}
