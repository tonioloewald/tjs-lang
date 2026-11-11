<!--{"parent": "learn-to-program.md", "order": 15}-->
<!-- TODO review -->

# Tetris

The last project in this part is a game: Tetris. Shapes made of four squares fall into a well,
one at a time. You slide each one left or right and turn it as it falls. When it lands, it
stays where it is, and the next shape appears at the top. A row with no gaps in it disappears,
everything above it moves down, and you score points. The game ends when there is no room
for the next shape to appear.

It is a bigger program than [A Calculator](/a-calculator/), and it uses nearly every chapter
in this part: lists of lists for the well, objects for the shapes, loops inside loops to draw
them, decisions to say what may move where, tests for every rule, and, last of all, a clock
and the keyboard from [Time and Events](/time-and-events/).

## What the game remembers

Before any code, decide what the game has to remember, as the calculator chapter did. Tetris
needs five facts:

- **the board**: the well, as a grid of squares. Each square is empty or filled with a
  colour, left there by a shape that landed.
- **the piece**: the shape that is falling now.
- **its place**: which row and column of the board the piece is at.
- **the score**.
- **over**: true or false, has the game ended?

Notice that the falling piece is not part of the board. It moves on top of the board, and only
when it lands is it written into it. Keeping the two apart makes every rule simpler: "can the
piece go here?" means "are those squares of the board empty?", and the piece never gets in its
own way.

Everything below is built in steps, and every step is a live example that runs and tests what
it adds. A live example cannot use code from another example, so each one carries the
functions from the steps before it, unchanged, and adds its own after them. When an example
looks long, the new part is at the end, immediately above the tests.

The game rules are all plain functions that take plain data (a board, a piece, a place) and
give back an answer. None of them knows about the screen, the clock or the keyboard. That is
the lesson of Responding to the Reader's "Keep the rules out of the buttons", made bigger: the
tests can check every rule without a page, and the part that does touch the page stays so thin
there is little in it to get wrong.

## The board as data

A board is a grid: 20 rows, each 10 squares across. You already know how to keep a row, a list
of values (from [Lists](/lists/)). A board is a list of rows: a **list of lists**, which you
met in [Recursion](/recursion/) (Lists inside lists). Here every row is the same length, so
plain loops are enough, no recursion needed. Each square
holds a string, `''` for empty or a colour name, such as `'orange'`, for a square that is
filled.

To make an empty board, use loops inside loops, as `grid` did in [Repetition](/repetition/)
(Loops inside loops): the outer loop makes the rows, and for each row, the inner loop fills it
with empty squares.

```tjs:inline {"view": "code"}
import { elements } from 'tosijs'

const { pre } = elements

function emptyBoard(rows: 20, columns: 10) {
  const board = []
  for (let row = 0; row < rows; row++) {
    const cells = []
    for (let column = 0; column < columns; column++) {
      cells.push('')
    }
    board.push(cells)
  }
  return board
}

function boardText(board: [['']]) {
  let text = ''
  for (const row of board) {
    for (const cell of row) {
      text = text + (cell == '' ? '. ' : '# ')
    }
    text = text + '\n'
  }
  return text
}

const board = emptyBoard(20, 10)
board[19][0] = 'orange'
board[19][1] = 'orange'
board[18][0] = 'orange'

preview.append(pre(boardText(board)))

test 'an empty board' {
  expect(emptyBoard(2, 3)).toEqual([['', '', ''], ['', '', '']])
  expect(emptyBoard(20, 10).length).toBe(20)
  expect(emptyBoard(20, 10)[0].length).toBe(10)
  expect(emptyBoard(0, 10)).toEqual([])
}

test 'changing one square changes only that square' {
  const small = emptyBoard(2, 3)
  small[1][2] = 'red'
  expect(small).toEqual([['', '', ''], ['', '', 'red']])
}

test 'a board as text' {
  const small = emptyBoard(2, 3)
  small[1][0] = 'red'
  expect(boardText(small)).toBe('. . . \n# . . \n')
}
```

- Rows are counted from the top, starting at 0, and columns from the left, starting at 0, as
  lists always count. So the bottom row is row 19 and the right-hand column is column 9.
- `board[19][0]` reads from left to right, like `book.author.name` in Things with Parts:
  take the board, then its row 19, then square 0 of that row.
- `board: [['']]` is an example of a list of lists of strings. `['']` meant a list of strings,
  so `[['']]` means a list whose items are lists of strings. TJS checks every square: hand
  `boardText` a board with a number in it and the call is refused.
- `boardText` turns a board into text so it can be seen before there is any drawing: a dot for
  an empty square, a `#` for a filled one. It is the inner and outer loop again, going through
  a board that already exists rather than making one.

Change the three `orange` lines to put an L shape somewhere else on the board.

### A common mistake: one row, many names

Why does `emptyBoard` make `cells` **inside** the outer loop? Here is what happens if a board's
rows are all the same list:

```tjs:inline {"view": "code"}
const row = ['', '', '']
const shared = [row, row]

shared[0][1] = 'red'

preview.append(`row 0: [${shared[0]}], row 1: [${shared[1]}]`)

test 'two names for one row' {
  expect(shared[1][1]).toBe('red')
  expect(shared[0] == shared[1]).toBe(true)
}
```

Filling a square in row 0 fills the same square in row 1. `shared` is not two rows; it is one
row, listed twice. This is Same parts, different objects from Things with Parts: putting `row`
into a list does not copy it, it gives the same list another place to be found. In
`emptyBoard`, `const cells = []` runs again every round of the outer loop, so every row is a new
list of its own. Move that line above the outer loop, and the test 'changing one square changes
only that square' turns red: the `'red'` appears in both rows.

## Drawing the board

Text is enough to test with, but a game should look like one. Each square becomes a coloured
`rect` (a rectangle), drawn with `svg`, as the polygons were in Repetition (Shapes from a rule,
A honeycomb). A rectangle needs a position, `x` across and `y` down, and a `width` and
`height`.

```tjs:inline {"view": "code"}
import { svgElements } from 'tosijs'

const { svg, rect } = svgElements

function emptyBoard(rows: 20, columns: 10) {
  const board = []
  for (let row = 0; row < rows; row++) {
    const cells = []
    for (let column = 0; column < columns; column++) {
      cells.push('')
    }
    board.push(cells)
  }
  return board
}

const squareSize = 16 // pixels across each square

function colourOf(cell: '') {
  return cell == '' ? 'gainsboro' : cell
}

function square(row: 0, column: 0, colour: 'red') {
  return rect({
    x: column * squareSize,
    y: row * squareSize,
    width: squareSize,
    height: squareSize,
    fill: colour,
    stroke: 'white',
  })
}

function drawBoard(board: [['']]) {
  const drawing = svg({
    width: board[0].length * squareSize,
    height: board.length * squareSize,
  })
  for (let row = 0; row < board.length; row++) {
    for (let column = 0; column < board[row].length; column++) {
      drawing.append(square(row, column, colourOf(board[row][column])))
    }
  }
  return drawing
}

const board = emptyBoard(20, 10)
board[19][0] = 'orange'
board[19][1] = 'orange'
board[18][0] = 'orange'
board[19][5] = 'cyan'
board[19][6] = 'cyan'
board[19][7] = 'cyan'
board[19][8] = 'cyan'

preview.append(drawBoard(board))

test 'the colour of a square' {
  expect(colourOf('')).toBe('gainsboro')
  expect(colourOf('orange')).toBe('orange')
}
```

- `square` puts a square at a row and column. Moving one column right moves it `squareSize`
  pixels across, so column 3 is at `x` 48. Row works the same way, downwards.
- `colourOf` decides the colour (with `? :` from [Decisions](/decisions/)): an empty square is
  pale grey (`gainsboro` is a colour name, like `teal`), and a filled one is the colour it
  holds.
- `drawBoard` is the honeycomb's two loops: down the rows, across the columns, one square
  each. The size of the drawing comes from the board itself, so a board of any size draws.

`drawBoard` depends on the board and nothing else. Give it the same board and you get the same
picture; change the board and draw it again, and the picture changes. The game will work
exactly that way: change the facts, then draw them.

Try `squareSize = 30`, or change `'gainsboro'` to `'black'` for a night-time well.

## A piece as data

There are seven pieces, named after the letters they look like: I, O, T, S, Z, J and L. Each
one is easiest to describe as a small picture, so the program writes it that way: a grid of
text in which `X` is a square of the piece and `.` is empty.

