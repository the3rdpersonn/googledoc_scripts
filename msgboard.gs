/**
 * Google Docs Message Board Archive Script
 *
 * Paste this file into a container-bound Apps Script project for the Google Doc.
 * The Google Doc must already have two tabs named in CONFIG:
 *   - Message Board
 *   - Archive
 *
 * Important: Google Docs visual checklist states are not reliably exposed to
 * Apps Script. Use script-readable status text in the Done row, such as:
 *   [x], x, done, true, yes, y, checked, or 1
 * The script resets processed status cells to CONFIG.UNCHECKED_MARKER.
 */

const CONFIG = Object.freeze({
  MESSAGE_BOARD_TAB_NAME: 'Message Board',
  ARCHIVE_TAB_NAME: 'Archive',

  // Optional: set these to tab IDs if you want to avoid matching by title.
  MESSAGE_BOARD_TAB_ID: '',
  ARCHIVE_TAB_ID: '',

  TIMEZONE: 'Europe/Budapest',
  DAILY_TRIGGER_HOUR: 5,
  ARCHIVE_HANDLER: 'archiveDoneColumns',
  UNCHECKED_MARKER: '[ ]',
  DONE_ROW_LABEL: 'Done',
  ARCHIVE_FONT_SIZE: 8,

  COLLABORATORS: Object.freeze([
    Object.freeze({
      name: 'Collaborator 1',
      color: '#1a73e8',
    }),
    Object.freeze({
      name: 'Collaborator 2',
      color: '#c5221f',
    }),
  ]),

  CATEGORIES: Object.freeze([
    'Ideas for collaboration today',
    'Questions about the other person\'s project',
    'Part of my project I want feedback on',
  ]),
});

function onOpen() {
  DocumentApp.getUi()
    .createMenu('Message Board')
    .addItem('Run 5AM Archive Check Now', 'archiveDoneColumns')
    .addItem('Validate Board Structure', 'validateBoardStructure')
    .addSeparator()
    .addItem('Install 5AM Trigger', 'installDailyTrigger')
    .addToUi();
}

