// Every site-level GET from docs/Full API Company.xlsx, in the workbook's
// order ("Get all Sites" is the page's own list, /api/ifs/company-site-set).
// The order is significant: /api/ifs/site-data fetches them one after
// another in exactly this sequence, and the page lists them the same way.
//
// path(ctx) is relative to the CompanySiteHandling.svc root. ctx holds the
// site's OData-quoted, URL-encoded keys: { c: Contract, co: Company }.
//
// Several workbook tabs share an endpoint ("same end point as General data"),
// so e.g. MRO, Procurement, Shipment Management, Automatic Reservation and
// Transport Task show up under the section named after their endpoint.

export const SITE_PROJECTION = 'CompanySiteHandling.svc'

const site = ({ c }) => `CompanySiteSet(Contract='${c}')`

export const SITE_DATA_SOURCES = [
  { id: 'extendedSiteInfo', label: 'Extended Site Info', path: (ctx) => `${site(ctx)}/Sites` },
  { id: 'users', label: 'Users', path: (ctx) => `${site(ctx)}/Sites(Contract='${ctx.c}',Company='${ctx.co}')/Users` },
  { id: 'maintenance', label: 'Maintenance', path: (ctx) => `${site(ctx)}/SiteMaintenanceInfoArray` },
  {
    id: 'progressTemplates',
    label: 'Progress Templates',
    path: (ctx) => `${site(ctx)}/SiteMaintenanceInfoArray(Contract='${ctx.c}')/SiteMscomProgressTempArray`
  },
  { id: 'manufacturing', label: 'Manufacturing (incl. MRO)', path: (ctx) => `${site(ctx)}/SiteMfgstdInfoArray` },
  { id: 'shopOrderReplication', label: 'Shop Order Replication', path: (ctx) => `${site(ctx)}/ShopOrdReplicationSetups` },
  { id: 'salesProcurement', label: 'Sales & Procurement (incl. Shipment Mgmt)', path: (ctx) => `${site(ctx)}/SiteDiscomInfoArray` },
  {
    id: 'customerMessageDefaults',
    label: 'Customer Message Defaults',
    path: (ctx) => `${site(ctx)}/SiteDiscomInfoArray(Contract='${ctx.c}')/MessageDefaultCustArray`
  },
  {
    id: 'supplierMessageDefaults',
    label: 'Supplier Message Defaults',
    path: (ctx) => `${site(ctx)}/SiteDiscomInfoArray(Contract='${ctx.c}')/MessageDefaultSuppArray`
  },
  { id: 'warehouse', label: 'Warehouse Mgmt (incl. Auto Reservation, Transport Task)', path: (ctx) => `${site(ctx)}/SiteInventInfoArray` },
  { id: 'inventoryPlanning', label: 'Inventory Planning', path: (ctx) => `${site(ctx)}/SiteIprInfoArray` },
  { id: 'rental', label: 'Rental', path: (ctx) => `${site(ctx)}/SiteRentalInfoArray` }
]

// OData string key: single quotes doubled, then URL-encoded.
export function odataKey(value) {
  return encodeURIComponent(String(value ?? '').replace(/'/g, "''"))
}

export function buildProjectionUrl(baseUrl, path) {
  if (!baseUrl) throw new Error('Base URL is required.')
  return `${baseUrl.replace(/\/+$/, '')}/main/ifsapplications/projection/v1/${path}`
}
