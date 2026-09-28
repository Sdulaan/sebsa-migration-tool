import { proxyIfsGet } from '../../../../lib/server/ifsProxy'
import { LIVE_DATASETS } from '../../../../lib/migrationStore'

export function POST(request) {
  return proxyIfsGet(request, LIVE_DATASETS.personGroup)
}
