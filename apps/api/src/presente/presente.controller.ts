import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';

import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { PlatformOperatorGuard } from '../auth/platform-operator.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import {
  ArriveDto,
  BiometricConsentDto,
  CancelJobDto,
  ChooseQuoteDto,
  CloseProblemDto,
  CreateHelpRequestDto,
  CredentialDto,
  SepProofDto,
  EnRouteDto,
  FavoriteDto,
  FinishJobDto,
  FollowUpProposalDto,
  LocationDto,
  MessageDto,
  PhotoUploadDto,
  PlaceDto,
  ProviderPhotoDto,
  ReportProblemDto,
  ReviewDecisionDto,
  ReviewDto,
  SaveClientProfileDto,
  SaveProviderProfileDto,
  SearchProvidersDto,
  SendQuoteDto,
  SetPresenceDto,
  SiteChoiceDto,
  StartJobDto,
  SuspendProviderDto,
  UploadProviderDocumentDto,
  WalletTopupDto,
  PushEndpointDto,
  PushSubscriptionDto,
  FiscalDataDto,
  AuthorityRefDto,
  CallRecordingDto,
  CallSignalDto,
  OnlineTopupDto,
  InvoiceUploadDto,
} from './dto/presente.dto';
import { MUNICIPALITIES } from './geo/municipios';
import { PresenteCredentialsService } from './presente-credentials.service';
import { PresenteCallsService } from './presente-calls.service';
import { PresenteMercadoPagoService } from './presente-mercadopago.service';
import { PresenteSafetyService } from './presente-safety.service';
import { PresenteDebtsService } from './presente-debts.service';
import { PresenteInvoicesService } from './presente-invoices.service';
import { PresenteErrorsFilter } from './presente-errors.filter';
import { PresenteFeatureGuard } from './presente-feature.guard';
import { PresenteJobsService } from './presente-jobs.service';
import { PresentePlacesService } from './presente-places.service';
import { PresentePushService } from './presente-push.service';
import { PresenteRequestsService } from './presente-requests.service';
import { PresenteWalletService } from './presente-wallet.service';
import { PresenteService } from './presente.service';

@Controller('presente')
@UseGuards(SessionAuthGuard, PresenteFeatureGuard)
@UseFilters(PresenteErrorsFilter)
export class PresenteController {
  constructor(
    private readonly presente: PresenteService,
    private readonly requests: PresenteRequestsService,
    private readonly jobs: PresenteJobsService,
    private readonly wallet: PresenteWalletService,
    private readonly placesService: PresentePlacesService,
    private readonly credentials: PresenteCredentialsService,
    private readonly debts: PresenteDebtsService,
    private readonly invoices: PresenteInvoicesService,
    private readonly push: PresentePushService,
    private readonly calls: PresenteCallsService,
    private readonly mercadoPago: PresenteMercadoPagoService,
    private readonly safety: PresenteSafetyService,
  ) {}

  // Catálogo de municipios (por ahora los 113 de Michoacán)
  @Get('municipalities')
  municipalities() {
    return MUNICIPALITIES.map(({ code, name, stateName, lat, lng }) => ({
      code,
      name,
      stateName,
      lat,
      lng,
    }));
  }

  // ---------- Quien pide ayuda ----------

  @Get('client/me')
  getClient(@CurrentAuth() auth: AuthContext) {
    return this.jobs.getClient(auth);
  }

  @Put('client/me')
  saveClient(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: SaveClientProfileDto,
  ) {
    return this.jobs.saveClient(auth, dto);
  }

  @Post('client/me/house-photo')
  setHousePhoto(@CurrentAuth() auth: AuthContext, @Body() dto: PhotoUploadDto) {
    return this.jobs.setHousePhoto(auth, dto.dataUrl);
  }

  // Lugares guardados: Casa, Casa de mamá, Oficina...
  @Get('client/places')
  listPlaces(@CurrentAuth() auth: AuthContext) {
    return this.placesService.list(auth);
  }

  @Post('client/places')
  addPlace(@CurrentAuth() auth: AuthContext, @Body() dto: PlaceDto) {
    return this.placesService.create(auth, dto);
  }

  @Put('client/places/:id')
  updatePlace(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: PlaceDto,
  ) {
    return this.placesService.update(auth, id, dto);
  }

  @Delete('client/places/:id')
  removePlace(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.placesService.remove(auth, id);
  }

  @Post('client/places/:id/photo')
  setPlacePhoto(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: PhotoUploadDto,
  ) {
    return this.placesService.setPhoto(auth, id, dto.dataUrl);
  }

