import { BadRequestException } from '@nestjs/common';

import { SurveyIneStorageService } from './survey-ine-storage';

function jpegDataUrl(mime = 'image/jpeg') {
  const bytes = Buffer.alloc(12_000, 0x11);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  bytes[3] = 0xe0;
  bytes[100] = 0xff;
  bytes[101] = 0xda;
  bytes[bytes.length - 2] = 0xff;
  bytes[bytes.length - 1] = 0xd9;
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

describe('SurveyIneStorageService image validation', () => {
  const service = new SurveyIneStorageService();

  it('accepts a supported image only when its binary signature matches', () => {
    const image = service.prepareImage(jpegDataUrl(), 'frente');

    expect(image.mimeType).toBe('image/jpeg');
    expect(image.bytes.length).toBe(12_000);
  });

  it('rejects a file whose declared image type does not match its bytes', () => {
    expect(() =>
      service.prepareImage(jpegDataUrl('image/png'), 'frente'),
    ).toThrow(BadRequestException);
  });

  it('rejects arbitrary bytes disguised as an image', () => {
    const bytes = Buffer.alloc(12_000, 0x41);
    const value = `data:image/jpeg;base64,${bytes.toString('base64')}`;

    expect(() => service.prepareImage(value, 'reverso')).toThrow(
      BadRequestException,
    );
  });

  it('rejects a file that only copies the beginning and end of a JPEG', () => {
    const bytes = Buffer.alloc(12_000, 0x41);
    bytes[0] = 0xff;
    bytes[1] = 0xd8;
    bytes[2] = 0xff;
    bytes[bytes.length - 2] = 0xff;
    bytes[bytes.length - 1] = 0xd9;
    const value = `data:image/jpeg;base64,${bytes.toString('base64')}`;

    expect(() => service.prepareImage(value, 'frente')).toThrow(
      BadRequestException,
    );
  });
});