function installDailyTrigger() {
  const triggers = ScriptApp.getProjectTriggers();

  triggers.forEach((trigger) => {
    if (trigger.getHandlerFunction() === CONFIG.ARCHIVE_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger(CONFIG.ARCHIVE_HANDLER)
    .timeBased()
    .everyDays(1)
    .atHour(CONFIG.DAILY_TRIGGER_HOUR)
    .inTimezone(CONFIG.TIMEZONE)
    .create();

  showUiMessage_(
    'Installed',
    'Daily archive trigger installed for about 5AM in ' + CONFIG.TIMEZONE + '.'
  );
}

function validateBoardStructure() {
  const context = getBoardContext_();
  const lines = [
    'Structure looks good.',
    '',
    'Message Board tab: ' + context.messageTab.getTitle(),
    'Archive tab: ' + context.archiveTab.getTitle(),
    'Board table rows: ' + context.boardTable.getNumRows(),
    'Done row: ' + (context.doneRowIndex + 1),
    '',
    'Users:',
  ];

  context.users.forEach((user) => {
    lines.push(
      '- ' + user.name +
        ': board column ' + (user.boardColumnIndex + 1) +
        ', done status "' + getCellText_(user.statusCell) + '"'
    );
  });

  showUiMessage_('Validation Passed', lines.join('\n'));
  return true;
}

function archiveDoneColumns() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try {
    const context = getBoardContext_();
    const readyUsers = context.users.filter((user) => {
      return isDoneMarker_(getCellText_(user.statusCell));
    });

    if (readyUsers.length !== context.users.length) {
      console.log('Not all collaborator Done cells are checked. Nothing archived.');
      return;
    }

    const archiveEntries = context.users.map((user) => {
      const responses = getUserResponses_(context, user);
      return {
        name: user.name,
        color: user.color,
        responses: responses,
      };
    });

    appendArchiveEntry_(context.archiveBody, archiveEntries);

    context.users.forEach((user) => {
      getUserResponses_(context, user).forEach((response) => {
        replaceCellText_(response.cell, '');
      });

      replaceCellText_(user.statusCell, CONFIG.UNCHECKED_MARKER);
    });

    console.log('Archived and cleared the board because all collaborators were done.');
    DocumentApp.getActiveDocument().saveAndClose();
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function getBoardContext_() {
  const doc = DocumentApp.getActiveDocument();
  const messageTab = findDocumentTab_(
    doc,
    CONFIG.MESSAGE_BOARD_TAB_ID,
    CONFIG.MESSAGE_BOARD_TAB_NAME
  );
  const archiveTab = findDocumentTab_(
    doc,
    CONFIG.ARCHIVE_TAB_ID,
    CONFIG.ARCHIVE_TAB_NAME
  );

  const messageBody = messageTab.asDocumentTab().getBody();
  const archiveBody = archiveTab.asDocumentTab().getBody();
  const tables = messageBody.getTables();

  if (!tables.length) {
    throw new Error('Message Board tab has no tables.');
  }

  const boardMatch = findBoardTable_(tables);
  const boardTable = boardMatch.table;

  const categories = CONFIG.CATEGORIES.map((categoryLabel) => {
    return {
      label: categoryLabel,
      rowIndex: boardMatch.categoryRows[normalize_(categoryLabel)],
    };
  });

  const users = CONFIG.COLLABORATORS.map((collaborator) => {
    return {
      name: collaborator.name,
      color: collaborator.color,
      boardColumnIndex: findBoardUserColumn_(boardTable, collaborator.name),
      statusCell: boardTable
        .getRow(boardMatch.doneRowIndex)
        .getCell(findBoardUserColumn_(boardTable, collaborator.name)),
    };
  });

  return {
    doc: doc,
    messageTab: messageTab,
    archiveTab: archiveTab,
    messageBody: messageBody,
    archiveBody: archiveBody,
    boardTable: boardTable,
    doneRowIndex: boardMatch.doneRowIndex,
    categories: categories,
    users: users,
  };
}

function findDocumentTab_(doc, configuredId, title) {
  if (configuredId) {
    const tabById = doc.getTab(configuredId);
    if (!tabById) {
      throw new Error('Could not find document tab with ID "' + configuredId + '".');
    }
    return tabById;
  }

  const matches = flattenTabs_(doc.getTabs()).filter((tab) => {
    return tab.getTitle() === title;
  });

  if (matches.length === 0) {
    throw new Error('Could not find document tab titled "' + title + '".');
  }

  if (matches.length > 1) {
    throw new Error(
      'Found more than one document tab titled "' + title +
        '". Set the tab ID in CONFIG to disambiguate.'
    );
  }

  return matches[0];
}

function flattenTabs_(tabs) {
  return tabs.reduce((allTabs, tab) => {
    allTabs.push(tab);
    return allTabs.concat(flattenTabs_(tab.getChildTabs()));
  }, []);
}

function findBoardTable_(tables) {
  for (let tableIndex = 0; tableIndex < tables.length; tableIndex += 1) {
    const table = tables[tableIndex];
    const categoryRows = {};
    let doneRowIndex = -1;

    for (let rowIndex = 0; rowIndex < table.getNumRows(); rowIndex += 1) {
      const row = table.getRow(rowIndex);
      if (row.getNumCells() === 0) {
        continue;
      }

      const firstCellText = normalize_(getCellText_(row.getCell(0)));
      if (firstCellText === normalize_(CONFIG.DONE_ROW_LABEL)) {
        doneRowIndex = rowIndex;
      }

      CONFIG.CATEGORIES.forEach((categoryLabel) => {
        const normalizedCategory = normalize_(categoryLabel);
        if (firstCellText === normalizedCategory) {
          categoryRows[normalizedCategory] = rowIndex;
        }
      });
    }

    const hasAllCategories = CONFIG.CATEGORIES.every((categoryLabel) => {
      return Object.prototype.hasOwnProperty.call(
        categoryRows,
        normalize_(categoryLabel)
      );
    });

    if (hasAllCategories && doneRowIndex !== -1) {
      return {
        table: table,
        index: tableIndex,
        categoryRows: categoryRows,
        doneRowIndex: doneRowIndex,
      };
    }
  }

  throw new Error(
    'Could not find the board table. The first column must contain all expected categories and a Done row.'
  );
}

function findBoardUserColumn_(boardTable, name) {
  const normalizedName = normalize_(name);

  for (let rowIndex = 0; rowIndex < boardTable.getNumRows(); rowIndex += 1) {
    const row = boardTable.getRow(rowIndex);
    for (let columnIndex = 1; columnIndex < row.getNumCells(); columnIndex += 1) {
      if (normalize_(getCellText_(row.getCell(columnIndex))) === normalizedName) {
        return columnIndex;
      }
    }
  }

  throw new Error(
    'Could not find board column for "' + name +
      '". Add that exact name to the board header row.'
  );
}

function getUserResponses_(context, user) {
  return context.categories.map((category) => {
    const responseCell = context.boardTable
      .getRow(category.rowIndex)
      .getCell(user.boardColumnIndex);

    return {
      category: category.label,
      text: getCellText_(responseCell),
      cell: responseCell,
    };
  });
}

function appendArchiveEntry_(archiveBody, archiveEntries) {
  const now = new Date();
  const timestamp = Utilities.formatDate(
    now,
    CONFIG.TIMEZONE,
    'yyyy-MM-dd HH:mm:ss z'
  );

  archiveBody.appendParagraph(timestamp)
    .setFontSize(CONFIG.ARCHIVE_FONT_SIZE)
    .setForegroundColor('#000000')
    .setBold(true);

  archiveEntries.forEach((entry) => {
    const archiveText =
      entry.name + ': ' +
      'Ideas: ' + compactText_(entry.responses[0].text) + ' ' +
      'Question: ' + compactText_(entry.responses[1].text) + ' ' +
      'Feedback: ' + compactText_(entry.responses[2].text);

    const paragraph = archiveBody.appendParagraph(
      archiveText
    );

    paragraph
      .setFontSize(CONFIG.ARCHIVE_FONT_SIZE)
      .setForegroundColor(entry.color)
      .setBold(false);

    styleArchiveLabels_(paragraph, archiveText);
  });

  archiveBody.appendParagraph('').setFontSize(CONFIG.ARCHIVE_FONT_SIZE);
}

function styleArchiveLabels_(paragraph, paragraphText) {
  const text = paragraph.editAsText();

  if (paragraphText.length > 0) {
    text.setBold(0, paragraphText.length - 1, false);
  }

  ['Ideas:', 'Question:', 'Feedback:'].forEach((label) => {
    const start = paragraphText.indexOf(label);
    if (start !== -1) {
      text.setBold(start, start + label.length - 1, true);
    }
  });
}

function isDoneMarker_(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const compact = normalized.replace(/\s+/g, '');

  return [
    '[x]',
    'x',
    'done',
    'true',
    'yes',
    'y',
    'checked',
    '1',
  ].indexOf(compact) !== -1;
}

function getCellText_(cell) {
  return String(cell.getText() || '').trim();
}

function replaceCellText_(cell, text) {
  cell.clear();
  cell.appendParagraph(text == null ? '' : String(text));
}

function normalize_(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/:$/, '')
    .trim()
    .toLowerCase();
}

function compactText_(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || 'none.';
}

function showUiMessage_(title, message) {
  try {
    DocumentApp.getUi().alert(title, message, DocumentApp.getUi().ButtonSet.OK);
  } catch (error) {
    console.log(title + ': ' + message);
  }
}
