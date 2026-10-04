import { test, expect } from 'claude-code/testing'

test('a model picked with /side model reaches the agent spawn', async ($, on) => {
  const spawned: unknown[] = []
  on('agent.spawn', async (_t, e) => {
    spawned.push(e)
    return { model: 'haiku', agentId: 'a1' } as never
  })
  on('agent.list', async () => [] as never)
  on('ui.open', async () => ({ value: { isPlaced: true } }) as never)
  on('ui.scroll', async () => ({}) as never)
  const set = await $.command.run({ command: 'side', args: 'model haiku' } as never)
  expect(JSON.stringify(set)).toContain('Agent model set to haiku.')
  const bad = await $.command.run({ command: 'side', args: 'model gpt' } as never)
  expect(JSON.stringify(bad)).toContain('Unknown model')
  await $.command.run({ command: 'btw', args: '@Explore hi' } as never)
  await new Promise(done => setTimeout(done, 100))
  expect(JSON.stringify(spawned[0])).toContain('"model":"haiku"')
})