The rules need something else: a list of the piece's squares, each with a `row` and a
`column`, counted inside the little grid. `cellsOf` turns the picture into that list, with
loops inside loops once more. It reads each line of the picture one letter at a time:
`grid[row][column]` works on a list of strings as it does on a list of lists, because a string
can be read by position with square brackets, as a list can (`'.X.'[1]` is `'X'`).

```tjs:inline {"view": "code"}
import { svgElements } from 'tosijs'

const { svg, rect } = svgElements

function emptyBoard(rows: 20, columns: 10) {
  const board = []
  for (let row = 0; row < rows; row++) {
    const cells = []
    for (let column = 0; column < columns; column++) {
      cells.push('')
    }
    board.push(cells)
  }
  return board
}

const squareSize = 16 // pixels across each square

function colourOf(cell: '') {
  return cell == '' ? 'gainsboro' : cell
}

function square(row: 0, column: 0, colour: 'red') {
  return rect({
    x: column * squareSize,
    y: row * squareSize,
    width: squareSize,
    height: squareSize,
    fill: colour,
    stroke: 'white',
  })
}

function drawBoard(board: [['']]) {
  const drawing = svg({
    width: board[0].length * squareSize,
    height: board.length * squareSize,
  })
  for (let row = 0; row < board.length; row++) {
    for (let column = 0; column < board[row].length; column++) {
      drawing.append(square(row, column, colourOf(board[row][column])))
    }
  }
  return drawing
}

// New in this step:

const shapes = {
  I: { colour: 'cyan', grid: ['....', 'XXXX', '....', '....'] },
  O: { colour: 'gold', grid: ['XX', 'XX'] },
  T: { colour: 'purple', grid: ['.X.', 'XXX', '...'] },
  S: { colour: 'green', grid: ['.XX', 'XX.', '...'] },
  Z: { colour: 'red', grid: ['XX.', '.XX', '...'] },
  J: { colour: 'blue', grid: ['X..', 'XXX', '...'] },
  L: { colour: 'orange', grid: ['..X', 'XXX', '...'] },
}

Type Piece {
  description: 'a shape: its colour, the size of its square grid, and its squares'
  example: { name: 'T', colour: 'purple', size: 3, cells: [{ row: 0, column: 0 }] }
}

Type Place {
  description: 'a row and a column on the board'
  example: { row: 0, column: 0 }
}

function cellsOf(grid: ['']) {
  const cells = []
  for (let row = 0; row < grid.length; row++) {
    for (let column = 0; column < grid[row].length; column++) {
      if (grid[row][column] == 'X') {
        cells.push({ row, column })
      }
    }
  }
  return cells
}

function makePiece(name: 'T') {
  const shape = shapes[name]
  return {
    name,
    colour: shape.colour,
    size: shape.grid.length,
    cells: cellsOf(shape.grid),
  }
}

function picture(piece: Piece) {
  const grid = emptyBoard(piece.size, piece.size)
  for (const cell of piece.cells) {
    grid[cell.row][cell.column] = 'X'
  }
  const lines = []
  for (const row of grid) {
    let line = ''
    for (const cell of row) {
      line = line + (cell == '' ? '.' : 'X')
    }
    lines.push(line)
  }
  return lines
}

function drawGame(board: [['']], piece: Piece, place: Place) {
  const drawing = drawBoard(board)
  for (const cell of piece.cells) {
    drawing.append(
      square(place.row + cell.row, place.column + cell.column, piece.colour)
    )
  }
  return drawing
}

for (const name of Object.keys(shapes)) {
  const piece = makePiece(name)
  const board = emptyBoard(piece.size, piece.size)
  preview.append(drawGame(board, piece, { row: 0, column: 0 }), ' ')
}

test 'a picture becomes a list of squares' {
  expect(cellsOf(['.X.', 'XXX', '...'])).toEqual([
    { row: 0, column: 1 },
    { row: 1, column: 0 },
    { row: 1, column: 1 },
    { row: 1, column: 2 },
  ])
}

test 'every piece has four squares, and draws back as its picture' {
  for (const name of Object.keys(shapes)) {
    const piece = makePiece(name)
    expect(piece.cells.length).toBe(4)
    expect(picture(piece)).toEqual(shapes[name].grid)
  }
}

test 'a piece knows its name, colour and size' {
  const t = makePiece('T')
  expect(t.name).toBe('T')
  expect(t.colour).toBe('purple')
  expect(t.size).toBe(3)
  expect(makePiece('I').size).toBe(4)
}

test 'a piece with a missing part is refused' {
  expect(picture({ name: 'T', colour: 'purple', cells: [] }) instanceof Error).toBe(true)
}
```

- `shapes` is an object whose parts are named by letter, and `shapes[name]` finds one by a
  name held in a value, as in Things with Parts (Parts named by a value). Each shape has a
  `colour` and its `grid`. Every grid is square (as many lines as letters across), which
  matters when turning a piece, two steps on.
- `makePiece('T')` builds the piece the rules use: its `name`, its `colour`, the `size` of its
  grid, and its `cells`. `{ row, column }` is short for `{ row: row, column: column }`, as in
  Things with Parts (Functions that make objects).
- `picture` goes the other way, from a piece to its picture. The tests use it: a list of
  strings such as `['.X.', 'XXX', '...']` is much easier to check by eye than a list of eight
  numbers. The second test checks all seven pieces with one loop.
- `Type Piece` and `Type Place` name the two shapes of data the rules pass around, as `Point`
  did in Things with Parts. Each function that takes a piece says `piece: Piece`, and TJS
  checks every call: the last test hands `picture` a piece with no `size`, and it is refused.
- `drawGame` draws the board, then the piece's squares on top of it, each moved by the place.
  The piece is drawn over the board, not written into it, as the plan said. Here each
  piece is drawn on a little board of its own, the size of its grid.

Change a grid in `shapes` (give the T a fifth square, say) and run it. The picture changes, and
the test 'every piece has four squares' says which piece broke the rule.

## Moving and colliding

The most important rule in the game is one question: can this piece be at this place? Every
move asks it. Sliding left asks it about the place one column to the left; falling asks it
about the place one row down; turning asks it about the turned piece. If the answer is no, the
move does not happen.

A piece fits if every one of its squares is on the board and empty. A loop goes through the
squares, and the first one that fails is enough to say no, so the function gives back `false`
at once, the way `break` stopped the search in Repetition (Stopping early with `break`):

