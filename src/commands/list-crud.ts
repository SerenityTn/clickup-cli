import { ClickUpClient } from '../api.js'
import type { Config } from '../config.js'
import type { CreateListOptions, UpdateListOptions } from '../api.js'
import { parsePriority, parseDueDate, resolveAssigneeId } from './update.js'
import { isTTY } from '../output.js'

export interface ListCreateCommandOptions {
  space?: string
  folder?: string
  name: string
  description?: string
  status?: string
  priority?: string
  dueDate?: string
  assignee?: string
}

export interface ListUpdateCommandOptions {
  name?: string
  description?: string
  status?: string
  unsetStatus?: boolean
  priority?: string
  dueDate?: string
  assignee?: string
}

function hasUpdateFields(opts: ListUpdateCommandOptions): boolean {
  return Boolean(
    opts.name !== undefined ||
      opts.description !== undefined ||
      opts.status !== undefined ||
      opts.unsetStatus ||
      opts.priority !== undefined ||
      opts.dueDate !== undefined ||
      opts.assignee !== undefined,
  )
}

export async function createListCommand(
  config: Config,
  opts: ListCreateCommandOptions,
): Promise<{ id: string; name: string }> {
  if (!opts.space && !opts.folder) {
    throw new Error('Provide either --space for a folderless list or --folder for a folder list')
  }
  if (opts.space && opts.folder) {
    throw new Error('Use either --space or --folder, not both')
  }

  const client = new ClickUpClient(config)
  const payload: CreateListOptions = {
    name: opts.name,
    ...(opts.description !== undefined ? { markdown_content: opts.description } : {}),
    ...(opts.status !== undefined ? { status: opts.status } : {}),
  }

  if (opts.priority !== undefined) {
    payload.priority = parsePriority(opts.priority)
  }
  if (opts.dueDate !== undefined) {
    payload.due_date = parseDueDate(opts.dueDate)
    payload.due_date_time = false
  }
  if (opts.assignee !== undefined) {
    payload.assignee = await resolveAssigneeId(client, opts.assignee)
  }

  const list = opts.folder
    ? await client.createList(opts.folder, payload)
    : await client.createFolderlessList(opts.space!, payload)

  return { id: list.id, name: list.name }
}

export async function updateListCommand(
  config: Config,
  listId: string,
  opts: ListUpdateCommandOptions,
): Promise<{ id: string; name: string }> {
  if (!hasUpdateFields(opts)) {
    throw new Error(
      'Provide at least one of: --name, --description, --status, --unset-status, --priority, --due-date, --assignee',
    )
  }

  if (opts.status !== undefined && opts.unsetStatus) {
    throw new Error('Use either --status or --unset-status, not both')
  }

  const client = new ClickUpClient(config)
  const payload: UpdateListOptions = {
    ...(opts.name !== undefined ? { name: opts.name } : {}),
    ...(opts.description !== undefined ? { markdown_content: opts.description } : {}),
    ...(opts.status !== undefined ? { status: opts.status } : {}),
    ...(opts.unsetStatus ? { unset_status: true } : {}),
  }

  if (opts.priority !== undefined) {
    payload.priority = parsePriority(opts.priority)
  }
  if (opts.dueDate !== undefined) {
    payload.due_date = parseDueDate(opts.dueDate)
    payload.due_date_time = false
  }
  if (opts.assignee !== undefined) {
    payload.assignee = await resolveAssigneeId(client, opts.assignee)
  }

  const list = await client.updateList(listId, payload)
  return { id: list.id, name: list.name }
}

export async function deleteListCommand(
  config: Config,
  listId: string,
  opts: { confirm?: boolean },
): Promise<{ listId: string; deleted: true }> {
  const client = new ClickUpClient(config)

  if (!opts.confirm) {
    if (!isTTY()) {
      throw new Error('Destructive operation requires --confirm flag in non-interactive mode')
    }
    const list = await client.getListWithStatuses(listId)
    const { confirm } = await import('@inquirer/prompts')
    const confirmed = await confirm({
      message: `Delete list "${list.name}" (${list.id})? This cannot be undone.`,
      default: false,
    })
    if (!confirmed) {
      throw new Error('Cancelled')
    }
  }

  await client.deleteList(listId)
  return { listId, deleted: true }
}
