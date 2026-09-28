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
