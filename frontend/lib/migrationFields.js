// POST allow-lists (field set and order) for entities whose create body is
// narrower than what their GET returns. Used by lib/entityRegistry.js and the
// standalone live-data pages.

// The exact field set and order the destination expects a SalesPart create
// payload in — narrower than what SalesPartSet returns (drops read-only/
// system bookkeeping fields like Company, NoteText, RuleId, Gtin, etc.).
export const SALES_PART_MIGRATION_FIELDS = [
  'Contract', 'CatalogNo', 'CatalogDesc', 'PartNo', 'CatalogGroup', 'SalesPriceGroupId',
  'NoteId', 'SalesUnitMeas', 'ConvFactor', 'DateEntered', 'ListPrice', 'ListPriceInclTax',
  'RentalListPrice', 'RentalListPriceInclTax', 'PriceConvFactor', 'PriceUnitMeas', 'TaxCode',
  'CloseTolerance', 'SourcingOption', 'InvertedConvFactor', 'SalesType', 'StatisticalCode',
  'AcquisitionOrigin', 'AcquisitionReasonId', 'PartDescriptionInUse', 'PartCatalogPartDescription',
  'InventoryPartDesc', 'Dop', 'UnitMeas', 'CurrencyCode', 'PrimaryCatalog', 'Activeind', 'Taxable',
  'QuickRegisteredPart', 'UsePriceInclTax', 'ExportToExternalApp', 'CreateSmObjectOption',
  'CustomerWarranty', 'CatalogTypeDb', 'DocumentText', 'CurrDate', 'Configurable',
  'CreatePurchasePart', 'ExternalTaxCalcMethod', 'TaxManufEquivalent'
]

// The exact field set the destination's PartCatalogSet POST body expects.
// Values the PartCatalogSet POST body always carries, whatever the source
// record says (or whether it has the field at all). PartCatalogSet only.
export const PART_CATALOG_FIXED_VALUES = { PositionPart: 'NotAPositionPart' }

// A POST body from a source record: the allow-listed fields in the list's
// order, with any fixed values taking the place of the record's own (a fixed
// field not in the list is added at the end).
export function pickPayloadFields(record, fields, fixedValues = null) {
  const picked = {}
  fields.forEach((key) => {
    if (fixedValues && key in fixedValues) picked[key] = fixedValues[key]
    else if (key in record) picked[key] = record[key]
  })
  if (fixedValues) {
    Object.entries(fixedValues).forEach(([key, value]) => {
      if (!(key in picked)) picked[key] = value
    })
  }
  return picked
}

export const PART_CATALOG_MIGRATION_FIELDS = [
  'AllowAsNotConsumedDb', 'AllowStructChangeDb', 'CatchUnitEnabledDb', 'ComponentLotRule',
  'ConditionCodeUsage', 'Configurable', 'Description', 'EngSerialTrackingCode', 'KitPart',
  'KitPartDb', 'LotQuantityRule', 'LotTrackingCode', 'MultilevelTracking', 'PartNo', 'PositionPart',
  'ReceiptIssueSerialTrackDb', 'SerialRule', 'SerialTrackingCode', 'StdNameId',
  'StopArrivalIssuedSerialDb', 'StopNewSerialInRmaDb', 'SubLotRule', 'UnitCode', 'InfoText',
  'PartMainGroup', 'CustWarrantyId', 'SupWarrantyId', 'InputUnitMeasGroupId', 'CatchUnitEnabled',
  'StopArrivalIssuedSerial', 'WeightNet', 'UomForWeightNet', 'VolumeNet', 'UomForVolumeNet',
  'FreightFactor', 'AllowAsNotConsumed', 'ReceiptIssueSerialTrack', 'StopNewSerialInRma',
  'TechnicalDrawingNo', 'ProductTypeClassif', 'CestCode', 'FciCode', 'SerialLifecycleGroupId',
  'PartCopySourceSite', 'PartCopyGroupId', 'CbsIbsUnitFactor', 'IsUnitFactor', 'LegalReference',
  'TranslatableInfoText', 'PendingKitAvailReeval', 'InvPartExist', 'PurchPartExist',
  'SalesPartExist', 'ConfigFamilyId', 'ConfigFamilyIdCheck', 'CopyFamily', 'LuName', 'KeyRef'
]

