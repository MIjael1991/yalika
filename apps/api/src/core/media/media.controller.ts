import {
  BadRequestException,
  Controller,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { memoryStorage } from 'multer';

import {
  IMAGE_EXTENSIONS,
  IMAGE_FILE_NAME,
  MediaStorageService,
} from './media-storage.service';

// R11B-1: comprueba que la firma del archivo corresponde al MIME indicado.
// No sustituye decodificacion, saneamiento EXIF ni limites de pixeles.
export function matchesImageSignature(bytes: Buffer, mime: string): boolean {
  if (mime === 'image/jpeg') {
    return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 &&
      bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  }
  if (mime === 'image/png') {
    return bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) &&
      bytes.toString('ascii', 12, 16) === 'IHDR';
  }
  if (mime === 'image/gif') {
    return bytes.length >= 13 && ['GIF87a','GIF89a'].includes(bytes.toString('ascii',0,6));
  }
  if (mime === 'image/webp') {
    return bytes.length >= 16 && bytes.toString('ascii',0,4) === 'RIFF' &&
      bytes.toString('ascii',8,12) === 'WEBP' &&
      ['VP8 ','VP8L','VP8X'].includes(bytes.toString('ascii',12,16));
  }
  return false;
}

@Controller('media')
export class MediaController {
  constructor(private readonly storage: MediaStorageService) {}

  @Post('image')
  @UseInterceptors(
    FileInterceptor('file', {
      // En memoria: se revisa el contenido antes de guardar nada, y se guarda en R2 sin tocar el disco.
      storage: memoryStorage(),
      limits: {
        fileSize: 6 * 1024 * 1024,
      },
      fileFilter: (_request, file, callback) => {
        const allowed = new Set([
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/gif',
        ]);

        if (!allowed.has(file.mimetype)) {
          callback(
            new BadRequestException(
              'Solo se permiten imágenes JPG, PNG, WEBP o GIF',
            ),
            false,
          );
          return;
        }

        callback(null, true);
      },
    }),
  )
  async uploadImage(
    @UploadedFile()
    file?: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
  ) {
    if (!file) {
      throw new BadRequestException('Selecciona una imagen');
    }

    if (!matchesImageSignature(file.buffer, file.mimetype)) {
      throw new BadRequestException('El contenido no corresponde a una imagen valida');
    }

    const filename = `${randomUUID()}${IMAGE_EXTENSIONS[file.mimetype] ?? '.jpg'}`;

    try {
      await this.storage.save(filename, file.buffer, file.mimetype);
    } catch {
      throw new InternalServerErrorException(
        'No fue posible guardar la imagen. Intenta de nuevo',
      );
    }

    return {
      url: `/api/yalika/media/image/${filename}`,
      filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  @Get('image/:filename')
  findImage(@Param('filename') filename: string, @Res() response: Response) {
    if (!IMAGE_FILE_NAME.test(filename)) {
      throw new BadRequestException('Nombre de imagen inválido');
    }

    const location = this.storage.locate(filename);

    if (!location) {
      throw new NotFoundException('La imagen no existe');
    }

    if (location.kind === 'redirect') {
      // El navegador lee la foto directo de R2; la API no transmite los bytes.
      response.setHeader('Cache-Control', location.cacheControl);
      return response.redirect(302, location.url);
    }

    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    return response.sendFile(location.path);
  }
}