  @Get('client/places/:id/photo')
  placePhoto(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.placesService.photo(auth, id);
  }

  // ---------- Avisos al celular ----------

  @Get('push/key')
  pushKey() {
    return this.push.publicKey();
  }

  @Get('push/status')
  pushStatus(@CurrentAuth() auth: AuthContext) {
    return this.push.status(auth);
  }

  @Post('push/subscribe')
  pushSubscribe(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: PushSubscriptionDto,
  ) {
    return this.push.subscribe(auth, dto);
  }

  @Post('push/unsubscribe')
  pushUnsubscribe(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: PushEndpointDto,
  ) {
    return this.push.unsubscribe(auth, dto.endpoint);
  }

  /** El celular lo pide al recibir un aviso: lo que hay que mostrar. */
  @Get('push/inbox')
  pushInbox(@CurrentAuth() auth: AuthContext) {
    return this.push.inbox(auth);
  }

  // ---------- Factura ----------

  /** Mis datos para factura (RFC, nombre, régimen, CP, uso). */
  @Get('client/fiscal')
  myFiscal(@CurrentAuth() auth: AuthContext) {
    return this.invoices.fiscal(auth);
  }

  @Put('client/fiscal')
  saveFiscal(@CurrentAuth() auth: AuthContext, @Body() dto: FiscalDataDto) {
    return this.invoices.saveFiscal(auth, dto);
  }

  /** Descargar mi factura de un pedido (pdf o xml). */
  @Get('requests/:id/invoice/:which')
  invoiceFile(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Param('which') which: string,
  ) {
    return this.invoices.clientFile(auth, id, which);
  }

  /** Profesional: trabajos que esperan factura y facturas mandadas. */
  @Get('work/invoices')
  myInvoices(@CurrentAuth() auth: AuthContext) {
    return this.invoices.mine(auth);
  }

  @Post('work/invoices/:id')
  uploadInvoice(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: InvoiceUploadDto,
  ) {
    return this.invoices.upload(auth, id, dto);
  }

  // ---------- Llamadas por Tequio (sin números) ----------

  @Get('calls/config')
  callConfig() {
    return this.calls.config();
  }

  @Post('requests/:id/calls')
  startCall(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: CallSignalDto,
  ) {
    return this.calls.start(auth, id, dto.sdp);
  }

  @Get('requests/:id/calls/current')
  currentCall(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.calls.current(auth, id);
  }

  @Get('calls/:id')
  getCall(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.calls.get(auth, id);
  }

  @Post('calls/:id/answer')
  answerCall(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: CallSignalDto,
  ) {
    return this.calls.answer(auth, id, dto.sdp);
  }

  @Post('calls/:id/recording/start')
  startCallRecording(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
  ) {
    return this.calls.startRecording(auth, id);
  }

  @Post('calls/:id/recording')
  saveCallRecording(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: CallRecordingDto,
  ) {
    return this.calls.saveRecording(auth, id, dto.audio, dto.seconds);
  }

  @Get('requests/:id/recordings/:recordingId')
  callRecording(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Param('recordingId') recordingId: string,
  ) {
    return this.calls.recording(auth, id, recordingId);
  }

  @Post('calls/:id/end')
  endCall(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.calls.end(auth, id);
  }

  /** Lo que debo por cancelar con el trabajador en camino (se suma a mi siguiente pedido). */
  @Get('client/debts')
  myDebts(@CurrentAuth() auth: AuthContext) {
    return this.debts.mine(auth);
  }

  @Get('client/favorites')
  favorites(@CurrentAuth() auth: AuthContext) {
    return this.requests.favorites(auth);
  }

  @Post('client/favorites')
  addFavorite(@CurrentAuth() auth: AuthContext, @Body() dto: FavoriteDto) {
    return this.requests.addFavorite(auth, dto.providerId);
  }

  @Delete('client/favorites/:providerId')
  removeFavorite(
    @CurrentAuth() auth: AuthContext,
    @Param('providerId') providerId: string,
  ) {
    return this.requests.removeFavorite(auth, providerId);
  }

  @Post('requests')
  createRequest(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateHelpRequestDto,
  ) {
    return this.requests.create(auth, dto);
  }

  @Get('requests')
  listRequests(@CurrentAuth() auth: AuthContext) {
    return this.requests.listMine(auth);
  }

  @Get('requests/:id')
  getRequest(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.requests.getMine(auth, id);
  }