```tjs:inline {"view": "code"}
import { elements, svgElements } from 'tosijs'

const { div } = elements
const { svg, rect } = svgElements

function emptyBoard(rows: 20, columns: 10) {
  const board = []
  for (let row = 0; row < rows; row++) {
    const cells = []
    for (let column = 0; column < columns; column++) {
      cells.push('')
    }
    board.push(cells)
  }
  return board
}

const squareSize = 16 // pixels across each square

function colourOf(cell: '') {
  return cell == '' ? 'gainsboro' : cell
}

function square(row: 0, column: 0, colour: 'red') {
  return rect({
    x: column * squareSize,
    y: row * squareSize,
    width: squareSize,
    height: squareSize,
    fill: colour,
    stroke: 'white',
  })
}

function drawBoard(board: [['']]) {
  const drawing = svg({
    width: board[0].length * squareSize,
    height: board.length * squareSize,
  })
  for (let row = 0; row < board.length; row++) {
    for (let column = 0; column < board[row].length; column++) {
      drawing.append(square(row, column, colourOf(board[row][column])))
    }
  }
  return drawing
}

const shapes = {
  I: { colour: 'cyan', grid: ['....', 'XXXX', '....', '....'] },
  O: { colour: 'gold', grid: ['XX', 'XX'] },
  T: { colour: 'purple', grid: ['.X.', 'XXX', '...'] },
  S: { colour: 'green', grid: ['.XX', 'XX.', '...'] },
  Z: { colour: 'red', grid: ['XX.', '.XX', '...'] },
  J: { colour: 'blue', grid: ['X..', 'XXX', '...'] },
  L: { colour: 'orange', grid: ['..X', 'XXX', '...'] },
}

Type Piece {
  description: 'a shape: its colour, the size of its square grid, and its squares'
  example: { name: 'T', colour: 'purple', size: 3, cells: [{ row: 0, column: 0 }] }
}

Type Place {
  description: 'a row and a column on the board'
  example: { row: 0, column: 0 }
}

function cellsOf(grid: ['']) {
  const cells = []
  for (let row = 0; row < grid.length; row++) {
    for (let column = 0; column < grid[row].length; column++) {
      if (grid[row][column] == 'X') {
        cells.push({ row, column })
      }
    }
  }
  return cells
}

function makePiece(name: 'T') {
  const shape = shapes[name]
  return {
    name,
    colour: shape.colour,
    size: shape.grid.length,
    cells: cellsOf(shape.grid),
  }
}

function drawGame(board: [['']], piece: Piece, place: Place) {
  const drawing = drawBoard(board)
  for (const cell of piece.cells) {
    drawing.append(
      square(place.row + cell.row, place.column + cell.column, piece.colour)
    )
  }
  return drawing
}

// New in this step:

function fits(board: [['']], piece: Piece, place: Place) {
  for (const cell of piece.cells) {
    const row = place.row + cell.row
    const column = place.column + cell.column
    if (row < 0 || row >= board.length) {
      return false // above the top, or below the floor
    }
    if (column < 0 || column >= board[0].length) {
      return false // through a wall
    }
    if (board[row][column] != '') {
      return false // the square is already filled
    }
  }
  return true
}

const board = emptyBoard(20, 10)
board[19][3] = 'blue'
board[19][4] = 'blue'
board[19][5] = 'blue'
board[18][5] = 'blue'

const piece = makePiece('T')
const place = { row: 16, column: 3 }

preview.append(
  div(`Does the T fit at row ${place.row}, column ${place.column}? ${fits(board, piece, place)}`),
  drawGame(board, piece, place)
)

test 'a piece fits in open space' {
  const t = makePiece('T')
  expect(fits(emptyBoard(20, 10), t, { row: 0, column: 0 })).toBe(true)
  expect(fits(emptyBoard(20, 10), t, { row: 10, column: 4 })).toBe(true)
}

test 'the walls' {
  const board = emptyBoard(20, 10)
  const t = makePiece('T')
  expect(fits(board, t, { row: 0, column: 0 })).toBe(true)
  expect(fits(board, t, { row: 0, column: -1 })).toBe(false)
  expect(fits(board, t, { row: 0, column: 7 })).toBe(true)
  expect(fits(board, t, { row: 0, column: 8 })).toBe(false)
}

test 'the floor' {
  const board = emptyBoard(20, 10)
  const t = makePiece('T')
  expect(fits(board, t, { row: 18, column: 0 })).toBe(true)
  expect(fits(board, t, { row: 19, column: 0 })).toBe(false)
}

test 'other blocks' {
  const board = emptyBoard(20, 10)
  board[5][1] = 'red'
  const t = makePiece('T')
  expect(fits(board, t, { row: 4, column: 0 })).toBe(false)
  expect(fits(board, t, { row: 5, column: 0 })).toBe(false)
  expect(fits(board, t, { row: 6, column: 0 })).toBe(true)
  expect(fits(board, t, { row: 4, column: 2 })).toBe(true)
}
```

Each `if` is one way to fail, with `||` (or) joining the two edges of each kind: a row above
the top or below the floor, a column through the left or the right wall. A square of the board
that is not `''` is already filled. Only a piece that gets past every check, for every square,
reaches `return true`.

The tests are built from the edges, as Checking Your Work recommends (Test the edges). The T is
3 squares wide, so at column 7 its right-hand square is in column 9, the last one, and fits; at
column 8 it would need a column 10, and does not. Each pair of checks stands on either side of
a boundary, so a rule that is off by one fails one of them.

In the example, the T at row 16 sits right above the blue blocks. Change `place` to row 17 and
the answer is `false`: the T's right-hand square would be where a blue one already is. The drawing shows the
piece anyway, overlapping, because drawing only draws; deciding is the job of `fits`.

## Turning a piece

Turning a piece a quarter turn clockwise changes where its squares are in its little grid.
Picture a sheet of squared paper turned to the right: the top row becomes the right-hand
column, and the left-hand column becomes the top row. For each square, that is:

- its new **row** is its old **column**, and
- its new **column** is `size - 1 - row`: row 0, the top, goes to the last column, and the
  bottom row goes to column 0.

Here is the T worked through, with `size` 3:

| square | old row, column | new row     | new column      |
| ------ | --------------- | ----------- | --------------- |
| top    | 0, 1            | 1           | 3 - 1 - 0 = 2   |
| left   | 1, 0            | 0           | 3 - 1 - 1 = 1   |
| middle | 1, 1            | 1           | 3 - 1 - 1 = 1   |
| right  | 1, 2            | 2           | 3 - 1 - 1 = 1   |

The T pointing up becomes a T pointing right: `['.X.', '.XX', '.X.']`. `rotate` does that to
every square, with one loop, and gives back a new piece; the piece it was given is left alone.

Turning can fail like any move. A long I standing upright against the right wall has no room
to lie down. `turn` asks `fits` about the turned piece, and gives back either the turned piece
or, when it does not fit, the piece unchanged:

```tjs:inline {"view": "code"}
import { elements, svgElements } from 'tosijs'

const { div } = elements
const { svg, rect } = svgElements

function emptyBoard(rows: 20, columns: 10) {
  const board = []
  for (let row = 0; row < rows; row++) {
    const cells = []
    for (let column = 0; column < columns; column++) {
      cells.push('')
    }
    board.push(cells)
  }
  return board
}

const squareSize = 16 // pixels across each square

function colourOf(cell: '') {
  return cell == '' ? 'gainsboro' : cell
}

function square(row: 0, column: 0, colour: 'red') {
  return rect({
    x: column * squareSize,
    y: row * squareSize,
    width: squareSize,
    height: squareSize,
    fill: colour,
    stroke: 'white',
  })
}

function drawBoard(board: [['']]) {
  const drawing = svg({
    width: board[0].length * squareSize,
    height: board.length * squareSize,
  })
  for (let row = 0; row < board.length; row++) {
    for (let column = 0; column < board[row].length; column++) {
      drawing.append(square(row, column, colourOf(board[row][column])))
    }
  }
  return drawing
}

const shapes = {
  I: { colour: 'cyan', grid: ['....', 'XXXX', '....', '....'] },
  O: { colour: 'gold', grid: ['XX', 'XX'] },
  T: { colour: 'purple', grid: ['.X.', 'XXX', '...'] },
  S: { colour: 'green', grid: ['.XX', 'XX.', '...'] },
  Z: { colour: 'red', grid: ['XX.', '.XX', '...'] },
  J: { colour: 'blue', grid: ['X..', 'XXX', '...'] },
  L: { colour: 'orange', grid: ['..X', 'XXX', '...'] },
}

Type Piece {
  description: 'a shape: its colour, the size of its square grid, and its squares'
  example: { name: 'T', colour: 'purple', size: 3, cells: [{ row: 0, column: 0 }] }
}

Type Place {
  description: 'a row and a column on the board'
  example: { row: 0, column: 0 }
}

function cellsOf(grid: ['']) {
  const cells = []
  for (let row = 0; row < grid.length; row++) {
    for (let column = 0; column < grid[row].length; column++) {
      if (grid[row][column] == 'X') {
        cells.push({ row, column })
      }
    }
  }
  return cells
}

function makePiece(name: 'T') {
  const shape = shapes[name]
  return {
    name,
    colour: shape.colour,
    size: shape.grid.length,
    cells: cellsOf(shape.grid),
  }
}

function picture(piece: Piece) {
  const grid = emptyBoard(piece.size, piece.size)
  for (const cell of piece.cells) {
    grid[cell.row][cell.column] = 'X'
  }
  const lines = []
  for (const row of grid) {
    let line = ''
    for (const cell of row) {
      line = line + (cell == '' ? '.' : 'X')
    }
    lines.push(line)
  }
  return lines
}

function drawGame(board: [['']], piece: Piece, place: Place) {
  const drawing = drawBoard(board)
  for (const cell of piece.cells) {
    drawing.append(
      square(place.row + cell.row, place.column + cell.column, piece.colour)
    )
  }
  return drawing
}

function fits(board: [['']], piece: Piece, place: Place) {
  for (const cell of piece.cells) {
    const row = place.row + cell.row
    const column = place.column + cell.column
    if (row < 0 || row >= board.length) {
      return false // above the top, or below the floor
    }
    if (column < 0 || column >= board[0].length) {
      return false // through a wall
    }
    if (board[row][column] != '') {
      return false // the square is already filled
    }
  }
  return true
}

// New in this step:

function rotate(piece: Piece) {
  const cells = []
  for (const cell of piece.cells) {
    cells.push({ row: cell.column, column: piece.size - 1 - cell.row })
  }
  return { name: piece.name, colour: piece.colour, size: piece.size, cells }
}

function turn(board: [['']], piece: Piece, place: Place) {
  const turned = rotate(piece)
  return fits(board, turned, place) ? turned : piece
}

let t = makePiece('T')
for (let turns = 0; turns < 4; turns++) {
  preview.append(drawGame(emptyBoard(3, 3), t, { row: 0, column: 0 }), ' ')
  t = rotate(t)
}

const board = emptyBoard(6, 10)
const upright = rotate(makePiece('I'))
const place = { row: 1, column: 7 }
const after = turn(board, upright, place)

preview.append(
  div(`Against the wall, the I ${after == upright ? 'cannot' : 'can'} turn.`),
  drawGame(board, after, place)
)

test 'turning the T' {
  const t = makePiece('T')
  expect(picture(rotate(t))).toEqual(['.X.', '.XX', '.X.'])
  expect(picture(rotate(rotate(t)))).toEqual(['...', 'XXX', '.X.'])
  expect(picture(rotate(rotate(rotate(t))))).toEqual(['.X.', 'XX.', '.X.'])
}

test 'four turns bring a piece back' {
  for (const name of Object.keys(shapes)) {
    const piece = makePiece(name)
    expect(rotate(rotate(rotate(rotate(piece))))).toEqual(piece)
  }
}

test 'the O looks the same after a turn' {
  expect(picture(rotate(makePiece('O')))).toEqual(['XX', 'XX'])
}

test 'rotate leaves the piece it was given alone' {
  const t = makePiece('T')
  rotate(t)
  expect(picture(t)).toEqual(['.X.', 'XXX', '...'])
}

test 'a turn that does not fit is refused' {
  const board = emptyBoard(20, 10)
  const upright = rotate(makePiece('I'))
  expect(picture(upright)).toEqual(['..X.', '..X.', '..X.', '..X.'])
  expect(turn(board, upright, { row: 0, column: 7 })).toEqual(upright)
  expect(picture(turn(board, upright, { row: 0, column: 3 }))).toEqual([
    '....',
    '....',
    'XXXX',
    '....',
  ])
}

test 'a turn into another block is refused' {
  const board = emptyBoard(20, 10)
  board[2][4] = 'red'
  const t = makePiece('T')
  expect(turn(board, t, { row: 0, column: 3 })).toEqual(t)
}
```

