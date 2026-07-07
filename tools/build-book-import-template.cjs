const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const outputDir = path.join(__dirname, '..', 'output', 'templates');
const outputPath = path.join(outputDir, 'Community_Events_Featured_Books_Import_Template.xlsx');
fs.mkdirSync(outputDir, { recursive: true });

const workbook = XLSX.utils.book_new();
workbook.Props = {
  Title: 'Community Events Australia - Featured Books Import Template',
  Subject: 'Book links for the daily events email',
  Author: 'Community Events Australia',
  Company: 'Community Events Australia',
};

const headers = [['Book Title', 'Book URL', 'Author', 'Cover Image URL', 'Language', 'Active']];
const booksSheet = XLSX.utils.aoa_to_sheet(headers);
booksSheet['!ref'] = 'A1:F201';
booksSheet['!autofilter'] = { ref: 'A1:F201' };
booksSheet['!cols'] = [
  { wch: 40 },
  { wch: 62 },
  { wch: 28 },
  { wch: 62 },
  { wch: 16 },
  { wch: 12 },
];
booksSheet['!rows'] = [{ hpt: 28 }];

const headerNotes = {
  A1: 'Required. Enter the book title exactly as it should appear in the Community Events email.',
  B1: 'Required. Use the permanent HTTPS link that opens this specific book, preferably directly in the reader.',
  C1: 'Optional. Name of the author or creator.',
  D1: 'Optional. Public HTTPS URL for a portrait JPG or PNG cover image.',
  E1: 'Optional. Examples: English, Urdu, Arabic.',
  F1: 'Optional. Enter Yes to include the book in random rotation, or No to keep it excluded. Blank will be treated as Yes.',
};

for (const [address, note] of Object.entries(headerNotes)) {
  booksSheet[address].c = [{ a: 'Community Events Australia', t: note }];
  booksSheet[address].s = {
    fill: { fgColor: { rgb: '0F766E' } },
    font: { bold: true, color: { rgb: 'FFFFFF' } },
    alignment: { vertical: 'center', horizontal: 'left', wrapText: true },
  };
}

for (let row = 2; row <= 201; row += 1) {
  for (let col = 0; col < 6; col += 1) {
    const address = XLSX.utils.encode_cell({ r: row - 1, c: col });
    if (!booksSheet[address]) booksSheet[address] = { t: 's', v: '' };
  }
}

XLSX.utils.book_append_sheet(workbook, booksSheet, 'Books Import');

const instructions = [
  ['COMMUNITY EVENTS AUSTRALIA - FEATURED BOOKS IMPORT'],
  ['Purpose', 'Please complete the Books Import sheet. The Community Events system will randomly rotate active books in the daily 7:00 pm tomorrow-events email.'],
  ['Important', 'Do not rename, remove or reorder the six column headers on the Books Import sheet.'],
  ['', ''],
  ['FIELD', 'GUIDANCE'],
  ['Book Title', 'Required. The title displayed in the email.'],
  ['Book URL', 'Required. A permanent HTTPS URL that opens the specific book. A direct reader URL is preferred.'],
  ['Author', 'Optional. Author or creator name.'],
  ['Cover Image URL', 'Optional. A public HTTPS JPG or PNG cover image. Portrait format is preferred.'],
  ['Language', 'Optional. For example: English, Urdu or Arabic.'],
  ['Active', 'Optional. Use Yes or No. Blank will be treated as Yes.'],
  ['', ''],
  ['EXAMPLE ONLY - DO NOT COPY THIS ROW INTO THE IMPORT SHEET', ''],
  ['Book Title', 'The Lantern Keepers: Stories of Courage and Character'],
  ['Book URL', 'https://sharemybooks.net/read/deepstories/the-lantern-keepers'],
  ['Author', 'Hassan Syed'],
  ['Cover Image URL', 'https://sharemybooks.net/api/media/lantern/cover.jpg'],
  ['Language', 'English'],
  ['Active', 'Yes'],
  ['', ''],
  ['QUALITY CHECKS BEFORE RETURNING'],
  ['1', 'Every row must have a Book Title and Book URL.'],
  ['2', 'Open each Book URL and confirm it leads to the correct book.'],
  ['3', 'Use one row per book and do not submit duplicate Book URLs.'],
  ['4', 'Keep all URLs as HTTPS links.'],
];

const instructionsSheet = XLSX.utils.aoa_to_sheet(instructions);
instructionsSheet['!cols'] = [{ wch: 26 }, { wch: 100 }];
instructionsSheet['!rows'] = instructions.map((_, index) => ({ hpt: index === 0 ? 32 : 23 }));
instructionsSheet['!merges'] = [
  XLSX.utils.decode_range('A1:B1'),
  XLSX.utils.decode_range('A13:B13'),
  XLSX.utils.decode_range('A21:B21'),
];
instructionsSheet.A1.s = {
  fill: { fgColor: { rgb: '0F766E' } },
  font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 16 },
  alignment: { horizontal: 'center', vertical: 'center' },
};
for (const cell of ['A5', 'B5', 'A13', 'A21']) {
  instructionsSheet[cell].s = {
    fill: { fgColor: { rgb: cell === 'A13' ? 'FEF3C7' : 'D1FAE5' } },
    font: { bold: true, color: { rgb: '134E4A' } },
  };
}
instructionsSheet.B15.l = { Target: instructionsSheet.B15.v, Tooltip: 'Open example book' };
instructionsSheet.B17.l = { Target: instructionsSheet.B17.v, Tooltip: 'Open example cover image' };

XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions');
XLSX.writeFile(workbook, outputPath, { compression: true, bookSST: true, cellStyles: true });

const check = XLSX.readFile(outputPath, { cellComments: true });
const firstSheet = check.Sheets['Books Import'];
const actualHeaders = XLSX.utils.sheet_to_json(firstSheet, { header: 1, range: 'A1:F1' })[0];
if (JSON.stringify(actualHeaders) !== JSON.stringify(headers[0])) {
  throw new Error(`Header verification failed: ${JSON.stringify(actualHeaders)}`);
}
if (!check.Sheets.Instructions || check.SheetNames.length !== 2) {
  throw new Error('Workbook sheet verification failed.');
}

console.log(JSON.stringify({ outputPath, sheets: check.SheetNames, headers: actualHeaders, size: fs.statSync(outputPath).size }, null, 2));