  @Get('requests/:id/photo')
  requestPhoto(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Query('n') n?: string,
  ) {
    const index = Number(n ?? 0);
    return this.requests.photo(
      auth,
      id,
      Number.isInteger(index) && index >= 0 && index < 10 ? index : 0,
    );
  }

  @Post('requests/:id/photos')
  addRequestPhoto(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: PhotoUploadDto,
  ) {
    return this.requests.addPhoto(auth, id, dto.dataUrl);
  }

  @Get('requests/:id/house-photo')
  housePhoto(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.jobs.housePhoto(auth, id);
  }

  @Post('requests/:id/open-to-all')
  openToAll(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.requests.openToAll(auth, id);
  }

  @Post('requests/:id/choose')
  chooseQuote(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: ChooseQuoteDto,
  ) {
    return this.requests.choose(auth, id, dto.quoteId);
  }

  @Post('requests/:id/cancel')
  cancelRequest(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: CancelJobDto,
  ) {
    return this.jobs.clientCancel(auth, id, dto.reason);
  }

  // Mensajes y estrellas (cliente o trabajador elegido)
  @Get('requests/:id/messages')
  messages(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.jobs.messages(auth, id);
  }

  @Post('requests/:id/messages')
  sendMessage(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: MessageDto,
  ) {
    return this.jobs.sendMessage(auth, id, dto.body);
  }

  @Post('requests/:id/confirm')
  confirmDone(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.jobs.confirmDone(auth, id);
  }

  @Post('requests/:id/problem')
  reportProblem(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: ReportProblemDto,
  ) {
    return this.jobs.reportProblem(auth, id, dto.note);
  }

  // Qué servicios ya tienen gente cerca (para mostrarlos con color o en tenue)
  @Get('activity')
  activity(@Query('municipalityCode') municipalityCode?: string) {
    return this.requests.activity(municipalityCode);
  }

  // Buscar personas y negocios que lo hacen, cerca de un municipio
  @Get('search')
  search(@CurrentAuth() auth: AuthContext, @Query() dto: SearchProvidersDto) {
    return this.requests.search(auth, dto);
  }

  @Post('requests/:id/review')
  review(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: ReviewDto,
  ) {
    return this.jobs.review(auth, id, dto);
  }

  // Perfil público de un trabajador verificado
  @Get('providers/:id')
  providerProfile(@Param('id') id: string) {
    return this.jobs.providerProfile(id);
  }

  @Get('providers/:id/photos/:photoId')
  providerPhoto(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Param('photoId') photoId: string,
  ) {
    return this.jobs.providerPhoto(auth, id, photoId);
  }

  // ---------- Trabajador: registro ----------

  @Get('me')
  getMine(@CurrentAuth() auth: AuthContext) {
    return this.presente.getMine(auth);
  }

  @Put('me')
  saveProfile(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: SaveProviderProfileDto,
  ) {
    return this.presente.saveProfile(auth, dto);
  }

  @Post('me/consent')
  setConsent(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: BiometricConsentDto,
  ) {
    return this.presente.setConsent(auth, dto.accepted);
  }

  @Post('me/documents')
  uploadDocument(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: UploadProviderDocumentDto,
  ) {
    return this.presente.uploadDocument(auth, dto);
  }

  @Post('me/submit')
  submit(@CurrentAuth() auth: AuthContext) {
    return this.presente.submit(auth);
  }

  @Post('me/presence')
  setPresence(@CurrentAuth() auth: AuthContext, @Body() dto: SetPresenceDto) {
    return this.presente.setPresence(auth, dto.present);
  }

  // Darse de baja guardando su registro, volver, o borrar todo para siempre
  @Post('me/withdraw')
  withdraw(@CurrentAuth() auth: AuthContext) {
    return this.presente.withdraw(auth);
  }

  @Post('me/return')
  comeBack(@CurrentAuth() auth: AuthContext) {
    return this.presente.comeBack(auth);
  }

  @Delete('me')
  deleteForever(@CurrentAuth() auth: AuthContext) {
    return this.presente.deleteForever(auth);
  }

  // Cédulas profesionales (ingeniería, contaduría, leyes...)
  @Get('me/credentials')
  myCredentials(@CurrentAuth() auth: AuthContext) {
    return this.credentials.mine(auth);
  }

  @Post('me/credentials')
  sendCredential(@CurrentAuth() auth: AuthContext, @Body() dto: CredentialDto) {
    return this.credentials.submit(auth, dto);
  }