The four Ts in the preview are one piece, drawn after each turn: `t = rotate(t)` replaces it
with its turned copy every round, which is why `t` is a `let`. The test 'four turns bring a
piece back' checks the rule for all seven pieces at once: four quarter turns are a whole turn,
so every square must end where it started.

That test is not enough on its own. Make a mistake in `rotate`: change `piece.size - 1 - cell.row`
to `piece.size - cell.row`, without the `- 1`. 'four turns bring a piece back' still passes,
because the mistake moves each square one column too far right on every turn and undoes itself
by the fourth. 'turning the T' fails, and its message shows the T sliding out of its grid:
`['..X', '..XX', '..X']`. A test that checks a real answer catches what a test of a round trip
cannot, which is Checking Your Work's question, Does your test catch anything?, again.

In the second picture the I is pressed against the right wall, upright in column 9. Lying down
would need columns 7 to 10, and there is no column 10, so `turn` gives back the upright piece
and the preview says it cannot turn. Change the place to column 5 and it lies down.

`turn` uses the same question every move uses, `fits`. Nothing about turning needed a new rule
for walls, the floor or other blocks: it got all three for free.

## Landing a piece

When a piece cannot fall any further, it lands: its squares are written into the board, in its
colour, and from then on they are part of the well. `land` gives back a new board with the
piece copied in, rather than changing the board it was given:

```tjs:inline {"view": "code"}
import { svgElements } from 'tosijs'

const { svg, rect } = svgElements

function emptyBoard(rows: 20, columns: 10) {
  const board = []
  for (let row = 0; row < rows; row++) {
    const cells = []
    for (let column = 0; column < columns; column++) {
      cells.push('')
    }
    board.push(cells)
  }
  return board
}

const squareSize = 16 // pixels across each square

function colourOf(cell: '') {
  return cell == '' ? 'gainsboro' : cell
}

function square(row: 0, column: 0, colour: 'red') {
  return rect({
    x: column * squareSize,
    y: row * squareSize,
    width: squareSize,
    height: squareSize,
    fill: colour,
    stroke: 'white',
  })
}

function drawBoard(board: [['']]) {
  const drawing = svg({
    width: board[0].length * squareSize,
    height: board.length * squareSize,
  })
  for (let row = 0; row < board.length; row++) {
    for (let column = 0; column < board[row].length; column++) {
      drawing.append(square(row, column, colourOf(board[row][column])))
    }
  }
  return drawing
}

const shapes = {
  I: { colour: 'cyan', grid: ['....', 'XXXX', '....', '....'] },
  O: { colour: 'gold', grid: ['XX', 'XX'] },
  T: { colour: 'purple', grid: ['.X.', 'XXX', '...'] },
  S: { colour: 'green', grid: ['.XX', 'XX.', '...'] },
  Z: { colour: 'red', grid: ['XX.', '.XX', '...'] },
  J: { colour: 'blue', grid: ['X..', 'XXX', '...'] },
  L: { colour: 'orange', grid: ['..X', 'XXX', '...'] },
}

Type Piece {
  description: 'a shape: its colour, the size of its square grid, and its squares'
  example: { name: 'T', colour: 'purple', size: 3, cells: [{ row: 0, column: 0 }] }
}

Type Place {
  description: 'a row and a column on the board'
  example: { row: 0, column: 0 }
}

function cellsOf(grid: ['']) {
  const cells = []
  for (let row = 0; row < grid.length; row++) {
    for (let column = 0; column < grid[row].length; column++) {
      if (grid[row][column] == 'X') {
        cells.push({ row, column })
      }
    }
  }
  return cells
}

function makePiece(name: 'T') {
  const shape = shapes[name]
  return {
    name,
    colour: shape.colour,
    size: shape.grid.length,
    cells: cellsOf(shape.grid),
  }
}

function fits(board: [['']], piece: Piece, place: Place) {
  for (const cell of piece.cells) {
    const row = place.row + cell.row
    const column = place.column + cell.column
    if (row < 0 || row >= board.length) {
      return false // above the top, or below the floor
    }
    if (column < 0 || column >= board[0].length) {
      return false // through a wall
    }
    if (board[row][column] != '') {
      return false // the square is already filled
    }
  }
  return true
}

function rotate(piece: Piece) {
  const cells = []
  for (const cell of piece.cells) {
    cells.push({ row: cell.column, column: piece.size - 1 - cell.row })
  }
  return { name: piece.name, colour: piece.colour, size: piece.size, cells }
}

// New in this step:

function land(board: [['']], piece: Piece, place: Place) {
  const landed = board.map((row) => [...row])
  for (const cell of piece.cells) {
    landed[place.row + cell.row][place.column + cell.column] = piece.colour
  }
  return landed
}

function lowest(board: [['']], piece: Piece, place: Place) {
  let row = place.row
  while (fits(board, piece, { row: row + 1, column: place.column })) {
    row = row + 1
  }
  return { row, column: place.column }
}

function dropAndLand(board: [['']], piece: Piece, column: 0) {
  return land(board, piece, lowest(board, piece, { row: 0, column }))
}

let board = emptyBoard(20, 10)
board = dropAndLand(board, makePiece('O'), 0)
board = dropAndLand(board, makePiece('T'), 1)
board = dropAndLand(board, makePiece('L'), 6)
board = dropAndLand(board, rotate(makePiece('I')), 7)

preview.append(drawBoard(board))

test 'landing writes the piece into a copy of the board' {
  const board = emptyBoard(4, 4)
  const landed = land(board, makePiece('O'), { row: 2, column: 1 })
  expect(landed[2]).toEqual(['', 'gold', 'gold', ''])
  expect(landed[3]).toEqual(['', 'gold', 'gold', ''])
  expect(board[3]).toEqual(['', '', '', ''])
}

test 'a piece falls to the floor' {
  const board = emptyBoard(20, 10)
  expect(lowest(board, makePiece('O'), { row: 0, column: 4 })).toEqual({ row: 18, column: 4 })
  expect(lowest(board, makePiece('T'), { row: 0, column: 4 })).toEqual({ row: 18, column: 4 })
}

test 'a piece falls onto other blocks' {
  const board = dropAndLand(emptyBoard(20, 10), makePiece('O'), 0)
  expect(board[19][0]).toBe('gold')
  expect(lowest(board, makePiece('O'), { row: 0, column: 0 })).toEqual({ row: 16, column: 0 })
  expect(lowest(board, makePiece('O'), { row: 0, column: 2 })).toEqual({ row: 18, column: 2 })
}
```

