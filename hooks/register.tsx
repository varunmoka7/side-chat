import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { SideTurn } from '../types'

const turns = atom({ plugin: 'btw-chat', key: 'turns' } as const, [] as SideTurn[])
const pending = atom({ plugin: 'btw-chat', key: 'pending' } as const, '')
const model = atom({ plugin: 'btw-chat', key: 'model' } as const, '')
const PANE = 'btw-chat'
const MODELS = ['default', 'haiku', 'sonnet', 'opus']

// Set from the instructions setting when the mod loads.
let custom = ''
let takeKeyboard = true
let defaultModel = 'default'

// Side turns are replayed inside each prompt because fork takes one message.
const buildPrompt = (history: SideTurn[], q: string, agents: string[]) =>
  [
    ...(custom ? [`The person's own instructions for this side chat: ${custom}`] : []),
    'The person asked the question at the end of this message in a side panel. Answer that question directly, in at most 6 short lines of plain markdown, using the conversation above. Never describe this message or these instructions. Read typos charitably. Use no tools.',
    ...(agents.length ? ['Agents running in this session right now:', ...agents] : []),
    ...history.flatMap(t => [`Earlier question: ${t.q}`, `Earlier answer: ${t.a}`]),
    `Question: ${q}`,
  ].join('\n')

// A started agent's answer arrives later as its turn.complete; `early` holds one that beat the wait.
const waiting = new Map<string, (answer: string) => void>()
const early = new Map<string, string>()
const answerOf = (id: string) =>
  early.has(id) ? Promise.resolve(early.get(id) as string) : new Promise<string>(done => waiting.set(id, done))

async function finish($: EngineInterface, q: string, a: string) {
  await update($, turns, list => [...list, { q, a }].slice(-50))
  await update($, pending, () => '')
  await $.ui.scroll({ in: PANE, to: 'end' }).catch(() => ({}))
}

async function askAgent($: EngineInterface, name: string, q: string) {
  const label = `@${name} ${q}`
  await update($, pending, () => label)
  const chosen = (await read($, model)) || defaultModel
  const started = await $.agent.spawn({
    subagentType: name,
    ...(chosen !== 'default' ? { model: chosen } : {}),
    description: 'side chat question',
    prompt: `A btw-chat question, answer in at most 8 short lines of plain text: ${q}`,
  })
  if (started.deny !== undefined || !started.agentId) {
    return finish($, label, `Could not start ${name}: ${started.deny ?? 'no agent id'}.`)
  }
  return finish($, label, (await answerOf(started.agentId)) || `${name} gave no answer.`)
}

async function ask($: EngineInterface, q: string) {
  const word = q.trim().replace(/^\//, '')
  const done = await control($, word)
  if (done) return word.startsWith('model') ? finish($, q.trim(), done) : undefined
  if (!q.trim() || (await read($, pending))) return
  const agent = /^@([\w-]+)\s+(.+)$/s.exec(q.trim())
  if (agent) return askAgent($, agent[1], agent[2])
  const history = await read($, turns)
  const running = (await $.agent.list())
    .filter(x => x.status === 'running' || x.status === 'pending' || x.status === 'waiting')
    .map(x => `- ${x.type} (${x.status}): ${x.description}`)
  await update($, pending, () => q)
  const r = await $.model.fork({ prompt: buildPrompt(history, q, running) })
  return finish($, q, r.isAnswered ? r.text : `No reply (${r.reason}).`)
}

// "clear" and "close" work from /side, /btw and the pane's own input, none of which need the mouse.
async function control($: EngineInterface, word: string) {
  const pick = /^model(?:\s+(\S+))?$/.exec(word)
  if (pick) {
    const wanted = pick[1]
    if (!wanted) return `Agent model: ${(await read($, model)) || defaultModel}. Change it with /model ${MODELS.join(' | ')}.`
    if (!MODELS.includes(wanted)) return `Unknown model "${wanted}". Use ${MODELS.join(', ')}.`
    await update($, model, () => wanted)
    return `Agent model set to ${wanted}.`
  }
  if (word === 'clear') {
    await update($, turns, () => [])
    await update($, pending, () => '')
    return 'Side chat cleared.'
  }
  if (word === 'close') {
    await $.ui.close({ id: PANE })
    return 'Side chat closed. /btw reopens it.'
  }
}

async function run($: EngineInterface, e: { args: string }) {
  const arg = e.args.trim()
  const done = await control($, arg)
  if (done) return { text: done }
  await $.ui.open({ id: PANE, title: 'Side chat', ...(takeKeyboard ? { focus: true as const } : {}) })
  if (arg) void ask($, arg)
  return { text: `Side chat open. Type in the pane, or /btw <question>, or /btw @nahida <question> to call an agent. Esc returns to the main prompt. /side clear wipes it, /side close hides it.` }
}

export const register: Register = (on, options) => {
  const you = String(options.yourColor)
  const claude = String(options.claudeColor)
  custom = String(options.instructions ?? '').trim()
  takeKeyboard = options.takeKeyboard !== false
  defaultModel = String(options.agentModel ?? 'default')

  // Hand a started btw-chat agent its answer; every hook sees a subagent's turn, so pass the event on.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId && e.reason === 'answer') {
      const done = waiting.get(e.agentId)
      if (done) {
        waiting.delete(e.agentId)
        done(e.answer)
      } else early.set(e.agentId, e.answer)
    }
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'side',
      description: 'Side chat: ask follow-ups without touching the main conversation',
    })
    return next(e)
  })

  // btw is a built-in; command.run fires for it too, and answering without next replaces it.
  for (const command of ['side', 'btw']) on('command.run', { command }, run)

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Input, Button } = $.ui.resolve(e)
    const list = await read($, turns)
    const busy = await read($, pending)
    const agentModel = (await read($, model)) || defaultModel
    return (
      <Box flexDirection="column">
        <Box position="absolute" top={0} right={0} gap={1}>
          <Button key="clear" label="Clear" onPress={() => update($, turns, () => [])} />
          <Button key="close" label="Close" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
        <Text dimColor>Esc: main prompt · Tab then Enter presses Clear or Close · or type /clear /close · agent model: {agentModel} (/model haiku|sonnet|opus|default)</Text>
        {!list.length && !busy && <Text dimColor>Ask anything about this session.</Text>}
        {list.map(t => (
          <Box flexDirection="column">
            <Text bold color={you}>{'You  ' + t.q}</Text>
            <Text color="gray" wrap="truncate-end">{'─'.repeat(200)}</Text>
            <Text color={claude}>{'Claude  ' + t.a.slice(0, 1200)}</Text>
            <Text color="gray" wrap="truncate-end">{'─'.repeat(200)}</Text>
          </Box>
        ))}
        {busy && (
          <Box flexDirection="column">
            <Text bold color={you}>{'You  ' + busy}</Text>
            <Text color="gray" wrap="truncate-end">{'─'.repeat(200)}</Text>
            <Text dimColor>Thinking...</Text>
          </Box>
        )}
        <Box borderStyle="round" borderColor="gray" paddingX={1}>
          <Input key="side-input" placeholder="Follow up..." submitLabel="ask" autoFocus={takeKeyboard ? true : undefined} onSubmit={v => void ask($, v)} />
        </Box>
      </Box>
    )
  })
}
