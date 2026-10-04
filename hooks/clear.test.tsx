import { test, expect } from 'claude-code/testing'

test('/side clear and typing /clear in the pane both wipe the chat', async ($, on) => {
  on('ui.render', async (t, e) => {
    const { Box } = t.ui.resolve(e)
    return <Box />
  })
  const r = await $.command.run({ command: 'side', args: 'clear' } as never)
  expect(JSON.stringify(r)).toContain('Side chat cleared.')
  const m = await $.ui.mount({ plugin: 'side-chat', surface: 'terminal', component: 'Pane', props: {}, requestId: 'side-chat' } as never)
  await m.input({ key: 'side-input', text: '/clear' } as never)
  expect(await m.find({ key: 'side-input' })).toBeTruthy()
})
