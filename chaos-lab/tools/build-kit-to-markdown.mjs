/**
 * Build kit PDF -> markdown.
 *
 * `docs/symbiote-entity-ue5-build-kit.pdf` is the reference for everything in
 * this repository, but a PDF is not diffable, not searchable in a code review,
 * and not greppable while you are implementing from it. This converts it to
 * markdown once, deterministically, so the conversion can be re-run when the
 * source document changes.
 *
 *   node tools/build-kit-to-markdown.mjs
 *   node tools/build-kit-to-markdown.mjs --check    # fail if output is stale
 *
 * How the structure is recovered
 * ------------------------------
 * The document is laid out on a regular grid, so instead of guessing from raw
 * text flow the extractor uses the geometry the PDF actually provides:
 *
 *   font g_d0_f3          monospace        -> fenced code block (component tree, folder layout)
 *   height ~= 22 or 36    display          -> ##
 *   font g_d0_f2, h ~= 12 subheading       -> ###
 *   repeated cell x       column grid      -> markdown table
 *   y < 45                running footer   -> dropped
 *   height ~= 9, x < 60   section number   -> dropped
 *
 * Ligatures are the one genuinely awkward part: the PDF encodes "fl", "fi",
 * and "ff" as separate glyph runs, so "ferrofluid" arrives as three cells.
 * Cells are therefore joined by measuring the horizontal gap between them
 * (x + width) rather than by inserting spaces blindly — a wider tolerance
 * joins a ligature, a gap inserts a space.
 */

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const PDF_PATH = join(ROOT, 'docs', 'symbiote-entity-ue5-build-kit.pdf');
const OUT_PATH = join(ROOT, 'handoff', 'ENTITY-BUILD-KIT.md');

/** Glyph runs that must not be separated from their neighbours. */
const LIGATURES = new Set(['fl', 'fi', 'ff', 'ffi', 'ffl', 'ft', 'st']);

/** Below this y a line is the running footer. */
const FOOTER_Y = 45;

/**
 * Blocks that read as prose but are semantically lists, and diagrams whose
 * labels carry meaning that would be lost if they were dropped. Geometry
 * cannot tell these apart from ordinary text, so they are declared here and
 * each one has been checked against the source page.
 */
const LAYOUT = {
  lists: [
    { heading: 'What the audience sees', kind: 'ul' },
    // "Core rule:" is a callout sitting under this heading, not a list item.
    { heading: 'What it is not', kind: 'ul', exclude: /^Core rule:/ },
    // The two material headings, and the smoke system's behaviour list, are
    // bulleted in the source. Their bullets are drawn as shapes rather than
    // glyphs, and the item gap (19.5pt) sits a tenth of a point above the
    // paragraph-break threshold, so they are declared here and checked against
    // the page.
    { heading: 'Black ferrofluid core', kind: 'ul' },
    { heading: 'Water, smoke, and memory', kind: 'ul' },
    { heading: 'NS_FuX_SmokeBody + Sparks', kind: 'ul' },
  ],
  // Tables whose first row is content rather than a header, so markdown gets
  // a real header instead of promoting a data row.
  tables: [{ heading: 'Contents', header: ['Section', 'Title', 'Page'] }],
};

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/** Pull one page into geometry-aware lines. */
export async function extractPage(doc, pageNumber) {
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();

  // Items are grouped into visual lines by proximity rather than by an exact
  // y match: the document sets a checkbox badge a point or two above the text
  // it belongs to, and reading those as separate lines interleaved two
  // checklists. Lines that are genuinely distinct are never closer than the
  // 12pt leading of a code block.
  const items = [...content.items]
    .filter((item) => item.str)
    .sort((a, b) => b.transform[5] - a.transform[5]);

  const byLine = new Map();
  let lineY = null;
  for (const item of items) {
    const y = item.transform[5];
    if (lineY === null || lineY - y > 2.5) {
      lineY = y;
      byLine.set(y, []);
    }
    byLine.get(lineY).push({
      x: item.transform[4],
      width: item.width ?? 0,
      height: item.height ?? 0,
      font: item.fontName ?? '',
      text: item.str,
    });
  }

  return [...byLine.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([y, cells]) => {
      cells.sort((a, b) => a.x - b.x);
      // `cells` is kept so a two-column page can rebuild each line from only
      // the cells that belong to that column.
      return { y, cells, ...joinCells(cells) };
    });
}