  @Post('me/credentials/:trade/sep-proof')
  sendSepProof(
    @CurrentAuth() auth: AuthContext,
    @Param('trade') trade: string,
    @Body() dto: SepProofDto,
  ) {
    return this.credentials.uploadSepProof(auth, trade, dto.file);
  }

  /** Horarios libres para pedirle cita. */
  @Get('providers/:id/slots')
  providerSlots(@Param('id') id: string) {
    return this.requests.slots(id);
  }

  /** Comprobante de la SEP de un profesionista (lo pueden ver sus clientes). */
  @Get('providers/:id/credentials/:trade/sep-proof')
  sepProof(@Param('id') id: string, @Param('trade') trade: string) {
    return this.credentials.publicSepProof(id, trade);
  }

  @Delete('me/credentials/:trade')
  removeCredential(
    @CurrentAuth() auth: AuthContext,
    @Param('trade') trade: string,
  ) {
    return this.credentials.remove(auth, trade);
  }

  // Revalidar identidad con una selfie nueva, e historial de cambios
  @Post('me/recheck')
  sendRecheck(@CurrentAuth() auth: AuthContext, @Body() dto: PhotoUploadDto) {
    return this.presente.sendRecheck(auth, dto.dataUrl);
  }

  @Get('me/history')
  history(@CurrentAuth() auth: AuthContext) {
    return this.presente.history(auth);
  }

  // Reglas del programa: comisión, precio mínimo, lugares de fundador y premio por recomendar
  @Get('program')
  program() {
    return this.wallet.program();
  }

  @Get('me/wallet')
  myWallet(@CurrentAuth() auth: AuthContext) {
    return this.wallet.mineFor(auth.user.id);
  }

  /** Lo que me deben clientes que cancelaron cuando yo iba en camino. */
  @Get('me/debts')
  owedToMe(@CurrentAuth() auth: AuthContext) {
    return this.debts.owedToMe(auth);
  }

  /** El cliente me pagó directo. */
  @Post('me/debts/:id/paid')
  debtPaid(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.debts.markPaid(auth, id);
  }

  @Get('me/sites')
  mySites(@CurrentAuth() auth: AuthContext) {
    return this.jobs.mySites(auth);
  }

  @Put('me/site')
  setSite(@CurrentAuth() auth: AuthContext, @Body() dto: SiteChoiceDto) {
    return this.jobs.setSite(auth, dto.siteId ?? null);
  }

  @Get('me/photos')
  myPhotos(@CurrentAuth() auth: AuthContext) {
    return this.jobs.myPhotos(auth);
  }

  @Post('me/photos')
  addPhoto(@CurrentAuth() auth: AuthContext, @Body() dto: ProviderPhotoDto) {
    return this.jobs.addPhoto(auth, dto);
  }

  @Delete('me/photos/:photoId')
  deletePhoto(
    @CurrentAuth() auth: AuthContext,
    @Param('photoId') photoId: string,
  ) {
    return this.jobs.deletePhoto(auth, photoId);
  }

  // ---------- Trabajador: pedidos y trabajos ----------

  @Get('work/nearby')
  nearby(@CurrentAuth() auth: AuthContext) {
    return this.requests.nearby(auth);
  }

  @Post('work/requests/:id/quote')
  sendQuote(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: SendQuoteDto,
  ) {
    return this.requests.sendQuote(auth, id, dto);
  }

  @Get('work/jobs')
  myJobs(@CurrentAuth() auth: AuthContext) {
    return this.jobs.myJobs(auth);
  }

  @Post('work/jobs/:id/en-route')
  enRoute(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: EnRouteDto,
  ) {
    return this.jobs.enRoute(auth, id, dto.etaMinutes, dto.note);
  }

  @Post('work/jobs/:id/location')
  location(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: LocationDto,
  ) {
    return this.jobs.location(auth, id, dto.lat, dto.lng);
  }

  @Post('work/jobs/:id/arrive')
  arrive(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: ArriveDto,
  ) {
    return this.jobs.arrive(auth, id, dto.pin, { lat: dto.lat, lng: dto.lng });
  }

  @Post('work/jobs/:id/start')
  start(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: StartJobDto,
  ) {
    return this.jobs.start(auth, id, dto.estimatedMinutes);
  }

  @Post('work/jobs/:id/finish')
  finish(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: FinishJobDto,
  ) {
    return this.jobs.finish(auth, id, dto);
  }

