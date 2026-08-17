(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) {
        module.exports = api;
    }
    root.CrosswordEngine = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const DIRECTIONS = ["across", "down"];
    const SLUG_PATTERN = /^week[1-9][0-9]*$/;

    function cellKey(row, col) {
        return `${row},${col}`;
    }

    function deriveEntries(grid) {
        const height = grid.length;
        const width = grid[0].length;
        const entries = { across: [], down: [] };
        const cells = new Map();
        let nextNumber = 1;

        function isOpen(row, col) {
            return row >= 0 && row < height && col >= 0 && col < width && grid[row][col] !== ".";
        }

        for (let row = 0; row < height; row += 1) {
            for (let col = 0; col < width; col += 1) {
                if (!isOpen(row, col)) continue;

                const startsAcross = !isOpen(row, col - 1) && isOpen(row, col + 1);
                const startsDown = !isOpen(row - 1, col) && isOpen(row + 1, col);
                if (!startsAcross && !startsDown) continue;

                const number = nextNumber;
                nextNumber += 1;

                DIRECTIONS.forEach((direction) => {
                    if ((direction === "across" && !startsAcross) || (direction === "down" && !startsDown)) return;

                    const entryCells = [];
                    let currentRow = row;
                    let currentCol = col;
                    while (isOpen(currentRow, currentCol)) {
                        entryCells.push({ row: currentRow, col: currentCol });
                        if (direction === "across") currentCol += 1;
                        else currentRow += 1;
                    }

                    const entry = {
                        id: `${direction}-${row}-${col}`,
                        direction,
                        number,
                        row,
                        col,
                        cells: entryCells
                    };
                    entries[direction].push(entry);
                    entryCells.forEach((cell) => {
                        const key = cellKey(cell.row, cell.col);
                        const details = cells.get(key) || { row: cell.row, col: cell.col, entries: {} };
                        details.entries[direction] = entry;
                        cells.set(key, details);
                    });
                });
            }
        }

        return { entries, cells, width, height };
    }

    function validatePuzzle(data) {
        if (!data || typeof data !== "object" || Array.isArray(data)) {
            throw new Error("Puzzle data must be an object.");
        }
        if (typeof data.title !== "string" || !data.title.trim()) {
            throw new Error("Puzzle title must be a non-empty string.");
        }
        if (!Array.isArray(data.grid) || data.grid.length === 0) {
            throw new Error("Puzzle grid must contain at least one row.");
        }
        if (!data.grid.every((row) => typeof row === "string" && row.length > 0)) {
            throw new Error("Every puzzle grid row must be a non-empty string.");
        }

        const width = data.grid[0].length;
        if (!data.grid.every((row) => row.length === width)) {
            throw new Error("Puzzle grid must be rectangular.");
        }

        const grid = data.grid.map((row, rowIndex) => Array.from(row, (value, colIndex) => {
            if (value === ".") return value;
            if (!/^[a-z]$/i.test(value)) {
                throw new Error(`Grid cell at row ${rowIndex + 1}, column ${colIndex + 1} must be a letter or '.'.`);
            }
            return value.toUpperCase();
        }).join(""));

        if (!data.clues || typeof data.clues !== "object") {
            throw new Error("Puzzle clues must include across and down arrays.");
        }

        const model = deriveEntries(grid);
        DIRECTIONS.forEach((direction) => {
            const clueList = data.clues[direction];
            if (!Array.isArray(clueList) || !clueList.every((clue) => typeof clue === "string" && clue.trim())) {
                throw new Error(`${direction[0].toUpperCase() + direction.slice(1)} clues must be non-empty strings.`);
            }
            if (clueList.length !== model.entries[direction].length) {
                throw new Error(
                    `Expected ${model.entries[direction].length} ${direction} clues, but found ${clueList.length}.`
                );
            }
            model.entries[direction].forEach((entry, index) => {
                entry.clue = clueList[index].trim();
                entry.answer = entry.cells.map((cell) => grid[cell.row][cell.col]).join("");
            });
        });

        return {
            title: data.title.trim(),
            grid,
            ...model
        };
    }

    function createPlayer(documentRef, model) {
        const elements = {
            title: documentRef.getElementById("puzzle-title"),
            timer: documentRef.getElementById("timer"),
            game: documentRef.getElementById("game"),
            grid: documentRef.getElementById("grid"),
            cluesWrapper: documentRef.getElementById("clues-wrapper"),
            overlay: documentRef.getElementById("overlay"),
            controls: documentRef.getElementById("controls"),
            startButton: documentRef.getElementById("start-btn"),
            checkButton: documentRef.getElementById("check-btn"),
            revealButton: documentRef.getElementById("reveal-btn"),
            resetButton: documentRef.getElementById("reset-btn"),
            message: documentRef.getElementById("message")
        };
        const entryById = new Map();
        const allEntries = [];
        DIRECTIONS.forEach((direction) => {
            model.entries[direction].forEach((entry) => {
                entryById.set(entry.id, entry);
                allEntries.push(entry);
            });
        });

        let activeEntry = allEntries[0] || null;
        let activeCell = activeEntry ? activeEntry.cells[0] : null;
        let gameActive = false;
        let timerSeconds = 0;
        let timerInterval = null;

        function getCell(row, col) {
            return elements.grid.querySelector(`[data-cell="${cellKey(row, col)}"]`);
        }

        function getInput(row, col) {
            const wrapper = getCell(row, col);
            return wrapper ? wrapper.querySelector("input") : null;
        }

        function setInputsDisabled(disabled) {
            elements.grid.querySelectorAll(".cell-input").forEach((input) => {
                input.disabled = disabled;
            });
        }

        function updateTimer() {
            const minutes = String(Math.floor(timerSeconds / 60)).padStart(2, "0");
            const seconds = String(timerSeconds % 60).padStart(2, "0");
            elements.timer.textContent = `${minutes}:${seconds}`;
        }

        function startTimer() {
            clearInterval(timerInterval);
            timerSeconds = 0;
            updateTimer();
            timerInterval = setInterval(() => {
                timerSeconds += 1;
                updateTimer();
            }, 1000);
        }

        function chooseEntryForCell(row, col, preferredDirection) {
            const details = model.cells.get(cellKey(row, col));
            if (!details) return null;
            return details.entries[preferredDirection]
                || details.entries.across
                || details.entries.down
                || null;
        }

        function selectCell(row, col, requestedEntry) {
            if (!gameActive) return;
            const nextEntry = requestedEntry || chooseEntryForCell(
                row,
                col,
                activeEntry ? activeEntry.direction : "across"
            );
            if (!nextEntry) return;

            activeEntry = nextEntry;
            activeCell = { row, col };
            elements.grid.querySelectorAll(".cell-wrapper").forEach((element) => {
                element.classList.remove("active-cell", "highlighted-word");
            });
            documentRef.querySelectorAll(".clue-item").forEach((element) => element.classList.remove("active-clue"));

            activeEntry.cells.forEach((cell) => getCell(cell.row, cell.col).classList.add("highlighted-word"));
            const activeWrapper = getCell(row, col);
            activeWrapper.classList.add("active-cell");
            const input = activeWrapper.querySelector("input");
            if (input) input.focus();

            const clueElement = documentRef.getElementById(`clue-${activeEntry.id}`);
            if (clueElement) {
                clueElement.classList.add("active-clue");
                clueElement.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }
        }

        function handleCellClick(row, col) {
            const details = model.cells.get(cellKey(row, col));
            if (!details) return;
            let requestedEntry;
            if (activeCell && activeCell.row === row && activeCell.col === col && details.entries.across && details.entries.down) {
                requestedEntry = activeEntry.direction === "across" ? details.entries.down : details.entries.across;
            } else {
                requestedEntry = chooseEntryForCell(row, col, activeEntry ? activeEntry.direction : "across");
            }
            selectCell(row, col, requestedEntry);
        }

        function moveWithinEntry(amount) {
            if (!activeEntry || !activeCell) return;
            const currentIndex = activeEntry.cells.findIndex(
                (cell) => cell.row === activeCell.row && cell.col === activeCell.col
            );
            const target = activeEntry.cells[currentIndex + amount];
            if (target) selectCell(target.row, target.col, activeEntry);
        }

        function moveGrid(rowDelta, colDelta) {
            let row = activeCell.row + rowDelta;
            let col = activeCell.col + colDelta;
            while (row >= 0 && row < model.height && col >= 0 && col < model.width) {
                if (model.grid[row][col] !== ".") {
                    selectCell(row, col);
                    return;
                }
                row += rowDelta;
                col += colDelta;
            }
        }

        function jumpEntry(reverse) {
            const currentIndex = allEntries.findIndex((entry) => entry.id === activeEntry.id);
            const offset = reverse ? -1 : 1;
            const target = allEntries[(currentIndex + offset + allEntries.length) % allEntries.length];
            selectCell(target.row, target.col, target);
        }

        function handleKeyDown(event) {
            if (!gameActive) return;
            const input = event.currentTarget;
            if (/^[a-z]$/i.test(event.key)) {
                if (!input.classList.contains("revealed")) {
                    input.value = event.key.toUpperCase();
                    input.classList.remove("correct", "incorrect");
                    if (completeIfSolved()) {
                        event.preventDefault();
                        return;
                    }
                }
                moveWithinEntry(1);
                event.preventDefault();
            } else if (event.key === "Backspace") {
                if (input.classList.contains("revealed")) {
                    moveWithinEntry(-1);
                } else if (input.value) {
                    input.value = "";
                    input.classList.remove("correct", "incorrect");
                } else {
                    moveWithinEntry(-1);
                    const previousInput = getInput(activeCell.row, activeCell.col);
                    if (previousInput && !previousInput.classList.contains("revealed")) {
                        previousInput.value = "";
                        previousInput.classList.remove("correct", "incorrect");
                    }
                }
                event.preventDefault();
            } else if (event.key === "ArrowRight") {
                moveGrid(0, 1);
                event.preventDefault();
            } else if (event.key === "ArrowLeft") {
                moveGrid(0, -1);
                event.preventDefault();
            } else if (event.key === "ArrowUp") {
                moveGrid(-1, 0);
                event.preventDefault();
            } else if (event.key === "ArrowDown") {
                moveGrid(1, 0);
                event.preventDefault();
            } else if (event.key === "Tab") {
                jumpEntry(event.shiftKey);
                event.preventDefault();
            }
        }

        function renderGrid() {
            elements.grid.style.gridTemplateColumns = `repeat(${model.width}, var(--cell-size))`;
            elements.grid.style.gridTemplateRows = `repeat(${model.height}, var(--cell-size))`;
            elements.grid.innerHTML = "";

            for (let row = 0; row < model.height; row += 1) {
                for (let col = 0; col < model.width; col += 1) {
                    const wrapper = documentRef.createElement("div");
                    wrapper.className = "cell-wrapper";
                    wrapper.dataset.cell = cellKey(row, col);
                    wrapper.setAttribute("role", "gridcell");
                    if (model.grid[row][col] === ".") {
                        wrapper.classList.add("black");
                        wrapper.setAttribute("aria-label", "Black square");
                    } else {
                        const details = model.cells.get(cellKey(row, col));
                        const startingEntries = details
                            ? Object.values(details.entries).filter((entry) => entry.row === row && entry.col === col)
                            : [];
                        if (startingEntries.length) {
                            const number = documentRef.createElement("span");
                            number.className = "cell-number";
                            number.textContent = String(startingEntries[0].number);
                            wrapper.appendChild(number);
                        }

                        const input = documentRef.createElement("input");
                        input.className = "cell-input";
                        input.maxLength = 1;
                        input.dataset.answer = model.grid[row][col];
                        input.setAttribute("aria-label", `Row ${row + 1}, column ${col + 1}`);
                        input.addEventListener("keydown", handleKeyDown);
                        input.addEventListener("mousedown", (event) => {
                            event.preventDefault();
                            if (gameActive) handleCellClick(row, col);
                        });
                        wrapper.appendChild(input);
                    }
                    elements.grid.appendChild(wrapper);
                }
            }
        }

        function renderClues() {
            DIRECTIONS.forEach((direction) => {
                const list = documentRef.getElementById(`${direction}-clues`);
                list.innerHTML = "";
                model.entries[direction].forEach((entry) => {
                    const item = documentRef.createElement("li");
                    item.className = "clue-item";
                    item.id = `clue-${entry.id}`;
                    item.textContent = `${entry.number}. ${entry.clue}`;
                    item.addEventListener("click", () => selectCell(entry.row, entry.col, entry));
                    list.appendChild(item);
                });
            });
        }

        function start() {
            gameActive = true;
            elements.overlay.hidden = true;
            elements.cluesWrapper.classList.remove("hidden-clues");
            elements.checkButton.disabled = false;
            elements.revealButton.disabled = false;
            setInputsDisabled(false);
            selectCell(activeEntry.row, activeEntry.col, activeEntry);
            startTimer();
        }

        function finishPuzzle() {
            clearInterval(timerInterval);
            gameActive = false;
            setInputsDisabled(true);
            elements.checkButton.disabled = true;
            elements.revealButton.disabled = true;
            elements.grid.querySelectorAll(".cell-wrapper").forEach((element) => {
                element.classList.remove("active-cell", "highlighted-word");
            });
            documentRef.querySelectorAll(".clue-item").forEach((element) => element.classList.remove("active-clue"));
        }

        function completeIfSolved() {
            const inputs = Array.from(elements.grid.querySelectorAll(".cell-input"));
            const solved = inputs.length > 0 && inputs.every(
                (input) => input.value.toUpperCase() === input.dataset.answer
            );
            if (!solved) return false;

            inputs.forEach((input) => {
                input.classList.remove("incorrect");
                if (!input.classList.contains("revealed")) input.classList.add("correct");
            });
            finishPuzzle();
            return true;
        }

        function check() {
            let allCorrect = true;
            const inputs = elements.grid.querySelectorAll(".cell-input");
            inputs.forEach((input) => {
                const guess = input.value.toUpperCase();
                if (input.classList.contains("revealed")) {
                    input.classList.remove("correct", "incorrect");
                } else if (!guess) {
                    allCorrect = false;
                    input.classList.remove("correct", "incorrect");
                } else if (guess === input.dataset.answer) {
                    input.classList.add("correct");
                    input.classList.remove("incorrect");
                } else {
                    allCorrect = false;
                    input.classList.add("incorrect");
                    input.classList.remove("correct");
                }
            });

            if (allCorrect && inputs.length) {
                finishPuzzle();
            }
        }

        function reveal() {
            if (!gameActive || !activeCell) return;
            const input = getInput(activeCell.row, activeCell.col);
            if (!input) return;

            input.value = input.dataset.answer;
            input.readOnly = true;
            input.classList.remove("correct", "incorrect");
            input.classList.add("revealed");
            input.setAttribute("aria-label", `Row ${activeCell.row + 1}, column ${activeCell.col + 1}, revealed`);
            if (!completeIfSolved()) moveWithinEntry(1);
        }

        function reset() {
            clearInterval(timerInterval);
            gameActive = false;
            timerSeconds = 0;
            updateTimer();
            elements.grid.querySelectorAll(".cell-input").forEach((input) => {
                input.value = "";
                input.readOnly = false;
                input.classList.remove("correct", "incorrect", "revealed");
                const wrapper = input.closest(".cell-wrapper");
                const [row, col] = wrapper.dataset.cell.split(",").map(Number);
                input.setAttribute("aria-label", `Row ${row + 1}, column ${col + 1}`);
            });
            elements.grid.querySelectorAll(".cell-wrapper").forEach((element) => {
                element.classList.remove("active-cell", "highlighted-word");
            });
            documentRef.querySelectorAll(".clue-item").forEach((element) => element.classList.remove("active-clue"));
            activeEntry = allEntries[0];
            activeCell = activeEntry.cells[0];
            setInputsDisabled(true);
            elements.overlay.hidden = false;
            elements.cluesWrapper.classList.add("hidden-clues");
            elements.checkButton.disabled = true;
            elements.revealButton.disabled = true;
        }

        elements.title.textContent = model.title;
        documentRef.title = `${model.title} | The Acronym Crossword`;
        renderGrid();
        renderClues();
        setInputsDisabled(true);
        elements.startButton.addEventListener("click", start);
        elements.checkButton.addEventListener("click", check);
        elements.revealButton.addEventListener("click", reveal);
        elements.resetButton.addEventListener("click", reset);
        elements.game.hidden = false;
        elements.controls.hidden = false;
        elements.message.hidden = true;

        return { start, check, reveal, reset, selectCell };
    }

    async function initialize(windowRef) {
        const documentRef = windowRef.document;
        const message = documentRef.getElementById("message");
        const slug = new URLSearchParams(windowRef.location.search).get("puzzle");
        if (slug && SLUG_PATTERN.test(slug)) {
            const selectedPuzzle = documentRef.querySelector(`[data-puzzle="${slug}"]`);
            if (selectedPuzzle) selectedPuzzle.setAttribute("aria-current", "page");
        }
        if (!slug || !SLUG_PATTERN.test(slug)) {
            message.textContent = "Choose a valid crossword using a puzzle link such as ?puzzle=week1.";
            return;
        }

        try {
            const response = await windowRef.fetch(new URL(`../puzzles/${slug}.json`, windowRef.location.href), {
                cache: "no-store"
            });
            if (!response.ok) {
                if (response.status === 404) throw new Error("This crossword is not available yet.");
                throw new Error("The crossword could not be loaded. Please try again.");
            }
            let data;
            try {
                data = await response.json();
            } catch (error) {
                throw new Error("The crossword file is not valid JSON.");
            }
            createPlayer(documentRef, validatePuzzle(data));
        } catch (error) {
            message.textContent = error instanceof Error ? error.message : "The crossword could not be loaded.";
        }
    }

    if (typeof window !== "undefined" && window.document) {
        window.addEventListener("DOMContentLoaded", () => initialize(window));
    }

    return { SLUG_PATTERN, deriveEntries, validatePuzzle, createPlayer, initialize };
}));