- `board.map((row) => [...row])` copies the board: `map` makes a new list of rows, and
  `[...row]` (from Lists, Putting a list in order) makes each row a new list of its own. Copying
  only the outer list would not be enough, for the reason in "One row, many names": the new
  board would share its rows with the old one, and writing a colour into one would write it
  into both. The first test checks the old board is still empty.
- `lowest` is the piece falling, all at once: while the row below still fits, go down one. It
  is a `while` loop, as in Repetition (`while`: until something changes), because nobody
  knows in advance how far a piece will fall. The loop always ends, because the floor stops it.
- `dropAndLand` puts the two together, so the example can build a board by dropping pieces into
  columns: a piece starts at row 0 of a column, falls as far as it can, and lands.

Why a copy, when the calculator's `press` changed the calculator it was given? Because a test
can then compare the board before and after, and because a board that is never changed in
place can be shared safely. `land` makes the new board; the program decides when to replace
the old one with it, in one assignment: `board = dropAndLand(…)`. That is why `board` is a
`let` here.

Change the columns the four pieces are dropped into, or add a fifth line, and watch the well
fill up.

## Finished rows

A row with no empty square in it is finished. `isFull` asks a question of every square in a
row: the first empty one is enough to say no, and only a row that gets through the whole loop
is full. It is the same shape as `fits`, a loop that can stop at the first failure.

`clearRows` keeps the rows that are not full, with `filter` from Lists, and counts how many it
removed. The rows that are left are fewer than the board needs, so it puts that many new empty
rows on top. That is what makes everything above a cleared row move down: nothing moves at
all; there are fewer rows below it.

Points reward clearing several rows at once: 100 for one row, 300 for two, 500 for three, and
800 for four, which is called a Tetris.

```tjs:inline {"view": "code"}
import { elements, svgElements } from 'tosijs'

const { div } = elements
const { svg, rect } = svgElements

function emptyBoard(rows: 20, columns: 10) {
  const board = []
  for (let row = 0; row < rows; row++) {
    const cells = []
    for (let column = 0; column < columns; column++) {
      cells.push('')
    }
    board.push(cells)
  }
  return board
}

const squareSize = 16 // pixels across each square

function colourOf(cell: '') {
  return cell == '' ? 'gainsboro' : cell
}

function square(row: 0, column: 0, colour: 'red') {
  return rect({
    x: column * squareSize,
    y: row * squareSize,
    width: squareSize,
    height: squareSize,
    fill: colour,
    stroke: 'white',
  })
}

function drawBoard(board: [['']]) {
  const drawing = svg({
    width: board[0].length * squareSize,
    height: board.length * squareSize,
  })
  for (let row = 0; row < board.length; row++) {
    for (let column = 0; column < board[row].length; column++) {
      drawing.append(square(row, column, colourOf(board[row][column])))
    }
  }
  return drawing
}

const shapes = {
  I: { colour: 'cyan', grid: ['....', 'XXXX', '....', '....'] },
  O: { colour: 'gold', grid: ['XX', 'XX'] },
  T: { colour: 'purple', grid: ['.X.', 'XXX', '...'] },
  S: { colour: 'green', grid: ['.XX', 'XX.', '...'] },
  Z: { colour: 'red', grid: ['XX.', '.XX', '...'] },
  J: { colour: 'blue', grid: ['X..', 'XXX', '...'] },
  L: { colour: 'orange', grid: ['..X', 'XXX', '...'] },
}

Type Piece {
  description: 'a shape: its colour, the size of its square grid, and its squares'
  example: { name: 'T', colour: 'purple', size: 3, cells: [{ row: 0, column: 0 }] }
}

Type Place {
  description: 'a row and a column on the board'
  example: { row: 0, column: 0 }
}

function cellsOf(grid: ['']) {
  const cells = []
  for (let row = 0; row < grid.length; row++) {
    for (let column = 0; column < grid[row].length; column++) {
      if (grid[row][column] == 'X') {
        cells.push({ row, column })
      }
    }
  }
  return cells
}

function makePiece(name: 'T') {
  const shape = shapes[name]
  return {
    name,
    colour: shape.colour,
    size: shape.grid.length,
    cells: cellsOf(shape.grid),
  }
}

function fits(board: [['']], piece: Piece, place: Place) {
  for (const cell of piece.cells) {
    const row = place.row + cell.row
    const column = place.column + cell.column
    if (row < 0 || row >= board.length) {
      return false // above the top, or below the floor
    }
    if (column < 0 || column >= board[0].length) {
      return false // through a wall
    }
    if (board[row][column] != '') {
      return false // the square is already filled
    }
  }
  return true
}

function rotate(piece: Piece) {
  const cells = []
  for (const cell of piece.cells) {
    cells.push({ row: cell.column, column: piece.size - 1 - cell.row })
  }
  return { name: piece.name, colour: piece.colour, size: piece.size, cells }
}

function land(board: [['']], piece: Piece, place: Place) {
  const landed = board.map((row) => [...row])
  for (const cell of piece.cells) {
    landed[place.row + cell.row][place.column + cell.column] = piece.colour
  }
  return landed
}

function lowest(board: [['']], piece: Piece, place: Place) {
  let row = place.row
  while (fits(board, piece, { row: row + 1, column: place.column })) {
    row = row + 1
  }
  return { row, column: place.column }
}

function dropAndLand(board: [['']], piece: Piece, column: 0) {
  return land(board, piece, lowest(board, piece, { row: 0, column }))
}

// New in this step:

function isFull(row: ['']) {
  for (const cell of row) {
    if (cell == '') {
      return false
    }
  }
  return true
}

function clearRows(board: [['']]) {
  const kept = board.filter((row) => !isFull(row))
  const cleared = board.length - kept.length
  const fresh = emptyBoard(cleared, board[0].length)
  return { board: [...fresh, ...kept], cleared }
}

function points(cleared: 0) {
  return [0, 100, 300, 500, 800][cleared]
}

// Four nearly full rows: two Os finish the top one, leaving a gap down the right for an I.
let board = emptyBoard(20, 10)
for (let row = 16; row < 20; row++) {
  for (let column = 0; column < 9; column++) {
    board[row][column] = row == 16 && column > 4 ? '' : 'blue'
  }
}
board = dropAndLand(board, makePiece('O'), 5)
board = dropAndLand(board, makePiece('O'), 7)
const before = dropAndLand(board, rotate(makePiece('I')), 7)
const after = clearRows(before)

preview.append(
  div(`Rows cleared: ${after.cleared}, for ${points(after.cleared)} points.`),
  drawBoard(before),
  ' ',
  drawBoard(after.board)
)

test 'a row is full only when every square is filled' {
  expect(isFull(['red', 'blue', 'gold'])).toBe(true)
  expect(isFull(['red', '', 'gold'])).toBe(false)
  expect(isFull(['', 'blue', 'gold'])).toBe(false)
  expect(isFull(['red', 'blue', ''])).toBe(false)
}

mock {
  const full = ['x', 'x', 'x']
  const gap = ['x', '', 'x']
  const empty = ['', '', '']
}

test 'no full rows: nothing changes' {
  expect(clearRows([empty, gap, gap])).toEqual({ board: [empty, gap, gap], cleared: 0 })
}

test 'one full row' {
  expect(clearRows([empty, gap, full])).toEqual({ board: [empty, empty, gap], cleared: 1 })
}

test 'two full rows, with a row between them' {
  const result = clearRows([full, gap, full])
  expect(result.cleared).toBe(2)
  expect(result.board).toEqual([empty, empty, gap])
}

test 'four full rows at once' {
  const result = clearRows([gap, full, full, full, full])
  expect(result.cleared).toBe(4)
  expect(result.board).toEqual([empty, empty, empty, empty, gap])
}

test 'the board keeps its size' {
  expect(clearRows([full, full, gap]).board.length).toBe(3)
}

test 'points' {
  expect(points(0)).toBe(0)
  expect(points(1)).toBe(100)
  expect(points(2)).toBe(300)
  expect(points(4)).toBe(800)
}
```

- `!isFull(row)` uses `!` (not) from Decisions, so `filter` keeps the rows that are **not**
  full.
- `[...fresh, ...kept]` makes one new list from two: the `...` spreads out the items of each,
  as `[...numbers]` did in Lists, and the square brackets around them collect them, the empty
  rows first, then the kept ones.