/** Positional gap above which two runs are separate table columns. */
const COLUMN_GAP = 6;

/**
 * Join a line's runs into text, and group them into table cells.
 *
 * Two signals decide where a cell begins, in order of reliability:
 *
 *  1. The document's own whitespace runs. The PDF emits an explicit space
 *     wherever the typesetter placed one and omits it inside a word, which is
 *     far more reliable than geometry: runs overlap, so the space in
 *     "UE5" + " " + "fi" + "rst" ends *after* the next run begins and an
 *     x-gap test computes a negative gap and drops the space.
 *  2. A positional gap, for columns the document separates by position alone.
 *
 * Runs with neither a space nor a gap between them are one word, which is how
 * ligatures arrive: "hando" + "ff" is the single cell "handoff", not two.
 */
export function joinCells(cells) {
  let text = '';
  let pendingSpace = false;
  let previousEnd = null;
  const columns = [];
  let current = null;

  for (const cell of cells) {
    const isWhitespace = /^\s*$/.test(cell.text);

    if (isWhitespace) {
      // A real space run is a word boundary; the empty zero-width cells the
      // document uses to place a column must be ignored entirely. Letting one
      // move the anchor would hide the 170pt gap between the component tree's
      // two columns and silently merge them into one.
      if (cell.text.length > 0 && cell.width > 0.3) {
        pendingSpace = true;
        previousEnd = cell.x + cell.width;
      }
      continue;
    }

    const positionalGap = previousEnd === null ? Infinity : cell.x - previousEnd;
    const gapBreak = positionalGap > COLUMN_GAP;
    const startsNewCell = !current || pendingSpace || gapBreak;

    // Either kind of break reads as a word break in the flat text form, so
    // the single-string version of a line stays readable.
    if ((pendingSpace || (gapBreak && current)) && text.length > 0 && !text.endsWith(' ')) {
      text += ' ';
    }

    if (startsNewCell) {
      current = {
        x: Math.round(cell.x),
        text: cell.text,
        font: cell.font,
        height: cell.height,
      };
      columns.push(current);
    } else {
      // A continuation of the same word, split only by a ligature glyph.
      current.text += cell.text;
      current.height = Math.max(current.height, cell.height);
    }

    text += cell.text;
    pendingSpace = false;
    previousEnd = cell.x + cell.width;
  }

  const height = Math.max(...cells.map((c) => c.height), 0);
  const fonts = new Set(cells.filter((c) => !/^\s*$/.test(c.text)).map((c) => c.font));

  return { text: text.trim(), columns, height, fonts };
}

/** True when a line is letter-spaced display type rather than a word. */
function isLetterSpaced(text) {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length < 5) return false;
  const short = tokens.filter((t) => t.length <= 2).length;
  return short / tokens.length > 0.6;
}

// ---------------------------------------------------------------------------
// Column detection
// ---------------------------------------------------------------------------

/**
 * Some pages run two independent streams side by side — a prose column beside
 * a pseudocode panel, a QA checklist beside another QA checklist. Because the
 * extractor reads by y, those streams interleave into nonsense.
 *
 * The split is made per line rather than per page, because a page can mix
 * full-width prose with a sidebar: the two are told apart by whether the line
 * contains an internal column gutter. A full-width paragraph has no such gap,
 * so it survives whole even if it reaches into the sidebar's x range.
 */
const GUTTER = 24;

