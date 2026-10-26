import { BadRequestException } from '@nestjs/common';

/**
 * Tipos de archivo permitidos, validados por la firma (primeros bytes) y no solo por la extensión
 * o el tipo que declara el navegador: así un ejecutable renombrado a .pdf no se acepta.
 */
export const FILE_TYPES: Record<string, { ext: string; firma: (b: Buffer) => boolean }> = {
  'application/pdf': { ext: '.pdf', firma: (b) => b.subarray(0, 4).toString('latin1') === '%PDF' },
  'image/jpeg': { ext: '.jpg', firma: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: '.png', firma: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
};

export function validateUpload(file: Express.Multer.File | undefined, maxBytes: number, allowed: string[]) {
  if (!file) throw new BadRequestException('Debe adjuntar un archivo en el campo "archivo"');
  if (file.size > maxBytes) throw new BadRequestException(`El archivo supera ${Math.round(maxBytes / 1024 / 1024)} MB`);
  const tipo = FILE_TYPES[file.mimetype];
  if (!allowed.includes(file.mimetype) || !tipo || !tipo.firma(file.buffer)) {
    const nombres = allowed.map((m) => FILE_TYPES[m]?.ext.slice(1).toUpperCase()).join(', ');
    throw new BadRequestException(`Solo se permiten archivos ${nombres} válidos`);
  }
  return tipo;
}
