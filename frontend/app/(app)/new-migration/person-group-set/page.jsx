'use client'

import { Suspense } from 'react'
import LiveDataView from '../../../../components/LiveDataView'
import { LIVE_DATASETS } from '../../../../lib/migrationStore'

export default function PersonGroupSetPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <LiveDataView dataset={LIVE_DATASETS.personGroup} />
    </Suspense>
  )
}