/** Split one line wherever its cells are separated by a column gutter. */
function gutterSpans(line) {
  const spans = [];
  let span = null;

  for (const cell of line.cells) {
    // Whitespace runs carry no position worth trusting: the space before a
    // ligature ends after the next run begins. They follow their span.
    if (!cell.text.trim()) {
      if (span) span.cells.push(cell);
      continue;
    }
    if (span && cell.x - span.end > GUTTER) span = null;
    if (!span) {
      span = { cells: [], end: cell.x };
      spans.push(span);
    }
    span.cells.push(cell);
    span.end = Math.max(span.end, cell.x + cell.width);
  }

  return spans.map((span) => ({ y: line.y, cells: span.cells, ...joinCells(span.cells) }));
}

/**
 * Split a page into left and right streams, or return null when it is a
 * single flow. Table lines are exempt: a table's own columns reach across the
 * boundary, and cutting one in half is how the runtime-parameters table was
 * destroyed.
 */
export function splitStreams(lines, tableIndices = new Set()) {
  const spans = [];
  lines.forEach((line, index) => {
    if (!line.columns.length) return;
    if (tableIndices.has(index)) spans.push(line);
    else spans.push(...gutterSpans(line));
  });

  const starts = spans.map((span) => span.columns[0].x);
  if (starts.length < 6) return null;
  const unique = [...new Set(starts)].sort((a, b) => a - b);

  let splitAt = null;
  let bestGap = 0;
  for (let i = 1; i < unique.length; i += 1) {
    const gap = unique[i] - unique[i - 1];
    const left = starts.filter((x) => x <= unique[i - 1]).length;
    const right = starts.filter((x) => x >= unique[i]).length;
    if (left >= 3 && right >= 3 && gap > bestGap) {
      bestGap = gap;
      splitAt = (unique[i - 1] + unique[i]) / 2;
    }
  }

  if (splitAt === null || bestGap < 90) return null;

  const left = spans.filter((span) => span.columns[0].x < splitAt);
  const right = spans.filter((span) => span.columns[0].x >= splitAt);
  if (left.length < 3 || right.length < 3) return null;

  return { left, right, splitAt };
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/** Decide what each line is, using the geometry rules documented above. */
export function classifyLine(line) {
  const { text, height, fonts, y, columns } = line;

  // The band above this y is the running head — a section title and its page
  // number, on every page but the first. The first page carries the document's
  // version stamp up there instead, and that is worth keeping.
  if (y < FOOTER_Y) {
    // Every running head in this document is letter-spaced. The cover's
    // masthead — author, document name, version, date — sits in the same band
    // and is the one line up there worth keeping.
    // Every line in this band is tracked out letter by letter — the running
    // heads on pages 2 to 11 and the cover's own masthead. Tracking that wide
    // destroys the word boundaries, so none of it can be reproduced faithfully
    // as text; the cover's masthead is carried in the header of this document
    // instead, from the PDF's own metadata.
    return { type: 'footer', text };
  }
  if (!text) return { type: 'blank', text };

  // Connector arrows and other purely graphical glyph runs.
  if (!/[A-Za-z0-9]/.test(text)) return { type: 'decoration', text };

  const isMono = fonts.size === 1 && fonts.has('g_d0_f3');
  if (isMono) return { type: 'code', text: columns.map((c) => c.text).join('  ').trimEnd() };

  // The section number sits alone above every title, e.g. "02".
  if (height <= 9.4 && /^\d{1,2}$/.test(text) && columns.length === 1) {
    return { type: 'section-number', text };
  }

  if (height <= 9.4 && isLetterSpaced(text)) return { type: 'kicker', text };

  if (height >= 20) return { type: 'title', text };
  if (fonts.has('g_d0_f2') && height >= 12 && columns.length <= 2) {
    return { type: 'heading', text };
  }

  // Anything set smaller than body copy is a diagram label, a figure note, or
  // a table cell. Table cells are claimed by the table pass before this rule
  // is consulted, so what is left here really is page furniture — unless the
  // note pass has already shown it to be prose.
  if (height <= 9.6) return { type: line.note ? 'body' : 'label', text };

  return { type: 'body', text };
}

/**
 * Locate every table on a page as an index range.
 *
 * Detection is done once per page and shared, because two things depend on
 * agreeing about what a table is: the renderer, which emits it as markdown,
 * and the column splitter, which must never cut one in half. A table's own
 * columns can span both halves of a two-column page, so its lines are exempt
 * from the split entirely.
 */
function findTableRuns(lines) {
  const classification = lines.map((line) => classifyLine(line));
  const runs = [];
  let index = 0;

  while (index < lines.length) {
    if (classification[index].type === 'code' || lines[index].columns.length < 2) {
      index += 1;
      continue;
    }

    const run = [lines[index]];
    let scan = index + 1;
    while (scan < lines.length && classification[scan].type !== 'code') {
      const candidate = lines[scan];
      if (candidate.columns.length < 2) break;
      if (!detectTable([...run, candidate])) break;
      run.push(candidate);
      scan += 1;
    }

    if (run.length >= 3 && isRealTable(run)) {
      runs.push({ start: index, end: index + run.length - 1, lines: run });
      index += run.length;
    } else {
      index += 1;
    }
  }

  return runs;
}

/**
 * Reject grids that are not tables.
 *
 * A numbered list and a two-column checklist both land on a stable column
 * grid by accident, and both were being rendered as tables: "1. | Route music
 * to a dedicated submix." and "OK | Core reads at room distance". A real
 * table in this document has a header row and at least two rows beneath it,
 * and its first column is neither a list marker nor a checkbox badge.
 */
function isRealTable(run) {
  if (!detectTable(run)) return false;
  return run.every((line) => {
    const first = line.columns[0];
    if (/^(\d+\.|[-\u2022])$/.test(first.text)) return false;
    if (isCheckbox(first)) return false;
    return true;
  });
}

/** The "OK" badge that marks every checklist item in the source document. */
function isCheckbox(cell) {
  return cell.text === 'OK' && cell.height <= 8;
}

/**
 * Group consecutive lines into a table when they share a stable column grid.
 * A table is at least two lines whose non-space cells land on the same x
 * positions, which is exactly how the source document lays them out.
 */
function detectTable(run) {
  if (run.length < 2) return false;
  const counts = run.map((l) => l.columns.length);
  if (counts.some((c) => c < 2)) return false;
  const width = counts[0];
  if (counts.some((c) => c !== width)) return false;

  const reference = run[0].columns.map((c) => c.x);
  return run.every((line) =>
    line.columns.every((cell, i) => Math.abs(cell.x - reference[i]) <= 4),
  );
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderTable(lines, syntheticHeader = null) {
  const width = lines[0].columns.length;
  const cellAt = (line, i) => (line.columns[i]?.text ?? '').replace(/\|/g, '\\|').trim();
  const header = syntheticHeader ?? Array.from({ length: width }, (_, i) => cellAt(lines[0], i));
  const body = syntheticHeader ? lines : lines.slice(1);
  const rows = body.map((line) => Array.from({ length: width }, (_, i) => cellAt(line, i)));

  const out = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ];
  return out.join('\n');
}

/**
 * Reflow body lines into paragraphs.
 *
 * Line spacing inside a paragraph is the document's normal leading, so the
 * threshold is derived from the *tightest* gaps in the run rather than from
 * an average: a paragraph break is a gap noticeably larger than normal
 * leading, and using the minimum keeps a list (leading 15, item gap 19)
 * separable from a paragraph (leading 21) without a magic constant.
 */
function reflowBody(lines) {
  // One run can hold more than one block. The cover sets a 15pt subtitle above
  // an 11pt paragraph, and the leading inside either block would look like a
  // paragraph break if both were measured together, so the run is split by
  // size first and each block is reflowed on its own terms.
  const segments = [];
  for (const line of lines) {
    const last = segments[segments.length - 1];
    if (last && Math.abs(last.height - line.height) <= 1.5) last.lines.push(line);
    else segments.push({ height: line.height, lines: [line] });
  }

  return segments.map((segment) => reflowSegment(segment.lines)).filter(Boolean).join('\n\n');
}

/** Reflow lines of one size into paragraphs. */
function reflowSegment(lines) {
  const gaps = [];
  for (let i = 1; i < lines.length; i += 1) {
    const gap = lines[i - 1].y - lines[i].y;
    if (gap >= 5 && gap < 40) gaps.push(gap);
  }

  // 25th percentile: robust to a single unusually tight or loose pair.
  let spacing = 15;
  if (gaps.length) {
    const sorted = [...gaps].sort((a, b) => a - b);
    spacing = Math.max(8, sorted[Math.floor(sorted.length * 0.25)]);
  }
  // The document separates list items from their own wrapped lines by about
  // 1.24x the leading (15.0pt inside an item, 19.5pt between items), so the
  // threshold sits below that with the observed variation as headroom.
  const breakAt = spacing * 1.18;

  const paragraphs = [];
  let current = [];
  let previousY = null;

  for (const line of lines) {
    if (previousY !== null && previousY - line.y > breakAt && current.length) {
      paragraphs.push(current.join(' '));
      current = [];
    }
    current.push(line.text);
    previousY = line.y;
  }
  if (current.length) paragraphs.push(current.join(' '));

  return paragraphs
    .map((paragraph) =>
      // A line broken at an existing hyphen rejoins without a space, so
      // "water-" + "like currents" becomes "water-like currents" rather than
      // "water- like currents".
      paragraph.replace(/(\w)- (?=[a-z])/g, '$1-'),
    )
    .join('\n\n')
    .trim();
}

/** Build the markdown for one page. */
export function renderPage(pageLines, pageNumber) {
  const tableRuns = findTableRuns(pageLines);
  const tableIndices = new Set();
  for (const run of tableRuns) {
    for (let i = run.start; i <= run.end; i += 1) tableIndices.add(i);
  }

  const split = splitStreams(pageLines, tableIndices);
  if (split) {
    // Render each stream as its own document flow, in reading order.
    markNotes(split.left);
    markNotes(split.right);
    const first = renderFlow(split.left, findTableRuns(split.left));
    const second = renderFlow(split.right, findTableRuns(split.right));
    return {
      blocks: [...first.blocks, { type: 'divider' }, ...second.blocks],
      labels: [...first.labels, ...second.labels],
      pageNumber,
    };
  }
  markNotes(pageLines);
  const flow = renderFlow(pageLines, tableRuns);
  return { ...flow, pageNumber };
}

/**
 * Promote note-sized prose.
 *
 * Figure labels and the document's small notes are set at the same size, so
 * size alone cannot separate them. A note is either a sentence, or a line of
 * a block whose lines share a start position and sit one leading apart; a
 * diagram label is a short phrase that stands on its own.
 */
function markNotes(lines) {
  // Tested on size and font rather than through classifyLine, because that
  // answers with the promoted type once a neighbour has been marked and the
  // rest of the block would then fail the test.
  const isLabel = (line) => line
    && line.height > 0
    && line.height <= 9.6
    && /[A-Za-z0-9]/.test(line.text)
    && !(line.fonts.size === 1 && line.fonts.has('g_d0_f3'));
  const sameBlock = (line, other) => isLabel(other)
    && Math.abs(other.y - line.y) <= 15
    && other.columns.length && line.columns.length
    && Math.abs(other.columns[0].x - line.columns[0].x) <= 6;

  lines.forEach((line, index) => {
    if (!isLabel(line)) return;
    const sentence = line.text.split(/\s+/).length >= 8 && /[.!?]$/.test(line.text);
    if (sentence || sameBlock(line, lines[index - 1]) || sameBlock(line, lines[index + 1])) {
      line.note = true;
    }
  });
}

/**
 * What kind of list item a line opens, if any.
 *
 * Geometry cannot separate a list from a stack of short paragraphs, but the
 * document marks its lists typographically: numbered items open with "1.", the
 * behaviour map opens each item with a bold "Low:" label, and every checklist
 * item carries an "OK" badge.
 */
function markerOf(line) {
  const first = line.columns[0];
  if (!first) return null;
  if (isCheckbox(first)) return 'check';
  if (/^\d+\.$/.test(first.text)) return 'number';
  if (first.font === 'g_d0_f2' && /:$/.test(first.text)) return 'label';
  return null;
}

/** The text of one line, with its marker's own emphasis applied. */
function markedText(line, marker) {
  if (marker === 'number') {
    const label = line.columns[1];
    if (label && label.font === 'g_d0_f2' && /:$/.test(label.text)) {
      return line.text.replace(`${label.text} `, `**${label.text}** `);
    }
    return line.text;
  }
  if (marker === 'label') {
    const label = line.columns[0];
    return `**${label.text}**${line.text.slice(label.text.length)}`;
  }
  return line.text;
}

/**
 * Shape a run of body lines into paragraphs, a list, or a callout.
 *
 * A run with several marked lines is a list; a run with exactly one is the
 * document's callout box, set off as a quote.
 */
function shapeBody(run) {
  const items = [];
  for (const line of run) {
    const marker = markerOf(line);
    if (marker || !items.length) items.push({ marker, lines: [line] });
    else items[items.length - 1].lines.push(line);
  }

  // Consecutive items of the same kind form a group, and the group decides
  // how it is rendered: a callout that follows a checklist is set off as a
  // quote rather than absorbed into the list.
  const groups = [];
  for (const item of items) {
    const kind = item.marker === 'label' ? 'label' : (item.marker ? 'list' : 'prose');
    const last = groups[groups.length - 1];
    if (last && last.kind === kind) last.items.push(item);
    else groups.push({ kind, items: [item] });
  }

  // Only the first line carries the marker; a continuation line's own bold
  // run is body emphasis, not a second label.
  const itemText = (item) => item.lines
    .map((line, i) => (i === 0 ? markedText(line, item.marker) : line.text))
    .join(' ');

  return groups.map((group) => {
    if (group.kind === 'prose') {
      return { type: 'body', text: reflowBody(group.items.flatMap((item) => item.lines)) };
    }
    if (group.kind === 'label' && group.items.length === 1) {
      return { type: 'callout', text: `> ${itemText(group.items[0])}` };
    }
    const text = group.items
      .map((item) => (item.marker === 'number' ? itemText(item) : `- ${itemText(item)}`))
      .join('\n');
    return { type: 'body', text };
  });
}

/** Turn one stream of lines into blocks. */
function renderFlow(lines, tableRuns) {
  const blocks = [];
  const labels = [];
  let index = 0;
  let lastHeading = null;

  while (index < lines.length) {
    const line = lines[index];
    const kind = classifyLine(line);

    if (
      kind.type === 'footer' ||
      kind.type === 'blank' ||
      kind.type === 'section-number' ||
      kind.type === 'decoration'
    ) {
      index += 1;
      continue;
    }

    if (kind.type === 'code') {
      // Monospace blocks in this document are two-column layouts (the
      // component tree, the folder layout), so columns are preserved rather
      // than flattened into a single run of text.
      const run = [];
      while (index < lines.length && classifyLine(lines[index]).type === 'code') {
        run.push(classifyLine(lines[index]).text);
        index += 1;
      }

      // The PDF wraps these blocks at the column width, splitting expressions
      // across lines. A line that ends on an operator or an open bracket is
      // unambiguously continued, so it is rejoined rather than left broken.
      const rejoined = [];
      for (const text of run) {
        const previous = rejoined[rejoined.length - 1];
        // `/` is deliberately absent: every path in the folder layout ends
        // with a slash, and joining on it collapsed the whole tree onto one
        // line. A wrapped expression in this document never ends on a divide.
        const continues = previous !== undefined
          && (/[+*=(,-]$/.test(previous.trim()) || /^[+*=(,-]/.test(text.trim()));
        if (continues) {
          rejoined[rejoined.length - 1] = `${previous.replace(/\s+$/, '')} ${text.trim()}`;
        } else {
          rejoined.push(text);
        }
      }

      blocks.push({ type: 'code', text: rejoined.join('\n') });
      continue;
    }

    // Tables are detected once per page and looked up here, so the renderer
    // and the column splitter can never disagree about what a table is.
    const tableRun = tableRuns.find((run) => run.start === index);
    if (tableRun) {
      const rule = LAYOUT.tables.find((t) => t.heading === lastHeading);
      blocks.push({ type: 'table', text: renderTable(tableRun.lines, rule?.header) });
      index = tableRun.end + 1;
      continue;
    }

    // Table cells are set at label size, so the grid test has to run before
    // anything can be dismissed as page furniture.
    if (kind.type === 'label') {
      labels.push(line.text);
      index += 1;
      continue;
    }

    if (kind.type === 'title') {
      blocks.push({ type: 'title', text: line.text });
      index += 1;
      continue;
    }

    if (kind.type === 'heading') {
      // Two headings can share a visual line when the page runs two columns,
      // as "Component tree" and "Supporting assets" do on page 4.
      const headingCells = line.columns.filter((c) => c.font === 'g_d0_f2' && c.height >= 12);
      for (const cell of headingCells) {
        blocks.push({ type: 'heading', text: cell.text });
        lastHeading = cell.text;
      }
      if (!headingCells.length) {
        blocks.push({ type: 'heading', text: line.text });
        lastHeading = line.text;
      }
      index += 1;
      continue;
    }

    if (kind.type === 'kicker') {
      blocks.push({ type: 'kicker', text: line.text });
      index += 1;
      continue;
    }

    // Otherwise it is prose: collect until something structured interrupts it.
    // Diagram labels are absolutely positioned decorations that can share a y
    // with the prose beside them, so they are harvested and stepped over
    // rather than allowed to split a paragraph in half.
    const run = [];
    while (index < lines.length) {
      // A table found inside this stream ends the paragraph, even though its
      // cells classify as labels.
      if (tableRuns.some((table) => table.start === index)) break;
      const next = classifyLine(lines[index]);
      if (next.type === 'body') {
        run.push(lines[index]);
        index += 1;
        continue;
      }
      if (next.type === 'label') {
        labels.push(lines[index].text);
        index += 1;
        continue;
      }
      break;
    }
    if (run.length) blocks.push(...shapeBody(run));
    else index += 1;
  }

  return { blocks, labels };
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/** `D:20260919015830+00'00'` -> `2026-09-19`. */
function pdfDate(value) {
  const match = /^D:(\d{4})(\d{2})(\d{2})/.exec(value ?? '');
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function assemble(pages, info = {}) {
  const out = [];
  out.push('<!--');
  out.push('  Generated from docs/symbiote-entity-ue5-build-kit.pdf');
  out.push('  by tools/build-kit-to-markdown.mjs. Do not edit by hand — edit the');
  out.push('  source document and re-run `npm run docs:build-kit`.');
  out.push('');
  if (info.title) out.push(`  ${info.title}`);
  if (info.date) out.push(`  Dated ${info.date}.`);
  if (info.title) out.push('');
  out.push('  The text is machine-extracted, so it is faithful; the structure');
  out.push('  (headings, tables, code blocks) is recovered from the PDF layout.');
  out.push('');
  out.push('  Page furniture is not reproduced: the running heads and page numbers,');
  out.push('  and the section number that sits above each title. Display type here is');
  out.push('  tracked out letter by letter, so the cover kicker is reproduced the way');
  out.push('  it is encoded — "M A G I C M I R R O R B O X" — rather than respaced.');
  out.push('-->');
  out.push('');

  let pendingRules = [];

  for (const { blocks, labels, pageNumber } of pages) {
    const section = [];
    for (const block of blocks) {
      switch (block.type) {
        case 'title':
          section.push(`## ${block.text}`);
          section.push('');
          break;
        case 'heading':
          section.push(`### ${block.text}`);
          section.push('');
          break;
        case 'kicker':
          section.push(`*${block.text}*`);
          section.push('');
          break;
        case 'table':
          section.push(block.text);
          section.push('');
          break;
        case 'code':
          section.push('```');
          section.push(block.text);
          section.push('```');
          section.push('');
          break;
        case 'divider':
          section.push('---');
          section.push('');
          break;
        case 'callout':
        case 'body':
        default:
          section.push(block.text);
          section.push('');
          break;
      }
    }

    if (labels.length) {
      section.push(`*Diagram labels: ${labels.join(' · ')}*`);
      section.push('');
    }

    if (section.length) {
      out.push(`<!-- page ${pageNumber} -->`);
      out.push('');
      out.push(...section);
    }
    pendingRules = [];
  }

  return out.join('\n').replace(/\n{4,}/g, '\n\n\n');
}

/**
 * Lists are declared per heading because geometry cannot distinguish a list
 * from a stack of short paragraphs. This rewrites the paragraphs under a
 * declared heading into bullets.
 */
function applyLists(markdown) {
  let result = markdown;
  for (const rule of LAYOUT.lists) {
    const pattern = new RegExp(
      `(### ${escapeRegExp(rule.heading)}\\n\\n)((?:[^#|\\n][^\\n]*\\n\\n)+)`,
      'g',
    );
    result = result.replace(pattern, (match, head, body) => {
      // A declared list can arrive as one paragraph: the bullets are drawn as
      // shapes rather than glyphs and the item spacing matches the leading, so
      // nothing in the geometry separates the items. They are sentences, so
      // they are split on sentence boundaries.
      const blocks = body
        .trim()
        .split(/\n\n+/)
        .flatMap((paragraph) => (
          paragraph.trim().startsWith('>')
            ? [paragraph]
            : paragraph.split(/(?<=\.)\s+(?=[A-Z])/)
        ))
        .map((line) => line.trim())
        .filter(Boolean);

      const out = [];
      for (const block of blocks) {
        // A callout is not a list item, whatever heading it sits under, and a
        // page marker is not part of the list it happens to follow.
        if (block.startsWith('<!--')) {
          out.push('', block);
          continue;
        }
        if (block.startsWith('>') || rule.exclude?.test(block)) {
          out.push(block);
          continue;
        }
        const text = block.startsWith('- ') ? block : `- ${block}`;
        out.push(rule.kind === 'ol' ? text.replace(/^- /, `${out.length + 1}. `) : text);
      }

      // Keep a callout that follows the list visually separate from it.
      const rendered = out.join('\n').replace(/\n(?=> )/g, '\n\n');
      return `${head}${rendered}\n\n`;
    });
  }
  return result;
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const data = new Uint8Array(readFileSync(PDF_PATH));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;

  const pages = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const lines = await extractPage(doc, n);
    pages.push(renderPage(lines, n));
  }

  const info = await doc.getMetadata();
  const markdown = applyLists(assemble(pages, {
    title: info.info?.Title ?? null,
    date: pdfDate(info.info?.CreationDate),
  }));

  if (process.argv.includes('--check')) {
    if (!existsSync(OUT_PATH)) {
      console.error(`${OUT_PATH} does not exist. Run without --check to generate it.`);
      process.exit(1);
    }
    const existing = readFileSync(OUT_PATH, 'utf8');
    if (existing.trim() !== markdown.trim()) {
      console.error('handoff/ENTITY-BUILD-KIT.md is stale — re-run `npm run docs:build-kit`.');
      process.exit(1);
    }
    console.log('handoff/ENTITY-BUILD-KIT.md is up to date.');
    return;
  }

  writeFileSync(OUT_PATH, markdown, 'utf8');
  const words = markdown.split(/\s+/).length;
  console.log(`Wrote ${OUT_PATH} — ${doc.numPages} pages, ${words} words.`);
}

// Imported by the test suite for its extractor; run as a CLI otherwise.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
