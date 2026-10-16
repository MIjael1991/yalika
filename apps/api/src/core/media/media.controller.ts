import {
  BadRequestException,
  Controller,
  Get,
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
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { basename, join } from 'node:path';
import { diskStorage } from 'multer';

const imageDirectory = join(process.cwd(), 'uploads', 'images');

function ensureImageDirectory() {
  mkdirSync(imageDirectory, {
    recursive: true,
  });
}

// R11B-1: comprueba que la firma del archivo corresponde al MIME indicado.
// No sustituye decodificacion, saneamiento EXIF ni limites de pixeles.
function matchesImageSignature(path: string, mime: string): boolean {
  const bytes = readFileSync(path);
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
  @Post('image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_request, _file, callback) => {
          ensureImageDirectory();
          callback(null, imageDirectory);
        },
        filename: (_request, file, callback) => {
          const extensions: Record<string, string> = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/webp': '.webp',
            'image/gif': '.gif',
          };
          const extension = extensions[file.mimetype] ?? '.jpg';

          callback(null, `${randomUUID()}${extension}`);
        },
      }),
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
  uploadImage(
    @UploadedFile()
    file?: {
      filename: string;
      originalname: string;
      mimetype: string;
      size: number;
    },
  ) {
    if (!file) {
      throw new BadRequestException('Selecciona una imagen');
    }

    const storedPath = join(imageDirectory, file.filename);
    let verified = false;
    try {
      verified = matchesImageSignature(storedPath, file.mimetype);
    } finally {
      if (!verified && existsSync(storedPath)) unlinkSync(storedPath);
    }
    if (!verified) throw new BadRequestException('El contenido no corresponde a una imagen valida');

    return {
      url: `/api/orion/media/image/${file.filename}`,
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  @Get('image/:filename')
  findImage(@Param('filename') filename: string, @Res() response: Response) {
    const safeFilename = basename(filename);

    if (safeFilename !== filename) {
      throw new BadRequestException('Nombre de imagen inválido');
    }

    const filePath = join(imageDirectory, safeFilename);

    if (!existsSync(filePath)) {
      throw new NotFoundException('La imagen no existe');
    }

    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    return response.sendFile(filePath);
  }
}
