// Entity → sub-tab → field schema, transcribed from "REST APIs.xlsx" (one
// sheet per entity; the section headers inside a sheet are the sub-tabs, and
// the mapped-payload keys are the fields). UI-only: this drives the Review
// step's accordion sub-tabs and the detail form. Field lists are a
// representative subset of each section's real payload keys — enough to render
// a faithful data-entry screen without dumping every column.
//
// Keyed by the entityRegistry id. tabId is a stable slug; tabName is shown in
// the accordion exactly as the Excel category reads.

export const ENTITY_SUB_TABS = {
  company: [
    { tabId: 'general', tabName: 'General', fields: ['NewCompany', 'NewCompanyName', 'TemplateId', 'CreationMethod', 'Country', 'CurrencyCode', 'DefaultLanguage', 'ValidFrom', 'CreateAsTemplateCompany', 'CreateAsMasterCompany'] },
    { tabId: 'address', tabName: 'Address', fields: ['AddressId', 'AddressTypeCode', 'Address1', 'Address2', 'Address3', 'ZipCode', 'City', 'Country', 'DefAddress', 'ValidFrom'] },
    { tabId: 'communicationMethods', tabName: 'Communication Methods', fields: ['MethodId', 'Value', 'Description', 'MethodDefault', 'Name', 'ValidFrom', 'ValidTo'] },
    { tabId: 'taxControl', tabName: 'Tax Control', fields: ['FeeCode', 'ValidationDate', 'ExemptCertificateType', 'TaxExemptionCertNo', 'CertificateIssueDate', 'CertificateExpiryDate', 'CertificateAmount', 'CertificateCurrency'] },
    { tabId: 'messageSetup', tabName: 'Message Setup', fields: ['Address', 'MediaCode', 'MessageClass', 'MethodDefault'] },
    { tabId: 'supplyChain', tabName: 'Supply Chain Information', fields: ['AddressName', 'IntrastatExempt', 'Contact', 'DeliveryTerms', 'ShipViaCode'] },
    { tabId: 'invoice', tabName: 'Invoice', fields: ['DefInstantInvType', 'DefManCustInvType', 'DefManSuppInvType', 'DefAutoInvoiceType', 'DefCorrInstInvType'] },
    { tabId: 'payment', tabName: 'Payment', fields: ['DefaultCustSeries', 'DefaultSuppSeries', 'InterestInvoiceType', 'GenBestPaymentTerm', 'IncludeCredInvoices'] }
  ],
  site: [
    { tabId: 'extendedSiteInfo', tabName: 'Extended Site Info', fields: ['Company', 'Contract', 'DistCalendarId', 'ManufCalendarId', 'TimeZoneCode', 'DeliveryAddress', 'PurchShipViaCode', 'PurchDeliveryTerms'] },
    { tabId: 'users', tabName: 'Users', fields: ['Userid', 'Contract', 'Company', 'Objsite', 'UserSiteType', 'UserSiteTypeDb'] },
    { tabId: 'maintenance', tabName: 'Maintainance Tab', fields: ['MessageReceiver', 'WoStateDefault', 'AvailabilityControlId', 'LocationGroup', 'ShipmentType', 'DeliveryTerms', 'PmRevisionControl'] },
    { tabId: 'manufacturing', tabName: 'Manufacturing Tab', fields: ['StructureUpdate', 'StructureStateDefault', 'DispositionOfQuotation', 'DopAutoClose', 'CalcCostProgress'] },
    { tabId: 'salesProcurement', tabName: 'Sales and Procument', fields: ['DocumentAddressId', 'Branch', 'PurchCompMethod', 'CustOrderPricingMethod', 'ShipmentType', 'ForwardAgentId', 'OrderId'] },
    { tabId: 'shipment', tabName: 'Shipment Management', fields: ['DefHuTypeForPickPack', 'ShipmentFreightChargeDb', 'SendAutoDisAdvDb'] },
    { tabId: 'inventoryPlanning', tabName: 'Inventory Planning tab', fields: ['IprActive', 'IprDeleteRequisition', 'IprUseReleaseReq'] }
  ],
  customer: [
    { tabId: 'generalData', tabName: 'Customer – General Data', fields: ['CustomerId', 'Name', 'CreationDate', 'Party', 'DefaultLanguage', 'Country', 'PartyType', 'CustomerCategory', 'B2bCustomer', 'OneTime'] },
    { tabId: 'address', tabName: 'Customer - Address', fields: ['AddressId', 'Address1', 'Address2', 'City', 'ZipCode', 'Country', 'CountryDesc', 'PartyType', 'DefAddress'] },
    { tabId: 'deliveryTax', tabName: 'Delivery Tax Information', fields: ['CustomerId', 'AddressId', 'Company', 'SupplyCountry', 'FeeCode', 'ValidationDate'] },
    { tabId: 'salesAddress', tabName: 'Sales Address Information', fields: ['DeliveryTerms', 'ShipViaCode', 'DistrictCode', 'RegionCode', 'Contact', 'RouteId', 'DeliveryTime', 'ShipmentType'] },
    { tabId: 'creditInfo', tabName: 'Customer - Credit Information', fields: ['Company', 'CreditBlock', 'CreditNumber', 'CreditRating', 'CreditLimit', 'AvgDaysForPayment', 'NextReviewDate'] },
    { tabId: 'sales', tabName: 'Customer - Sales', fields: ['CustRef', 'InvoiceSort', 'AcquisitionSite', 'EdiAutoOrderApproval', 'MatchType', 'ReceivingAdviceType'] }
  ],
  supplier: [
    { tabId: 'generalInfo', tabName: 'Supplier – General Information', fields: ['SupplierId', 'Name', 'CreationDate', 'Party', 'DefaultLanguage', 'Country', 'PartyType', 'SupplierCategory', 'B2bSupplier', 'OneTime'] },
    { tabId: 'address', tabName: 'Supplier – Address', fields: ['AddressId', 'Address1', 'Address2', 'City', 'ZipCode', 'Country', 'PartyType', 'ValidFrom', 'DefAddress'] },
    { tabId: 'communicationMethod', tabName: 'Communication Method', fields: ['MethodId', 'Value', 'Description', 'MethodDefault', 'Name', 'ValidFrom'] },
    { tabId: 'contact', tabName: 'Contact', fields: ['PersonId', 'Role', 'Phone', 'Mobile', 'Email', 'SupplierPrimary', 'SupplierSecondary'] },
    { tabId: 'deliveryTax', tabName: 'Delivery Tax Information', fields: ['SupplierId', 'AddressId', 'Company', 'TaxCode', 'ValidationDate'] },
    { tabId: 'messageSetup', tabName: 'Supplier – Message Setup', fields: ['Address', 'MediaCode', 'MessageClass', 'MethodDefault', 'SequenceNo'] },
    { tabId: 'paymentMethods', tabName: 'Payment Methods', fields: ['Company', 'DefaultPaymentWay', 'WayId', 'OneTimeSupplier', 'FormatType', 'ClientMapping'] },
    { tabId: 'purchaseAddress', tabName: 'Purchase Address Information', fields: ['AddressId', 'DeliveryTerms', 'ShipViaCode', 'RouteId', 'Contact', 'AcquisitionSite', 'InternalSupplier'] }
  ],
  masterPart: [
    { tabId: 'general', tabName: 'General', fields: ['PartNo', 'Description', 'UnitCode', 'StdNameId', 'LotTrackingCode', 'SerialRule', 'SerialTrackingCode', 'Configurable', 'PartMainGroup', 'KitPartDb'] },
    { tabId: 'gtin', tabName: 'GTIN', fields: ['PartNo', 'GtinNo', 'UnitMeas', 'VariableWeight', 'ValidFrom'] },
    { tabId: 'assortment', tabName: 'Assortment Connection', fields: ['PartNo', 'AssortmentId', 'AssortmentNodeId', 'ValidFrom', 'ValidTo'] },
    { tabId: 'alternative', tabName: 'Alternative Array', fields: ['PartNo', 'AlternativePartNo', 'Description', 'Ratio', 'Bidirectional'] }
  ],
  inventoryPart: [
    { tabId: 'general', tabName: 'General', fields: ['Contract', 'PartNo', 'Description', 'PartStatus', 'TypeCode', 'UnitMeas', 'PlannerBuyer', 'AbcClass', 'LeadTimeCode', 'CountryOfOrigin'] },
    { tabId: 'costing', tabName: 'Costing', fields: ['Contract', 'PartNo', 'InventoryPartCostLevel', 'InventoryValuationMethod', 'AccountingGroup', 'AssetClass'] },
    { tabId: 'planning', tabName: 'Planning', fields: ['Contract', 'PartNo', 'ExpectedLeadtime', 'ManufLeadtime', 'FrequencyClass', 'CycleCode', 'DopConnection'] }
  ],
  salesPart: [
    { tabId: 'general', tabName: 'General', fields: ['Contract', 'CatalogNo', 'CatalogDesc', 'CatalogGroup', 'PartNo', 'SalesType', 'SalesUnitMeas', 'DateEntered'] },
    { tabId: 'pricing', tabName: 'Pricing', fields: ['ListPrice', 'ListPriceInclTax', 'RentalListPrice', 'PriceUnitMeas', 'PriceConvFactor', 'SalesPriceGroupId', 'ExpectedAveragePrice'] },
    { tabId: 'misc', tabName: 'Miscellaneous', fields: ['DeliveryType', 'DiscountGroup', 'CloseTolerance', 'MinimumQty', 'ReplacementPartNo', 'RuleId'] }
  ],
  inventoryLocations: [
    { tabId: 'locationTypes', tabName: 'Location Types', fields: ['LocationTypeId', 'Description', 'AddTime', 'LackOfCoverage', 'DoOnLocationIncentive', 'DurationOverhead'] },
    { tabId: 'locationGroups', tabName: 'Inventory Location Groups', fields: ['LocationGroup', 'Description', 'InventoryLocationType'] },
    { tabId: 'locations', tabName: 'Inventory Locations', fields: ['Contract', 'LocationNo', 'LocationGroup', 'BayId', 'BinId', 'LocationSequence', 'MixOfCondCodesBlockedDb'] }
  ]
}

// Fallback sub-tabs for an entity the Excel doesn't cover, so the accordion
// still renders something meaningful.
export const DEFAULT_SUB_TABS = [
  { tabId: 'general', tabName: 'General', fields: [] }
]

export function getEntitySubTabs(entityId) {
  return ENTITY_SUB_TABS[entityId] || DEFAULT_SUB_TABS
}