- `points` looks the score up in a list by position: `[0, 100, 300, 500, 800][cleared]` is item
  `cleared` of that list, so two rows score item 2, 300.
- `clearRows` gives back two answers, the new board and how many rows went, in one object, as
  `stats` did in Things with Parts (Functions that make objects).

The `mock` block (it holds setup for the tests, so the three sample rows are written once) makes
three tiny rows, each three squares wide. A rule that works for rows of three works for rows
of ten, and a board of five three-square rows is one you can read in a test at a glance.

'two full rows, with a row between them' is the test most worth having. A first attempt at
`clearRows` often goes down the board removing rows one at a time, and gets confused when two
rows next to each other, or one apart, are both full. Keeping the rows that are not full, all
at once, cannot get confused that way.

The preview shows the board before the I lands and after the rows clear: four full rows, all
gone, and the four gold squares that stood on top of them have moved down to the bottom row.

## One turn of the game

The rules are all there. What is left is one more set of functions to say what happens on each
tick of the clock and each press of a key, and they put the five facts from the start of the
chapter into one object, the **game**. As with the calculator, these functions change the
object they are given rather than making a new one, because the game is the one thing that
lasts from the first piece to the last.

- `newGame(piece)` makes a game with an empty board and the first piece at the top.
- `move(game, down, across)` moves the piece if it fits there, and says whether it did.
- `fall(game, next)` is one tick of the clock: the piece moves down one row if it can. If it
  cannot, it lands, the full rows are cleared and scored, and `next` becomes the new piece at
  the top. If the new piece does not fit there, the game is over.
- `steer(game, key)` is one key press: left, right and down move the piece, and up turns it.

`fall` does not choose the next piece; whoever calls it does. On the clock, that will be a
random piece. In the tests it is whatever piece the test needs. A rule that picked its own
random piece could not be tested, because nobody could say what it should do.

```tjs:inline {"view": "code"}
import { elements, svgElements } from 'tosijs'

const { div } = elements
const { svg, rect } = svgElements

function emptyBoard(rows: 20, columns: 10) {
  const board = []
  for (let row = 0; row < rows; row++) {
    const cells = []
    for (let column = 0; column < columns; column++) {
      cells.push('')
    }
    board.push(cells)
  }
  return board
}

const squareSize = 16 // pixels across each square

function colourOf(cell: '') {
  return cell == '' ? 'gainsboro' : cell
}

function square(row: 0, column: 0, colour: 'red') {
  return rect({
    x: column * squareSize,
    y: row * squareSize,
    width: squareSize,
    height: squareSize,
    fill: colour,
    stroke: 'white',
  })
}

function drawBoard(board: [['']]) {
  const drawing = svg({
    width: board[0].length * squareSize,
    height: board.length * squareSize,
  })
  for (let row = 0; row < board.length; row++) {
    for (let column = 0; column < board[row].length; column++) {
      drawing.append(square(row, column, colourOf(board[row][column])))
    }
  }
  return drawing
}

const shapes = {
  I: { colour: 'cyan', grid: ['....', 'XXXX', '....', '....'] },
  O: { colour: 'gold', grid: ['XX', 'XX'] },
  T: { colour: 'purple', grid: ['.X.', 'XXX', '...'] },
  S: { colour: 'green', grid: ['.XX', 'XX.', '...'] },
  Z: { colour: 'red', grid: ['XX.', '.XX', '...'] },
  J: { colour: 'blue', grid: ['X..', 'XXX', '...'] },
  L: { colour: 'orange', grid: ['..X', 'XXX', '...'] },
}

Type Piece {
  description: 'a shape: its colour, the size of its square grid, and its squares'
  example: { name: 'T', colour: 'purple', size: 3, cells: [{ row: 0, column: 0 }] }
}

Type Place {
  description: 'a row and a column on the board'
  example: { row: 0, column: 0 }
}

function cellsOf(grid: ['']) {
  const cells = []
  for (let row = 0; row < grid.length; row++) {
    for (let column = 0; column < grid[row].length; column++) {
      if (grid[row][column] == 'X') {
        cells.push({ row, column })
      }
    }
  }
  return cells
}

function makePiece(name: 'T') {
  const shape = shapes[name]
  return {
    name,
    colour: shape.colour,
    size: shape.grid.length,
    cells: cellsOf(shape.grid),
  }
}

function drawGame(board: [['']], piece: Piece, place: Place) {
  const drawing = drawBoard(board)
  for (const cell of piece.cells) {
    drawing.append(
      square(place.row + cell.row, place.column + cell.column, piece.colour)
    )
  }
  return drawing
}

function fits(board: [['']], piece: Piece, place: Place) {
  for (const cell of piece.cells) {
    const row = place.row + cell.row
    const column = place.column + cell.column
    if (row < 0 || row >= board.length) {
      return false // above the top, or below the floor
    }
    if (column < 0 || column >= board[0].length) {
      return false // through a wall
    }
    if (board[row][column] != '') {
      return false // the square is already filled
    }
  }
  return true
}

function rotate(piece: Piece) {
  const cells = []
  for (const cell of piece.cells) {
    cells.push({ row: cell.column, column: piece.size - 1 - cell.row })
  }
  return { name: piece.name, colour: piece.colour, size: piece.size, cells }
}

function turn(board: [['']], piece: Piece, place: Place) {
  const turned = rotate(piece)
  return fits(board, turned, place) ? turned : piece
}

function land(board: [['']], piece: Piece, place: Place) {
  const landed = board.map((row) => [...row])
  for (const cell of piece.cells) {
    landed[place.row + cell.row][place.column + cell.column] = piece.colour
  }
  return landed
}

function isFull(row: ['']) {
  for (const cell of row) {
    if (cell == '') {
      return false
    }
  }
  return true
}

function clearRows(board: [['']]) {
  const kept = board.filter((row) => !isFull(row))
  const cleared = board.length - kept.length
  const fresh = emptyBoard(cleared, board[0].length)
  return { board: [...fresh, ...kept], cleared }
}

function points(cleared: 0) {
  return [0, 100, 300, 500, 800][cleared]
}

// New in this step:

Type Game {
  description: 'everything the game remembers'
  example: {
    board: [['']],
    piece: { name: 'T', colour: 'purple', size: 3, cells: [{ row: 0, column: 0 }] },
    place: { row: 0, column: 0 },
    score: 0,
    over: false,
  }
}

function startPlace(board: [['']], piece: Piece) {
  return { row: 0, column: Math.floor((board[0].length - piece.size) / 2) }
}

function newGame(piece: Piece) {
  const board = emptyBoard(20, 10)
  return { board, piece, place: startPlace(board, piece), score: 0, over: false }
}

function move(game: Game, down: 0, across: 0) {
  const place = { row: game.place.row + down, column: game.place.column + across }
  if (fits(game.board, game.piece, place)) {
    game.place = place
    return true
  }
  return false
}

function fall(game: Game, next: Piece) {
  if (game.over) {
    return
  }
  if (move(game, 1, 0)) {
    return // it fell one row, and that is all
  }
  const result = clearRows(land(game.board, game.piece, game.place))
  game.board = result.board
  game.score = game.score + points(result.cleared)
  game.piece = next
  game.place = startPlace(game.board, next)
  if (!fits(game.board, next, game.place)) {
    game.over = true
  }
}

function steer(game: Game, key: 'ArrowLeft') {
  if (game.over) {
    return
  }
  given key {
    'ArrowLeft' { move(game, 0, -1) }
    'ArrowRight' { move(game, 0, 1) }
    'ArrowDown' { move(game, 1, 0) }
    'ArrowUp' { game.piece = turn(game.board, game.piece, game.place) }
  }
}

// A few moves, played by the program instead of a person:
const game = newGame(makePiece('T'))
steer(game, 'ArrowUp')
steer(game, 'ArrowLeft')
steer(game, 'ArrowLeft')
for (let tick = 0; tick < 40; tick++) {
  fall(game, makePiece('L'))
}

preview.append(
  div(`Score: ${game.score}. Over: ${game.over}.`),
  drawGame(game.board, game.piece, game.place)
)

test 'a new game puts the piece at the top, in the middle' {
  const game = newGame(makePiece('T'))
  expect(game.place).toEqual({ row: 0, column: 3 })
  expect(newGame(makePiece('O')).place).toEqual({ row: 0, column: 4 })
  expect(game.score).toBe(0)
  expect(game.over).toBe(false)
}

test 'a tick moves the piece down one row' {
  const game = newGame(makePiece('T'))
  fall(game, makePiece('O'))
  expect(game.place).toEqual({ row: 1, column: 3 })
  expect(game.piece.name).toBe('T')
}

test 'a piece that cannot fall lands, and the next one appears' {
  const game = newGame(makePiece('O'))
  game.place = { row: 18, column: 0 }
  fall(game, makePiece('T'))
  expect(game.board[19][0]).toBe('gold')
  expect(game.piece.name).toBe('T')
  expect(game.place).toEqual({ row: 0, column: 3 })
}

test 'landing that fills a row scores' {
  const game = newGame(makePiece('I'))
  for (let column = 0; column < 6; column++) {
    game.board[19][column] = 'blue'
  }
  game.place = { row: 18, column: 6 } // the I lies in row 1 of its grid: row 19
  fall(game, makePiece('O'))
  expect(game.score).toBe(100)
  expect(game.board[19]).toEqual(['', '', '', '', '', '', '', '', '', ''])
}

test 'the keys' {
  const game = newGame(makePiece('T'))
  steer(game, 'ArrowLeft')
  expect(game.place.column).toBe(2)
  steer(game, 'ArrowRight')
  steer(game, 'ArrowRight')
  expect(game.place.column).toBe(4)
  steer(game, 'ArrowDown')
  expect(game.place.row).toBe(1)
  steer(game, 'ArrowUp')
  expect(game.piece.cells).toEqual(rotate(makePiece('T')).cells)
  steer(game, 'Enter')
  expect(game.place).toEqual({ row: 1, column: 4 })
}

test 'a wall stops the piece' {
  const game = newGame(makePiece('T'))
  for (let presses = 0; presses < 10; presses++) {
    steer(game, 'ArrowLeft')
  }
  expect(game.place.column).toBe(0)
}

test 'the game is over when a new piece has no room' {
  const game = newGame(makePiece('O'))
  game.board[1][4] = 'red'
  game.place = { row: 18, column: 0 }
  fall(game, makePiece('O'))
  expect(game.over).toBe(true)
  fall(game, makePiece('O'))
  steer(game, 'ArrowLeft')
  expect(game.place).toEqual({ row: 0, column: 4 })
}

test 'a game with a missing part is refused' {
  expect(fall({ board: [['']], score: 0, over: false }, makePiece('O')) instanceof Error).toBe(true)
}
```

