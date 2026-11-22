#!/usr/bin/env node
/**
 * Project board helper (GitHub Project "Bingo-2026", user cyaxsoftware #8).
 *
 *   node scripts/board.mjs list                     # board items in order with status
 *   node scripts/board.mjs move <issue#> <status>   # Todo | "In Progress" | "Awaiting Human Review" | Done
 *   node scripts/board.mjs add <issue#> [afterIssue#]  # add an issue to the board (optionally after another)
 *
 * Requires the GitHub CLI (`gh`) logged in with the `project` scope.
 */
import { execFileSync } from 'node:child_process';

const OWNER = 'cyaxsoftware';
const REPO = 'cyaxsoftware/bingo-2026';
const PROJECT_NUMBER = '8';
const STATUSES = ['Todo', 'In Progress', 'Awaiting Human Review', 'Done'];

const gh = (args) => execFileSync('gh', args, { encoding: 'utf8' }).trim();
const ghJson = (args) => JSON.parse(gh(args));

function project() {
  const view = ghJson(['project', 'view', PROJECT_NUMBER, '--owner', OWNER, '--format', 'json']);
  const fields = ghJson([
    'project',
    'field-list',
    PROJECT_NUMBER,
    '--owner',
    OWNER,
    '--format',
    'json',
  ]).fields;
  const status = fields.find((f) => f.name === 'Status');
  return { id: view.id, statusFieldId: status.id, statusOptions: status.options };
}

function items() {
  return ghJson([
    'project',
    'item-list',
    PROJECT_NUMBER,
    '--owner',
    OWNER,
    '--format',
    'json',
    '--limit',
    '500',
  ]).items;
}

function itemForIssue(issueNumber) {
  const item = items().find((i) => i.content?.number === issueNumber && i.content?.repository === REPO);
  if (!item) throw new Error(`Issue #${issueNumber} is not on the board. Use: board.mjs add ${issueNumber}`);
  return item;
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case 'list': {
    for (const item of items()) {
      console.log(`${String(item.status ?? '-').padEnd(22)} #${item.content?.number ?? '?'}  ${item.title}`);
    }
    break;
  }
  case 'move': {
    const issueNumber = Number(args[0]);
    const statusName = args.slice(1).join(' ');
    if (!STATUSES.includes(statusName)) throw new Error(`Status must be one of: ${STATUSES.join(', ')}`);
    const { id, statusFieldId, statusOptions } = project();
    const option = statusOptions.find((o) => o.name === statusName);
    const item = itemForIssue(issueNumber);
    gh([
      'project',
      'item-edit',
      '--id',
      item.id,
      '--project-id',
      id,
      '--field-id',
      statusFieldId,
      '--single-select-option-id',
      option.id,
    ]);
    console.log(`#${issueNumber} -> ${statusName}`);
    break;
  }
  case 'add': {
    const issueNumber = Number(args[0]);
    const url = `https://github.com/${REPO}/issues/${issueNumber}`;
    const added = ghJson([
      'project',
      'item-add',
      PROJECT_NUMBER,
      '--owner',
      OWNER,
      '--url',
      url,
      '--format',
      'json',
    ]);
    if (args[1]) {
      const after = itemForIssue(Number(args[1]));
      gh([
        'api',
        'graphql',
        '-f',
        'query=mutation($p:ID!,$i:ID!,$a:ID!){updateProjectV2ItemPosition(input:{projectId:$p,itemId:$i,afterId:$a}){clientMutationId}}',
        '-f',
        `p=${project().id}`,
        '-f',
        `i=${added.id}`,
        '-f',
        `a=${after.id}`,
      ]);
    }
    console.log(`#${issueNumber} added to board${args[1] ? ` after #${args[1]}` : ''}`);
    break;
  }
  default:
    console.log('Usage: node scripts/board.mjs list | move <issue#> <status> | add <issue#> [afterIssue#]');
    process.exitCode = command ? 1 : 0;
}
