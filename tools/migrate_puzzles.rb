#!/usr/bin/env ruby

require "json"

ROOT = File.expand_path("..", __dir__)
PUZZLES_DIR = File.join(ROOT, "puzzles")
FORCE = ARGV.delete("--force")

def source_for(week)
  return File.join(ROOT, "week1.2.html") if week == 2

  File.join(ROOT, "week#{week}.html")
end

def extract_grid(html, source)
  block = html[/const\s+puzzleData\s*=\s*\[(.*?)\];/m, 1]
  raise "#{source}: puzzleData was not found" unless block

  rows = block.lines.each_with_object([]) do |line, result|
    cells = line.scan(/"([^"]*)"/).flatten
    next if cells.empty?

    result << cells.map { |cell| cell == " " ? "." : cell.upcase }.join
  end

  raise "#{source}: grid is empty" if rows.empty?
  raise "#{source}: grid is not rectangular" unless rows.map(&:length).uniq.length == 1
  raise "#{source}: grid contains invalid cells" unless rows.all? { |row| row.match?(/\A[A-Z.]+\z/) }

  rows
end

def decode_javascript_string(value)
  JSON.parse(%("#{value}"))
end

def extract_clues(html, direction, source)
  block = if direction == "across"
    html[/across\s*:\s*\[(.*?)\]\s*,\s*down\s*:/m, 1]
  else
    html[/down\s*:\s*\[(.*?)\]\s*\}\s*;/m, 1]
  end
  raise "#{source}: #{direction} clue block was not found" unless block

  clues = block.scan(/\btext\s*:\s*"((?:\\.|[^"])*)"/m).flatten.map do |text|
    decode_javascript_string(text)
  end
  raise "#{source}: #{direction} clues are empty" if clues.empty?

  clues
end

def entry_counts(grid)
  height = grid.length
  width = grid.first.length
  open_cell = lambda do |row, col|
    row >= 0 && row < height && col >= 0 && col < width && grid[row][col] != "."
  end
  counts = { "across" => 0, "down" => 0 }

  height.times do |row|
    width.times do |col|
      next unless open_cell.call(row, col)

      if !open_cell.call(row, col - 1) && open_cell.call(row, col + 1)
        counts["across"] += 1
      end
      if !open_cell.call(row - 1, col) && open_cell.call(row + 1, col)
        counts["down"] += 1
      end
    end
  end

  counts
end

Dir.mkdir(PUZZLES_DIR) unless Dir.exist?(PUZZLES_DIR)

(2..36).each do |week|
  source = source_for(week)
  destination = File.join(PUZZLES_DIR, "week#{week}.json")
  if File.exist?(destination) && !FORCE
    puts "Skipped Week #{week}: #{destination} already exists"
    next
  end
  raise "Missing source for Week #{week}: #{source}" unless File.file?(source)

  html = File.read(source)
  grid = extract_grid(html, source)
  clues = {
    "across" => extract_clues(html, "across", source),
    "down" => extract_clues(html, "down", source)
  }
  counts = entry_counts(grid)

  clues.each do |direction, clue_list|
    next if clue_list.length == counts.fetch(direction)

    raise "#{source}: expected #{counts.fetch(direction)} #{direction} clues, found #{clue_list.length}"
  end

  puzzle = {
    "title" => "Week #{week}",
    "grid" => grid,
    "clues" => clues
  }
  File.write(destination, JSON.pretty_generate(puzzle) + "\n")
  puts "Migrated Week #{week}: #{counts['across']} across, #{counts['down']} down"
end
