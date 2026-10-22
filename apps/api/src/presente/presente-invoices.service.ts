import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthContext } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import type { FiscalDataDto, InvoiceUploadDto } from './dto/presente.dto';
import {
  fiscalProblems,
  INVOICE_DAYS,
  ivaFor,
  normalizeRfc,
  readCfdi,
  readFileDataUrl,
  type InvoiceData,
} from './presente-invoice.domain';
import { PresentePushService } from './presente-push.service';
import { PresenteRemindersService } from './presente-reminders.service';
import { PresenteStorageService } from './presente-storage.service';

const MAX_PDF_BYTES = 3_000_000;
const MAX_XML_BYTES = 1_000_000;

/**
 * Factura por medio de Tequio. El profesional que da factura la timbra con su RFC (en el portal
 * del SAT o su sistema) y la sube aquí; el cliente la recibe y la descarga. Tequio revisa que el
 * XML sea un CFDI timbrado para el RFC del cliente.
 */
@Injectable()
export class PresenteInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: PresenteStorageService,
    private readonly push: PresentePushService,
    private readonly reminders: PresenteRemindersService,
  ) {}

  // ---------- Cliente: sus datos para factura ----------

  async fiscal(auth: AuthContext) {
    const client = await this.prisma.presenteClient.findUnique({
      where: { userId: auth.user.id },
    });
    const data: InvoiceData = {
      rfc: client?.fiscalRfc ?? '',
      name: client?.fiscalName ?? '',
      regime: client?.fiscalRegime ?? '',
      zip: client?.fiscalZip ?? '',
      use: client?.fiscalUse ?? 'G03',
      email: client?.fiscalEmail ?? auth.user.email ?? null,
    };
    return { ...data, complete: fiscalProblems(data).length === 0 };
  }

  async saveFiscal(auth: AuthContext, dto: FiscalDataDto) {
    const data: InvoiceData = {
      rfc: normalizeRfc(dto.rfc),
      name: dto.name.trim().toUpperCase(),
      regime: dto.regime,
      zip: dto.zip.trim(),
      use: dto.use,
      email: dto.email?.trim() || null,
    };
    const problems = fiscalProblems(data);
    if (problems.length) {
      throw new BadRequestException(
        problems.includes('RFC')
          ? 'Revisa tu RFC: 12 caracteres si es empresa, 13 si es persona'
          : 'Revisa tus datos para factura: nombre, régimen, código postal y uso',
      );
    }
    const fields = {
      fiscalRfc: data.rfc,
      fiscalName: data.name,
      fiscalRegime: data.regime,
      fiscalZip: data.zip,
      fiscalUse: data.use,
      fiscalEmail: data.email,
    };
    await this.prisma.presenteClient.upsert({
      where: { userId: auth.user.id },
      create: { userId: auth.user.id, displayName: auth.user.name, ...fields },
      update: fields,
    });
    return this.fiscal(auth);
  }

  /** Al pedir con factura: copia de sus datos fiscales (o error si están incompletos). */
  async snapshot(userId: string): Promise<InvoiceData> {
    const client = await this.prisma.presenteClient.findUnique({
      where: { userId },
    });
    const data: InvoiceData = {
      rfc: client?.fiscalRfc ?? '',
      name: client?.fiscalName ?? '',
      regime: client?.fiscalRegime ?? '',
      zip: client?.fiscalZip ?? '',
      use: client?.fiscalUse ?? '',
      email: client?.fiscalEmail ?? null,
    };
    if (fiscalProblems(data).length) {
      throw new BadRequestException(
        'Para pedir factura, primero llena tus datos para factura',
      );
    }
    return data;
  }

  // ---------- Profesional: pendientes de facturar ----------

  private async myProviderId(auth: AuthContext) {
    const provider = await this.prisma.presenteProvider.findUnique({
      where: { userId: auth.user.id },
      select: { id: true },
    });
    if (!provider)
      throw new NotFoundException('Primero regístrate para trabajar');
    return provider.id;
  }

  /** Trabajos terminados donde el cliente pidió factura: los que faltan y los ya enviados. */
  async mine(auth: AuthContext) {
    const providerId = await this.myProviderId(auth);
    const done = await this.prisma.presenteRequest.findMany({
      where: {
        needsInvoice: true,
        status: 'COMPLETED',
        quotes: { some: { providerId, status: 'ACCEPTED' } },
      },
      include: { quotes: { where: { providerId, status: 'ACCEPTED' } } },
      orderBy: { finishedAt: 'desc' },
      take: 50,
    });
    const sent = await this.prisma.presenteInvoice.findMany({
      where: { providerId },
      orderBy: { sentAt: 'desc' },
      take: 50,
    });
    const sentIds = new Set(sent.map((i) => i.requestId));
    return {
      pending: done
        .filter((r) => !sentIds.has(r.id))
        .map((r) => {
          const amount = r.finalAmountMxn ?? r.quotes[0]?.amountMxn ?? 0;
          const iva = ivaFor(amount);
          return {
            requestId: r.id,
            trades: r.trades,
            description: r.description,
            finishedAt: r.finishedAt,
            // Antes de esta fecha; después el cliente puede calificar «No entregó factura».
            dueAt: r.finishedAt
              ? new Date(r.finishedAt.getTime() + INVOICE_DAYS * 86_400_000)
              : null,
            amountMxn: amount,
            ivaMxn: iva,
            totalMxn: amount + iva,
            client: r.invoiceData as InvoiceData | null,
          };
        }),
      sent: sent.map((i) => ({
        requestId: i.requestId,
        uuid: i.uuid,
        receiverRfc: i.receiverRfc,
        totalMxn: i.totalMxn,
        sentAt: i.sentAt,
      })),
    };
  }

  /** El profesional sube el PDF y el XML de la factura; el cliente la recibe. */
  async upload(auth: AuthContext, requestId: string, dto: InvoiceUploadDto) {
    const providerId = await this.myProviderId(auth);
    const request = await this.prisma.presenteRequest.findUnique({
      where: { id: requestId },
      include: { quotes: { where: { providerId, status: 'ACCEPTED' } } },
    });
    if (!request || !request.quotes.length) {
      throw new NotFoundException('Trabajo no encontrado');
    }
    if (!request.needsInvoice || request.status !== 'COMPLETED') {
      throw new ConflictException('Este trabajo no espera factura');
    }
    if (
      await this.prisma.presenteInvoice.findUnique({ where: { requestId } })
    ) {
      throw new ConflictException('Ya mandaste la factura de este trabajo');
    }
    const pdf = readFileDataUrl(dto.pdf, 'pdf', MAX_PDF_BYTES);
    if (!pdf) throw new BadRequestException('Sube el PDF de la factura');
    const xml = readFileDataUrl(dto.xml, 'xml', MAX_XML_BYTES);
    const cfdi = xml ? readCfdi(xml.bytes.toString('utf8')) : null;
    if (!xml || !cfdi) {
      throw new BadRequestException(
        'Sube el XML de la factura (el archivo .xml)',
      );
    }
    if (!cfdi.uuid) {
      throw new BadRequestException(
        'El XML no está timbrado (no tiene folio fiscal). Sube el XML timbrado.',
      );
    }
    const expected = (request.invoiceData as InvoiceData | null)?.rfc ?? '';
    if (normalizeRfc(cfdi.receiverRfc ?? '') !== normalizeRfc(expected)) {
      throw new BadRequestException(
        `La factura es para el RFC ${cfdi.receiverRfc ?? 'desconocido'}, pero el cliente pidió para ${expected}`,
      );
    }
    const pdfKey = this.storage.newKey(providerId, 'factura-pdf');
    const xmlKey = this.storage.newKey(providerId, 'factura-xml');
    await this.storage.put(pdfKey, pdf.bytes);
    await this.storage.put(xmlKey, xml.bytes);
    await this.prisma.presenteInvoice.create({
      data: {
        requestId,
        providerId,
        clientUserId: request.clientUserId,
        uuid: cfdi.uuid,
        receiverRfc: normalizeRfc(cfdi.receiverRfc ?? ''),
        totalMxn: cfdi.total,
        pdfKey,
        xmlKey,
      },
    });
    await this.prisma.presenteMessage.create({
      data: {
        requestId,
        senderUserId: auth.user.id,
        senderRole: 'SYSTEM',
        body: 'Tu factura ya está lista. Descárgala en tu pedido (PDF y XML).',
      },
    });
    await this.reminders.closeInvoice(requestId);
    void this.push.notify([request.clientUserId], {
      title: 'Tu factura está lista',
      body: 'Descárgala en tu pedido (PDF y XML).',
      url: `/tequio/pedido/${requestId}`,
      tag: `factura-${requestId}`,
    });
    return this.mine(auth);
  }

  // ---------- Cliente: descargar ----------

  async forRequest(requestId: string) {
    const invoice = await this.prisma.presenteInvoice.findUnique({
      where: { requestId },
    });
    return invoice
      ? {
          uuid: invoice.uuid,
          sentAt: invoice.sentAt,
          totalMxn: invoice.totalMxn,
        }
      : null;
  }

  async clientFile(auth: AuthContext, requestId: string, which: string) {
    const invoice = await this.prisma.presenteInvoice.findUnique({
      where: { requestId },
    });
    if (!invoice || invoice.clientUserId !== auth.user.id) {
      throw new NotFoundException('Factura no encontrada');
    }
    const xml = which === 'xml';
    const bytes = await this.storage.get(xml ? invoice.xmlKey : invoice.pdfKey);
    const mime = xml ? 'text/xml' : 'application/pdf';
    return {
      dataUrl: `data:${mime};base64,${bytes.toString('base64')}`,
      fileName: `factura-${invoice.uuid ?? requestId}.${xml ? 'xml' : 'pdf'}`,
    };
  }
}
