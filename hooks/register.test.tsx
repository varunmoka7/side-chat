import { test, expect } from 'claude-code/testing'

test('pane draws a follow-up input', async ($, on) => {
  on('ui.render', async (t, e) => {
    const { Box } = t.ui.resolve(e)
    return <Box />
  })
  const m = await $.ui.mount({
    plugin: 'btw-chat',
    surface: 'terminal',
    component: 'Pane',
    props: {},
    requestId: 'btw-chat',
  } as never)
  expect(await m.find({ key: 'side-input' })).toBeTruthy()
})