  @Post('work/jobs/:id/follow-up')
  proposeFollowUp(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: FollowUpProposalDto,
  ) {
    return this.jobs.proposeFollowUp(auth, id, dto.scheduledFor, dto.note);
  }

  @Post('work/jobs/:id/cancel')
  workerCancel(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: CancelJobDto,
  ) {
    return this.jobs.workerCancel(auth, id, dto.reason);
  }

  // ---------- Operador de la plataforma: revisión manual ----------

  @Get('operator/pending')
  @UseGuards(PlatformOperatorGuard)
  listPending() {
    return this.presente.listPending();
  }

  @Get('operator/providers/:id/documents/:kind')
  @UseGuards(PlatformOperatorGuard)
  readDocument(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Param('kind') kind: string,
  ) {
    return this.presente.readDocument(auth.user.id, id, kind);
  }

  @Post('operator/providers/:id/decision')
  @UseGuards(PlatformOperatorGuard)
  decide(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: ReviewDecisionDto,
  ) {
    return this.presente.decide(auth.user.id, id, dto);
  }

  @Get('operator/credentials')
  @UseGuards(PlatformOperatorGuard)
  pendingCredentials() {
    return this.credentials.listPending();
  }

  @Get('operator/credentials/:id/photos/:which')
  @UseGuards(PlatformOperatorGuard)
  credentialPhoto(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Param('which') which: string,
  ) {
    return this.credentials.photo(auth.user.id, id, which);
  }

  @Post('operator/credentials/:id/decision')
  @UseGuards(PlatformOperatorGuard)
  decideCredential(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: ReviewDecisionDto,
  ) {
    return this.credentials.decide(auth.user.id, id, dto);
  }

  @Get('operator/rechecks')
  @UseGuards(PlatformOperatorGuard)
  rechecks() {
    return this.presente.listRechecks();
  }

  @Post('operator/providers/:id/recheck')
  @UseGuards(PlatformOperatorGuard)
  decideRecheck(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: ReviewDecisionDto,
  ) {
    return this.presente.decideRecheck(auth.user.id, id, dto);
  }

  @Get('operator/problems')
  @UseGuards(PlatformOperatorGuard)
  listProblems() {
    return this.jobs.listProblems();
  }

  @Post('operator/requests/:id/close')
  @UseGuards(PlatformOperatorGuard)
  closeProblem(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: CloseProblemDto,
  ) {
    return this.jobs.closeProblem(auth.user.id, id, dto.charge, dto.note);
  }

  /** Sábana de seguridad: los dos la ven y descargan durante 30 días. */
  @Get('requests/:id/safety-record')
  safetyRecord(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.safety.forParticipant(auth, id);
  }

  /** Registro sellado: solo con oficio de autoridad; queda en la bitácora. */
  @Post('operator/requests/:id/safety-record')
  @UseGuards(PlatformOperatorGuard)
  authorityRecord(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: AuthorityRefDto,
  ) {
    return this.safety.forAuthority(auth.user.id, id, dto.authorityRef);
  }

  @Post('operator/requests/:id/recordings/:recordingId')
  @UseGuards(PlatformOperatorGuard)
  authorityRecording(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Param('recordingId') recordingId: string,
    @Body() dto: AuthorityRefDto,
  ) {
    return this.safety.authorityRecording(
      auth.user.id,
      id,
      recordingId,
      dto.authorityRef,
    );
  }

  @Post('me/wallet/mercadopago')
  startOnlineTopup(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: OnlineTopupDto,
  ) {
    return this.mercadoPago.start(auth, dto.amountMxn, dto.origin);
  }

  /** Al regresar de pagar: revisa si ya se aprobó y suma el saldo. */
  @Post('me/wallet/mercadopago/:id/check')
  checkOnlineTopup(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.mercadoPago.check(auth, id);
  }

  @Get('operator/wallet/:code')
  @UseGuards(PlatformOperatorGuard)
  walletLookup(@Param('code') code: string) {
    return this.wallet.operatorLookup(code);
  }

  @Post('operator/wallet/topup')
  @UseGuards(PlatformOperatorGuard)
  walletTopup(@CurrentAuth() auth: AuthContext, @Body() dto: WalletTopupDto) {
    return this.wallet.operatorTopup(auth.user.id, dto);
  }

  @Post('operator/providers/:id/suspend')
  @UseGuards(PlatformOperatorGuard)
  suspend(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: SuspendProviderDto,
  ) {
    return this.presente.suspend(auth.user.id, id, dto.note);
  }
}