- `startPlace` puts a piece in the middle of the top row. A 3-wide piece on a 10-wide board
  starts at column `Math.floor(7 / 2)`, which is 3, so it covers columns 3, 4 and 5.
  (`Math.floor` rounds down, as in Functions.)
- `move` builds the place the piece would go to, asks `fits`, and only then changes the game.
  A move that does not fit changes nothing, which is how a wall stops a piece: the test 'a wall
  stops the piece' presses left ten times, and the piece stops at column 0.
- `fall` has two `return`s near the top, each ending the turn early: a game that is over does
  nothing, and a piece that moved down has done all it needs to. Only a piece that could not
  move gets past them, to land.
- `steer` uses `given` from Decisions to choose by key. A key it does not list, such as
  `'Enter'`, matches no arm, so nothing happens.
- `Type Game` is the plan from the start of the chapter, written where TJS can check it, as
  the example on `press` was in A Calculator. The last test hands `fall` a game with no piece
  and no place, and it is refused.

The key names, `'ArrowLeft'` and the rest, are what the browser calls the arrow keys. They are
plain strings here, so the tests can press keys without a keyboard. The next step connects
them to a real one.

The preview shows a short game played by the program: the T turned and moved two columns left,
then forty ticks of the clock. The T falls to the floor and lands. An L appears at the top,
falls, and lands on the T's right-hand corner, leaving a gap under it that nothing can reach
now, and the next L is on its way down. Change the moves, or the pieces, and see where they
end up. Notice that the program played a game with no clock and no keys, in a handful of lines.
That is what keeping the rules apart from the wiring buys.

## The game loop

Now the game can be played. Everything new here is wiring, and each piece of it comes from
Time and Events:

- **The clock** (A clock that ticks). `setInterval` calls `onTick` every 500 milliseconds,
  twice a second, and `onTick` calls `fall` with a random next piece. `clearInterval` stops it.
- **The keys** (Keys that steer). A `keydown` listener on the whole page calls `steer` with
  `event.key`. `event.preventDefault()` stops the arrow keys doing what they normally do,
  scrolling the page (Keeping the page still), but only for the four keys the game uses, so
  every other key still works.
- **One state** (One state, two sources of change). The clock and the keys both change the same
  `game`, and after either one, `show` draws the whole game again from it, the way `drawBoard`
  was meant to be used. Neither the clock nor the keys draws anything itself.
- **Start, pause and game over** (Starting, pausing and stopping). Nothing runs until **Start**
  is pressed. Start does nothing if the game is already running, so pressing it twice cannot
  make two clocks. `stop` stops the clock and removes the key listener, and both **Pause** and
  game over use it. After game over, Start begins a new game.

