import { odataKey } from './siteDataSources'

// Every write in docs/Full API Company.xlsx, in the workbook's order. A site
// is migrated by running these one after another — never in parallel, never
// reordered — each step reading from the Source and writing to the
// Destination through CompanySiteHandling's $batch (see
// app/api/ifs/site-migration/route.js).
//
// Paths are relative to the CompanySiteHandling.svc root. ctx holds the
// site's OData-quoted keys: { c: Contract, co: Company }.
//
//   read(ctx)          Source GET for this step's records
//   method             'POST' creates each record at write(ctx)
//                      'PATCH' updates each record at write(ctx, record), with
//                      the Destination record's ETag in If-Match
//   fields             the workbook's "Mapped Payload" keys, in its order;
//                      only these are sent, and only when the Source has them
//   notMigrated        listed so the order stays visible, but not run yet
//
// Several workbook tabs share an endpoint ("same end point as General data"),
// so e.g. MRO, Procurement, Shipment Management, Automatic Reservation and
// Transport Task are covered by the steps named after their endpoint.

export const SITE_PROJECTION = 'CompanySiteHandling.svc'

const site = ({ c }) => `CompanySiteSet(Contract='${c}')`
const key = (record, field) => odataKey(record?.[field])

export const SITE_MIGRATION_STEPS = [
  {
    id: 'site',
    label: 'Site',
    method: 'POST',
    read: (ctx) => site(ctx),
    write: () => 'CompanySiteSet',
    fields: ['Company', 'Contract', 'Country', 'Description', 'TaxOnSalesPrice']
  },
  {
    id: 'extendedSiteInfo',
    label: 'Extended Site Info',
    method: 'POST',
    read: (ctx) => `${site(ctx)}/Sites`,
    write: (ctx) => `${site(ctx)}/Sites`,
    fields: ['Company', 'Contract', 'DistCalendarId', 'ManufCalendarId', 'TimeZoneCode', 'DeliveryAddress']
  },
  {
    id: 'users',
    label: 'Users',
    method: 'POST',
    read: (ctx) => `${site(ctx)}/Sites(Contract='${ctx.c}',Company='${ctx.co}')/Users`,
    write: (ctx) => `${site(ctx)}/Sites(Contract='${ctx.c}',Company='${ctx.co}')/Users`,
    fields: ['Contract', 'UserSiteTypeDb', 'Userid', 'Objsite', 'UserSiteType', 'Company']
  },
  {
    id: 'maintenance',
    label: 'Maintenance',
    method: 'PATCH',
    read: (ctx) => `${site(ctx)}/SiteMaintenanceInfoArray`,
    write: (ctx, r) => `${site(ctx)}/SiteMaintenanceInfoArray(Contract='${key(r, 'Contract')}')`,
    fields: [
      'MessageReceiver', 'PmRevisionControl', 'DemMatHorizon', 'PersonnelRoundValue', 'PersonnelRoundFunction',
      'TfRoundValue', 'TfRoundFunction', 'WoStateDefault', 'AvailabilityControlId', 'LocationGroup',
      'PickupWhouseAddressId', 'ShipmentType', 'DeliveryTerms', 'DelTermsLocation', 'ShipViaCode', 'PickupDuration',
      'PurchDeliveryTerms', 'PurchDelTermsLocation', 'PurchShipViaCode', 'AutoCreateWorkTaskOnWOStatus',
      'AllowAutoClockInDb', 'DispCondWorkOrderDb', 'CopyScheduleDatesDb', 'AllowMultipleVisitsDb', 'IgnoreDepExecDb',
      'IgnoreObjLvlVld', 'IgnoreObjLvlVldDb', 'ApproveInvoiceOnlineDb', 'AllowToolSelfCheckOut', 'Company', 'Tolerance'
    ]
  },
  {
    id: 'progressTemplateBasicData',
    label: 'Progress Template basic data',
    notMigrated: 'Not migrated yet — the workbook has no Source GET for WoProgressTemplateSet. Templates must already exist in the Destination.'
  },
  {
    id: 'siteProgressTemplates',
    label: 'Site Progress Templates',
    method: 'POST',
    read: (ctx) => `${site(ctx)}/SiteMaintenanceInfoArray(Contract='${ctx.c}')/SiteMscomProgressTempArray`,
    write: (ctx) => `${site(ctx)}/SiteMaintenanceInfoArray(Contract='${ctx.c}')/SiteMscomProgressTempArray`,
    fields: ['Contract', 'ProgressTemplateId', 'SiteDefault']
  },
  {
    id: 'manufacturing',
    label: 'Manufacturing (incl. MRO)',
    method: 'PATCH',
    read: (ctx) => `${site(ctx)}/SiteMfgstdInfoArray`,
    write: (ctx, r) => `${site(ctx)}/SiteMfgstdInfoArray(Contract='${key(r, 'Contract')}')`,
    fields: [
      'DispositionOfQuotation', 'StructureUpdate', 'StructureStateDefault', 'RerunMsOnlineCons', 'DpImportForecastBy',
      'DopAutoClose', 'DopClosedConfigEdit', 'ShpordReceiptBackground', 'VimMroEnabled', 'UseRelPrInPlanning',
      'CalendarSettings', 'ArchiveRecipeStruct', 'CalcCostProgress', 'CreateMltRepairSo', 'OperationReportMode',
      'DispLiAutoEnterAsDlg', 'DispLiIdleTime', 'AuthorizationRequired', 'DefaultQtyOnReport', 'DefaultTimeOnReport',
      'AutoBuildTrackedStruct', 'MsrcptToMrpForDop', 'DirectLabor', 'LaborOverhead', 'PrototypeRevisionPrefix',
      'PrototypeAsSupply', 'ReceiveByproduct', 'ReceiveCoProduct', 'CurrRevWhenPastDue', 'CompetencyCheckOption',
      'ShopOrdAutoClose', 'ReleasedPrFromDop', 'RecipeStructDecimals', 'CreateSoStatusPlanned', 'AllowResOutsideBalance',
      'SoConnectedHuAvailCtrlId', 'DispoAutoReportMtrl', 'DispoAutoReportOper', 'MroDefRcptLocationNo',
      'MroDefDisassemCondCode', 'MroDefAssemCondCode', 'UnreserveOnPartialPick', 'BaseLabResOnAttendance',
      'RoutingOpNumberingStep', 'CapCheckScheduleOper', 'CapCheckLoadTypes', 'RegUnit', 'InclPlannedSo',
      'InclReleasedSo', 'InclPastDueSo', 'SoPastDueDaysAllowed', 'InheritParentMaintLevel', 'SoLotBatchForByProd',
      'SoLotBatchForCoProd', 'DispoAutoUpdRepairOrd', 'DisassemblyScrapReason', 'ReceiveDisassCompRule',
      'ConfigChangeAllowed', 'CreatePrForExtServ', 'UseDigiSignature', 'DigitalSigDemandSource', 'UseManualShpOrdReq',
      'ScheduleDopOperations', 'KeepOrderBasedLots', 'CreateDopStructInBg', 'CheckToolsOnStopClock',
      'ChkClockingOnToolCkout', 'EsoDocTextOutputType'
    ]
  },
  {
    id: 'shopOrderReplication',
    label: 'Shop Order Replication',
    method: 'PATCH',
    read: (ctx) => `${site(ctx)}/ShopOrdReplicationSetups`,
    write: (ctx, r) =>
      `${site(ctx)}/ShopOrdReplicationSetups(Contract='${key(r, 'Contract')}',ReplicationType=IfsApp.CompanySiteHandling.ShopOrdReplicationType'${key(r, 'ReplicationType')}')`,
    fields: ['QtyIncrease', 'QtyDecrease', 'LaterDate', 'EarlierDate']
  },
  {
    id: 'salesProcurement',
    label: 'Sales & Procurement (incl. Shipment Mgmt)',
    method: 'PATCH',
    read: (ctx) => `${site(ctx)}/SiteDiscomInfoArray`,
    write: (ctx, r) => `${site(ctx)}/SiteDiscomInfoArray(Contract='${key(r, 'Contract')}')`,
    fields: [
      'DocumentAddressId', 'Branch', 'PurchCompMethod', 'CustOrderPricingMethod', 'CustOrderDiscountMethod',
      'ShipInventoryLocationNo', 'ReceiveCase', 'ShipmentType', 'EdiAutoOrderApproval', 'EdiAutoChangeApproval',
      'EdiAuthorizeCode', 'EdiAutoApprovalUser', 'ForwardAgentId', 'OrderId', 'Priority', 'ReplicateDocText',
      'DiscountType', 'ReleaseInternalOrder', 'OverDeliveryTolerance', 'ActionNonAuthorized', 'ActionAuthorized',
      'DirDelApproval', 'OrderConfApproval', 'OrderConfDiffApproval', 'AdhocPurRqstApproval', 'SuppAutoApprovalUser',
      'PrintPickReport', 'ReservFromTranspTask', 'CustOrderConfirmation', 'InclReleasedPoLines', 'InclConfirmedPoLines',
      'InclArrivedPoLines', 'InclReceivedPoLines', 'InclPastDuePoLines', 'PoPastDueDaysAllowed', 'InclPlannedDo',
      'ChgTypeFreight', 'ChgTypeInsurance', 'ChgTypeOther', 'RemoteWarehouseId', 'TransAtpInfoDirDel',
      'DefHuTypeForPickPack', 'CustOrdDocumentType', 'ShpmntDocumentType', 'PartAvailCtrlAtPbc', 'Company',
      'CreateOrdInRelStateDb', 'UsePartcaDescOrderDb', 'ShipmentFreightChargeDb', 'SendAutoDisAdvDb',
      'PriceEffectiveDateDb', 'UsePriceInclTaxOrderDb', 'AllowAutoSubOfPartsDb', 'UnattachHuAtDeliveryDb',
      'CreateBasePricePlannedDb', 'DiscountFreezeDb', 'DispCondCustomerOrderDb', 'FairShareReservationDb',
      'AllowOverruleLimitSalesDb', 'UsePartcaDescPurchDb', 'UsePriceInclTaxPurchDb', 'EnforceUseOfPocoDb',
      'DispCondPurchaseOrderDb', 'FinalizeSuppShipmentDb', 'OverDeliveryDb', 'InternalCustomer', 'InternalSupplier',
      'TaxOnSalesPrice', 'CountryCode', 'ExecOrderChangeOnlineDb', 'CreateConfChangeOrderDb', 'SiteDateForDelDate'
    ]
  },
  {
    id: 'customerMessageDefaults',
    label: 'Customer Message Defaults',
    method: 'POST',
    read: (ctx) => `${site(ctx)}/SiteDiscomInfoArray(Contract='${ctx.c}')/MessageDefaultCustArray`,
    write: (ctx) => `${site(ctx)}/SiteDiscomInfoArray(Contract='${ctx.c}')/MessageDefaultCustArray`,
    fields: [
      'Contract', 'CustomerNo', 'EdiAutoChangeApproval', 'EdiAutoOrderApproval', 'ReleaseInternalOrder',
      'EdiAuthorizeCode', 'EdiAutoApprovalUser', 'OrderId', 'Priority'
    ]
  },
  {
    id: 'supplierMessageDefaults',
    label: 'Supplier Message Defaults',
    method: 'POST',
    read: (ctx) => `${site(ctx)}/SiteDiscomInfoArray(Contract='${ctx.c}')/MessageDefaultSuppArray`,
    write: (ctx) => `${site(ctx)}/SiteDiscomInfoArray(Contract='${ctx.c}')/MessageDefaultSuppArray`,
    fields: [
      'AdhocPurRqstApproval', 'Contract', 'CreateConfChangeOrderDb', 'DirDelApproval', 'OrderConfApproval',
      'OrderConfDiffApproval', 'VendorNo', 'SuppAutoApprovalUser'
    ]
  },
  {
    // The workbook lists this as "NO POST allowed" with a keyed URL: it's an
    // update of the existing record, so it's sent as a PATCH.
    id: 'warehouse',
    label: 'Warehouse Mgmt (incl. Auto Reservation, Transport Task)',
    method: 'PATCH',
    read: (ctx) => `${site(ctx)}/SiteInventInfoArray`,
    write: (ctx, r) => `${site(ctx)}/SiteInventInfoArray(Contract='${key(r, 'Contract')}')`,
    fields: [
      'Objsite', 'CountDiffAmount', 'CountDiffPercentage', 'PickingLeadtime', 'LastActualCostCalc', 'AvgWorkDaysPerWeek',
      'NegativeOnHand', 'PurchInvValueMethod', 'ManufInvValueMethod', 'ExtServiceCostMethod', 'InvoiceConsideration',
      'MrbAvailControlId', 'CountryCode', 'RegionCode', 'RounddiffInactivityDays', 'DefaultQtyCalcRound',
      'UpperLimitVeryslowMover', 'UpperLimitSlowMover', 'UpperLimitMediumMover', 'TransportFromWhseLevel',
      'TransportToWhseLevel', 'TransportPartConsLevel', 'TransportRefConsLevel', 'PutawayZoneRefillOption',
      'CountingPrintReportOpt', 'MoveReservationOption', 'PickByChoiceOption', 'AutoReservePrio1', 'AutoReservePrio2',
      'AutoReservePrio3', 'AutoReservePrio4', 'AutoReservePrio5', 'MaxCountingLines', 'CascadPostingDateOption',
      'TimeLagForDeliveries', 'DeliveryDocCommMethod', 'CostDefaultsManuallyDb', 'ResetConfigStdCostDb',
      'FreezeStockCountReportDb', 'FreezeRejectCountResultDb', 'AbcClassPerAssetClassDb', 'CountryDescription',
      'UsePartcaDescInventDb', 'AllowPartlocOwnerMixDb', 'AutoDropofManTransTaskDb', 'AllowDeviatingAvailCtrlDb',
      'ExecTranspTaskBackgroundDb', 'AutoReserveHuOptimizedDb', 'AutoReserveReceiptTimeDb', 'ReservFromTranspTaskDb',
      'WipDefaultPartStatus'
    ]
  },
  {
    id: 'inventoryPlanning',
    label: 'Inventory Planning',
    method: 'PATCH',
    read: (ctx) => `${site(ctx)}/SiteIprInfoArray`,
    write: (ctx, r) => `${site(ctx)}/SiteIprInfoArray(Contract='${key(r, 'Contract')}')`,
    fields: ['IprActive', 'IprDeleteRequisition', 'IprUseReleaseReq', 'IprActiveDb', 'IprDeleteRequisitionDb', 'IprUseReleaseReqDb']
  },
  {
    id: 'rental',
    label: 'Rental',
    method: 'PATCH',
    read: (ctx) => `${site(ctx)}/SiteRentalInfoArray`,
    write: (ctx, r) => `${site(ctx)}/SiteRentalInfoArray(Contract='${key(r, 'Contract')}')`,
    fields: ['Objsite', 'ChargeableId', 'ExceptionId', 'PeriodRounding']
  }
]

export function getSiteMigrationStep(id) {
  return SITE_MIGRATION_STEPS.find((s) => s.id === id)
}

// Picks the step's mapped fields off a Source record, in the workbook's
// order. Fields the Source didn't return are left out rather than sent empty.
export function buildStepPayload(step, record) {
  const payload = {}
  step.fields.forEach((field) => {
    if (record && field in record) payload[field] = record[field]
  })
  return payload
}
