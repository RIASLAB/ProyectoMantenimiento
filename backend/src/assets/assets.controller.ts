import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, StreamableFile, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { EstadoActivo, Rol } from '../common/enums';
import { CreateAssetDto, CreateManyAssetsDto, InstallAssetDto, UpdateAssetDto } from './assets.dto';
import { AssetsService } from './assets.service';

const LIMITE_MULTER = Number(process.env.MAX_UPLOAD_MB ?? 20) * 1024 * 1024 + 1;

@Controller('activos')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  list(
    @Query('q') q?: string, @Query('estado') estado?: EstadoActivo, @Query('area') area?: string,
    @Query('modeloId', new ParseUUIDPipe({ optional: true })) modeloId?: string,
    @Query('categoriaId', new ParseUUIDPipe({ optional: true })) categoriaId?: string,
  ) {
    return this.assets.list({ q, estado, area, modeloId, categoriaId });
  }

  @Get('areas')
  areas() {
    return this.assets.areas();
  }

  @Get('documentos/:docId/archivo')
  async document(@Param('docId', ParseUUIDPipe) docId: string, @Res({ passthrough: true }) res: Response) {
    const { doc, stream } = await this.assets.openDocument(docId);
    res.set({
      'Content-Type': doc.mime,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(doc.nombreOriginal)}`,
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(stream);
  }

  @Delete('documentos/:docId')
  @Roles(Rol.ADMIN)
  deleteDocument(@Param('docId', ParseUUIDPipe) docId: string, @CurrentUser() actor: SessionUser) {
    return this.assets.deleteDocument(docId, actor);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.assets.get(id);
  }

  @Post()
  @Roles(Rol.ADMIN)
  create(@Body() dto: CreateAssetDto, @CurrentUser() actor: SessionUser) {
    return this.assets.create(dto, actor);
  }

  @Post(':id/instalar')
  @Roles(Rol.ADMIN)
  instalar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: InstallAssetDto, @CurrentUser() actor: SessionUser) {
    return this.assets.instalar(id, dto, actor);
  }

  @Post('varios')
  @Roles(Rol.ADMIN)
  createMany(@Body() dto: CreateManyAssetsDto, @CurrentUser() actor: SessionUser) {
    return this.assets.createMany(dto, actor);
  }

  @Patch(':id')
  @Roles(Rol.ADMIN)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAssetDto, @CurrentUser() actor: SessionUser) {
    return this.assets.update(id, dto, actor);
  }

  @Post(':id/documentos')
  @Roles(Rol.ADMIN)
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: LIMITE_MULTER, files: 1 } }))
  upload(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() actor: SessionUser,
  ) {
    return this.assets.addDocument(id, file, actor);
  }
}
