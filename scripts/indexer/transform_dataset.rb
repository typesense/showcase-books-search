# frozen_string_literal: true

require 'dotenv/load'
require 'zlib'
require 'oj'
require 'amazing_print'
require 'date'

BATCH_SIZE = (ENV['BATCH_SIZE'] || 1000).to_i
MAX_BATCHES = (ENV['MAX_BATCHES'] || 200_000).to_i
DATA_FILE = ENV['DATA_FILE'] || './scripts/data/sample_dataset.txt.gz'
AUTHORS_FILE = ENV['AUTHORS_FILE'] || './scripts/data/authors.jsonl'
OUTPUT_FILE = ENV['OUTPUT_FILE'] || './scripts/data/transformed_dataset.json'

def determine_publish_date(parsed_record)
  publish_date = 0
  begin
    publish_date_str = parsed_record['publish_date'].to_s.strip
    unless publish_date_str.empty?
      publish_date_str = "#{publish_date_str}-01-01" if publish_date_str.length == 4 # Only has a year
      publish_date = Date.parse(publish_date_str).to_time.to_i
    end
  rescue Date::Error
    puts "Couldn't parse date #{parsed_record['publish_date']}, setting to 0"
  rescue StandardError => e
    puts "Couldn't parse date #{parsed_record['publish_date']}, setting to 0"
    ap parsed_record
    ap e
    ap e.backtrace.join("\n")
    raise
  end
  publish_date
end

def determine_title(parsed_record)
  title = parsed_record['title'] || (parsed_record['other_titles'] || []).first
  return if title.nil?

  title.to_s +
    (parsed_record['subtitle'].nil? ? '' : " - #{parsed_record['subtitle']}").to_s
end

puts 'Loading authors file'
authors = {}
File.foreach(AUTHORS_FILE) do |line|
  parsed_line = Oj.load(line)
  authors[parsed_line['key']] = parsed_line['name']
end

puts 'Processing records: '

File.open(OUTPUT_FILE, 'w') do |output_file|
  line_number = 0
  gzip_reader = Zlib::GzipReader.new(File.open(DATA_FILE))
  gzip_reader.each_line.each_slice(BATCH_SIZE) do |lines|
    book_records_batch = lines.map do |line|
      line_number += 1
      begin
        fields = line.split("\t")
        next if fields.length < 5 || fields[4].nil? || fields[4].strip.empty?

        parsed_record = Oj.load(fields[4], mode: :compat)
        next if parsed_record.nil? || !parsed_record.is_a?(Hash) || !parsed_record['type'].is_a?(Hash)
        
        record_type = parsed_record['type']['key']
        next unless record_type == '/type/edition'

        publish_date = determine_publish_date(parsed_record)
        title = determine_title(parsed_record)

        if title.nil?
          puts 'Skipping record with no title...'
          ap parsed_record
          puts line
          next
        end

        {
          'id' => parsed_record['key'],
          'title' => title,
          'isbn_10' => (parsed_record['isbn_10'] || []).first,
          'publish_date' => publish_date,
          'subjects' => parsed_record['subjects'] || [],
          'author' => (parsed_record['authors'] || []).map { |a| authors[a['key']] }.compact.first
        }.compact
      rescue StandardError => e
        puts "Error processing line #{line_number}: #{e.message}"
        puts "Record: #{line}"
        nil
      end
    end.compact

    jsonl_string = book_records_batch.map { |r| Oj.dump(r) }.join("\n")
    output_file.write("#{jsonl_string}\n") unless jsonl_string.empty?

    puts "Processed lines upto #{line_number} ✅"

    break if line_number >= MAX_BATCHES * BATCH_SIZE
  end
end