// The exact field set and order the destination's InventoryPartSet POST body
// expects (the user-supplied sample for InventoryPartHandling.svc).
export const INVENTORY_PART_MIGRATION_FIELDS = [
  'Objsite', 'Contract', 'PartNo', 'AccountingGroup', 'AssetClass', 'CountryOfOrigin', 'HazardCode',
  'PartProductCode', 'PartProductFamily', 'PartStatus', 'PlannerBuyer', 'PrimeCommodity', 'SecondCommodity',
  'UnitMeas', 'CatchUnitMeas', 'Description', 'AbcClass', 'AbcClassLockedUntil', 'CycleCode', 'CyclePeriod',
  'DimQuality', 'DurabilityDay', 'ExpectedLeadtime', 'LeadTimeCode', 'ManufLeadtime', 'NoteText',
  'OeAllocAssignFlag', 'OnhandAnalysisFlag', 'PurchLeadtime', 'Supersedes', 'SupplyCode', 'TypeCode',
  'CustomsStatNo', 'TypeDesignation', 'ZeroCostFlag', 'AvailActivityStatus', 'EngAttribute', 'ShortageFlag',
  'ForecastConsumptionFlag', 'StockManagement', 'IntrastatConvFactor', 'PartCostGroupId', 'DopConnection',
  'StdNameId', 'InventoryValuationMethod', 'NegativeOnHand', 'TechnicalCoordinatorId', 'InvoiceConsideration',
  'MaxActualCostUpdate', 'CustWarrantyId', 'SupWarrantyId', 'RegionOfOrigin', 'InventoryPartCostLevel',
  'ExtServiceCostMethod', 'SupplyChainPartGroup', 'AutomaticCapabilityCheck', 'InputUnitMeasGroupId',
  'DopNetting', 'CoReserveOnhAnalysFlag', 'QtyCalcRounding', 'LifecycleStage', 'LifeStageLockedUntil',
  'FrequencyClass', 'FreqClassLockedUntil', 'MinDurabDaysCoDeliv', 'MinDurabDaysPlanning',
  'StandardPutawayQty', 'PutawayZoneRefillOption', 'MandatoryExpirationDate', 'ExclShipPackProposal',
  'StatisticalCode', 'AcquisitionOrigin', 'AcquisitionReasonId', 'HsnSacCode', 'ProductCategoryId',
  'ConsumptionTax', 'HsnSacCodeDescription', 'ProductCategoryDesc', 'TaxManufEquivalent',
  'TranslatableInfoText'
]

// The exact field set and order the destination's PurchasePartSet POST body
// expects (the user-supplied sample for PurchasePartHandling.svc).
export const PURCHASE_PART_MIGRATION_FIELDS = [
  'Objsite', 'Contract', 'PartNo', 'Description', 'EngAttribute', 'NoteId', 'QcCode', 'StatGrp', 'CloseCode',
  'CloseTolerance', 'DateCre', 'NoteText', 'QcDate', 'DefaultBuyUnitMeas', 'OverDeliveryTolerance',
  'OverDelivery', 'BuyerCode', 'ProcessType', 'StandardPackSize', 'TechnicalCoordinatorId',
  'DopPeggedPoUpdateFlag', 'AcquisitionType', 'ActionNonAuthorized', 'ActionAuthorized', 'ExternalResource',
  'StatisticalCode', 'StatisticalCodeManuf', 'QualitySystemLevelId', 'QslApprovalTemplate',
  'QmrApprovalTemplate', 'QsrApprovalTemplate', 'AcquisitionOrigin', 'AcquisitionReasonId', 'PackagePartFlag',
  'NbsCode', 'PartDescriptionInUse', 'DateCreated', 'InventoryFlagDb', 'AlternatePartsExist', 'DocumentText',
  'TaxableDb', 'DocTextExists', 'PartCatalogPartDescription', 'TranslatableInfoText', 'InvOrdReq',
  'UsePartCatalogDescChecked', 'FromInventoryPart', 'PartExist', 'IsPrjrepInstalled', 'QualifiedManufacturer',
  'QualifiedSupplier'
]
