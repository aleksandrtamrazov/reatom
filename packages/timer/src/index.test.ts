import { test } from 'uvu'
import * as assert from 'uvu/assert'
import { createContext } from '@reatom/core'
import { getDuration } from '@reatom/internal-utils'
import { sleep } from '@reatom/utils'

import { atomizeTimer } from './'

test(`base API`, async () => {
  const timerModel = atomizeTimer(`test`)
  const ctx = createContext()

  timerModel.intervalAtom.setSeconds(ctx, 0.001)

  var target = 50
  var duration = await getDuration(() =>
    timerModel.startTimer(ctx, target / 1000),
  )
  assert.ok(duration >= target)

  var target = 50
  var [duration] = await Promise.all([
    getDuration(() => timerModel.startTimer(ctx, target / 1000)),
    sleep(target / 2).then(() => timerModel.stopTimer(ctx)),
  ])
  assert.ok(duration >= target / 2 && duration < target)
})

test.run()