```tjs:inline {"view": "code"}
import { elements, svgElements, tosi } from 'tosijs'

const { div, button, strong } = elements
const { svg, rect } = svgElements

function emptyBoard(rows: 20, columns: 10) {
  const board = []
  for (let row = 0; row < rows; row++) {
    const cells = []
    for (let column = 0; column < columns; column++) {
      cells.push('')
    }
    board.push(cells)
  }
  return board
}

const squareSize = 16 // pixels across each square

function colourOf(cell: '') {
  return cell == '' ? 'gainsboro' : cell
}

function square(row: 0, column: 0, colour: 'red') {
  return rect({
    x: column * squareSize,
    y: row * squareSize,
    width: squareSize,
    height: squareSize,
    fill: colour,
    stroke: 'white',
  })
}

function drawBoard(board: [['']]) {
  const drawing = svg({
    width: board[0].length * squareSize,
    height: board.length * squareSize,
  })
  for (let row = 0; row < board.length; row++) {
    for (let column = 0; column < board[row].length; column++) {
      drawing.append(square(row, column, colourOf(board[row][column])))
    }
  }
  return drawing
}

const shapes = {
  I: { colour: 'cyan', grid: ['....', 'XXXX', '....', '....'] },
  O: { colour: 'gold', grid: ['XX', 'XX'] },
  T: { colour: 'purple', grid: ['.X.', 'XXX', '...'] },
  S: { colour: 'green', grid: ['.XX', 'XX.', '...'] },
  Z: { colour: 'red', grid: ['XX.', '.XX', '...'] },
  J: { colour: 'blue', grid: ['X..', 'XXX', '...'] },
  L: { colour: 'orange', grid: ['..X', 'XXX', '...'] },
}

Type Piece {
  description: 'a shape: its colour, the size of its square grid, and its squares'
  example: { name: 'T', colour: 'purple', size: 3, cells: [{ row: 0, column: 0 }] }
}

Type Place {
  description: 'a row and a column on the board'
  example: { row: 0, column: 0 }
}

function cellsOf(grid: ['']) {
  const cells = []
  for (let row = 0; row < grid.length; row++) {
    for (let column = 0; column < grid[row].length; column++) {
      if (grid[row][column] == 'X') {
        cells.push({ row, column })
      }
    }
  }
  return cells
}

function makePiece(name: 'T') {
  const shape = shapes[name]
  return {
    name,
    colour: shape.colour,
    size: shape.grid.length,
    cells: cellsOf(shape.grid),
  }
}

function drawGame(board: [['']], piece: Piece, place: Place) {
  const drawing = drawBoard(board)
  for (const cell of piece.cells) {
    drawing.append(
      square(place.row + cell.row, place.column + cell.column, piece.colour)
    )
  }
  return drawing
}

function fits(board: [['']], piece: Piece, place: Place) {
  for (const cell of piece.cells) {
    const row = place.row + cell.row
    const column = place.column + cell.column
    if (row < 0 || row >= board.length) {
      return false // above the top, or below the floor
    }
    if (column < 0 || column >= board[0].length) {
      return false // through a wall
    }
    if (board[row][column] != '') {
      return false // the square is already filled
    }
  }
  return true
}

function rotate(piece: Piece) {
  const cells = []
  for (const cell of piece.cells) {
    cells.push({ row: cell.column, column: piece.size - 1 - cell.row })
  }
  return { name: piece.name, colour: piece.colour, size: piece.size, cells }
}

function turn(board: [['']], piece: Piece, place: Place) {
  const turned = rotate(piece)
  return fits(board, turned, place) ? turned : piece
}

function land(board: [['']], piece: Piece, place: Place) {
  const landed = board.map((row) => [...row])
  for (const cell of piece.cells) {
    landed[place.row + cell.row][place.column + cell.column] = piece.colour
  }
  return landed
}

function isFull(row: ['']) {
  for (const cell of row) {
    if (cell == '') {
      return false
    }
  }
  return true
}

function clearRows(board: [['']]) {
  const kept = board.filter((row) => !isFull(row))
  const cleared = board.length - kept.length
  const fresh = emptyBoard(cleared, board[0].length)
  return { board: [...fresh, ...kept], cleared }
}

function points(cleared: 0) {
  return [0, 100, 300, 500, 800][cleared]
}

Type Game {
  description: 'everything the game remembers'
  example: {
    board: [['']],
    piece: { name: 'T', colour: 'purple', size: 3, cells: [{ row: 0, column: 0 }] },
    place: { row: 0, column: 0 },
    score: 0,
    over: false,
  }
}

function startPlace(board: [['']], piece: Piece) {
  return { row: 0, column: Math.floor((board[0].length - piece.size) / 2) }
}

function newGame(piece: Piece) {
  const board = emptyBoard(20, 10)
  return { board, piece, place: startPlace(board, piece), score: 0, over: false }
}

function move(game: Game, down: 0, across: 0) {
  const place = { row: game.place.row + down, column: game.place.column + across }
  if (fits(game.board, game.piece, place)) {
    game.place = place
    return true
  }
  return false
}

function fall(game: Game, next: Piece) {
  if (game.over) {
    return
  }
  if (move(game, 1, 0)) {
    return // it fell one row, and that is all
  }
  const result = clearRows(land(game.board, game.piece, game.place))
  game.board = result.board
  game.score = game.score + points(result.cleared)
  game.piece = next
  game.place = startPlace(game.board, next)
  if (!fits(game.board, next, game.place)) {
    game.over = true
  }
}

function steer(game: Game, key: 'ArrowLeft') {
  if (game.over) {
    return
  }
  given key {
    'ArrowLeft' { move(game, 0, -1) }
    'ArrowRight' { move(game, 0, 1) }
    'ArrowDown' { move(game, 1, 0) }
    'ArrowUp' { game.piece = turn(game.board, game.piece, game.place) }
  }
}

// New in this step:

function randomPiece() {
  const names = Object.keys(shapes)
  return makePiece(names[Math.floor(Math.random() * names.length)])
}

const { status } = tosi({ status: { score: 0, message: 'Press Start to play.' } })

let game = newGame(randomPiece())
let timer = null

const screen = div()
screen.append(drawGame(game.board, game.piece, game.place))

function show() {
  screen.replaceChildren(drawGame(game.board, game.piece, game.place))
  status.score = game.score
}

const gameKeys = ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp']

function onKey(event) {
  if (gameKeys.includes(event.key)) {
    event.preventDefault()
    steer(game, event.key)
    show()
  }
}

function stop(message: '') {
  clearInterval(timer)
  timer = null
  document.removeEventListener('keydown', onKey)
  status.message = message
}

function onTick() {
  fall(game, randomPiece())
  show()
  if (game.over) {
    stop('Game over. Press Start to play again.')
  }
}

function start() {
  if (timer != null) {
    return // already running
  }
  if (game.over) {
    game = newGame(randomPiece())
    show()
  }
  status.message = 'Left and right move, up turns, down drops faster.'
  timer = setInterval(onTick, 500)
  document.addEventListener('keydown', onKey)
}

function pause() {
  if (timer != null) {
    stop('Paused. Press Start to carry on.')
  }
}

preview.append(
  div('Score: ', strong(status.score), '. ', status.message),
  div(button({ onClick: start }, 'Start'), ' ', button({ onClick: pause }, 'Pause')),
  screen
)

test 'a random piece is one of the seven' {
  for (let tries = 0; tries < 20; tries++) {
    const piece = randomPiece()
    expect(Object.keys(shapes)).toContain(piece.name)
    expect(piece.cells.length).toBe(4)
  }
}

test 'the rules still hold' {
  const game = newGame(makePiece('I'))
  for (let column = 0; column < 6; column++) {
    game.board[19][column] = 'blue'
  }
  steer(game, 'ArrowRight')
  steer(game, 'ArrowRight')
  steer(game, 'ArrowRight')
  for (let tick = 0; tick < 19; tick++) {
    fall(game, makePiece('O'))
  }
  expect(game.score).toBe(100)
  expect(game.piece.name).toBe('O')
  expect(game.over).toBe(false)
}
```

Press **Start**, then use the arrow keys. Each piece falls, lands and is replaced; fill a row
and watch it go, and the score go up.

- `randomPiece` picks one of the seven names at random, the way `rollDie` rolled a die in
  Functions, and makes that piece. It is the only part of the game that is not the same every
  time, and it lives out here with the wiring, not in the rules.
- `status` is a tosijs model, as in Responding to the Reader, holding what the line above the
  board says: the score and a message. Changing `status.score` or `status.message` changes the
  page by itself.
- The board is not a model. `show` draws a new picture of the whole game and puts it in
  `screen` with `replaceChildren`, which empties an element and puts the new contents in, in one
  step. Drawing all 200 squares again on every tick and every key press sounds like a lot of
  work, but it is far less than a computer can do in the blink of an eye, and it means the
  picture can never disagree with the game.
- `let game`, `let timer` and `screen` are outside every function, so the clock, the keys and
  the buttons all find the same ones. `game` is a `let` because Start replaces it with a new
  game after game over.
- `timer` is `null` whenever the game is not running, which is how `start` and `pause` know
  whether it is: `stop` puts it back to `null` every time.

Every function in this step is a few lines, and none of them contains a rule of the game. The
test 'the rules still hold' plays the first piece of a game to the end with no clock and no
keys, so if the game ever misbehaves, start by asking whether the rules or the wiring are to
blame: a test can answer the first question in a moment.

Two things to know while you play. While the game runs, the arrow keys belong to it, all over
the page, even in the code editor; press **Pause** before you change the code. And if you change
the example while a game is running, the old game's clock and keys carry on, as the countdown's
timer did in Things That Take Time. Pause first, or reload the page.

## Try it

Work at the last example, the whole game. For each change, write the rule as a function with a
test first, as in A Calculator, then wire it in.

- **Hard drop.** Make the space bar drop the piece straight to the bottom. `event.key` is `' '`
  (a space) for the space bar. Bring `lowest` back from Landing a piece, add a `' '` arm to
  `steer` that moves the piece to `lowest(…)`, and add `' '` to `gameKeys`. Test that after a
  hard drop on an empty board, an O is at row 18.
- **Ghost piece.** Many versions show where the piece would land, as a pale outline at the
  bottom. In `drawGame`, before drawing the piece, draw its squares again at
  `lowest(board, piece, place)`, in `'silver'`.
- **Show the next piece.** Give the game a sixth fact, `next`, a piece. `fall` takes its new
  piece from `game.next` and puts the piece it is given into `game.next` instead. Draw the next
  piece beside the board on a little board of its own, as the seven pieces were drawn in A piece
  as data. Remember to add `next` to `Type Game` and to `newGame`.
- **Levels.** Count the rows cleared (another fact, `lines`), and every ten lines make the clock
  faster: 500 milliseconds at first, 450 after ten lines, and so on. Write
  `delay(lines: 0)` and test it first. A running interval cannot change its speed, so when the
  level changes, `clearInterval` the old timer and start a new one.
- **High score.** Keep the best score so far in `status`, beside the score, and update it at
  game over. It should survive Start, which makes a new game; why does it, when the score does
  not?
- **Turning the other way.** Make `z` turn the piece anticlockwise. Three quarter turns
  clockwise are one quarter turn the other way, so you need no new rule for squares: only a new
  arm in `steer`. Then test that `z` followed by up leaves a piece as it was.
- **A gentler wall.** When a turn does not fit, real Tetris tries the turned piece one column
  to the left, then one to the right, before refusing. Add that to `turn`, and change the test
  'a turn that does not fit is refused' to say what should happen now.
- **Recursion.** `lowest` is a loop. Write it again the way [Recursion](/recursion/) would: if
  the piece does not fit one row down, the lowest place is where it is; otherwise it is the
  lowest place from one row down. Do the tests from Landing a piece still pass?

Work them here:

```tjs:inline {"view": "code"}
// Your code here. Show results with preview.append(…), check them with a
// test block, then press the refresh button (or ⌘S / Ctrl+S) to run it.
```
