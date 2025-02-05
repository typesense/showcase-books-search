# frozen_string_literal: true

require 'dotenv/load'
require 'zlib'
require 'oj'
require 'amazing_print'

BATCH_SIZE = (ENV['BATCH_SIZE'] || 1000).to_i
MAX_BATCHES = (ENV['MAX_BATCHES'] || 200_000).to_i
DATA_FILE = ENV['DATA_FILE'] || './scripts/data/sample_dataset.txt.gz'
OUTPUT_FILE = ENV['OUTPUT_FILE'] || './scripts/data/authors.jsonl'

puts 'Processing records: '

File.open(OUTPUT_FILE, 'w') do |output_file|
  line_number = 0
  gzip_reader = Zlib::GzipReader.new(File.open(DATA_FILE))
  gzip_reader.each_line.each_slice(BATCH_SIZE) do |lines|
    authors_records_batch = lines.map do |line|
      line_number += 1
      begin
        fields = line.split("\t")
        next if fields.length < 5 || fields[4].nil? || fields[4].strip.empty?
        
        parsed_record = Oj.load(fields[4])
        record_type = parsed_record['type']['key']
        record_key = parsed_record['key']
        record_name = parsed_record['name']

        next unless record_type == '/type/author'

        {
          'key' => record_key,
          'name' => record_name
        }
      rescue => e
        puts "Error processing line #{line_number}: #{e.message}"
        nil
      end
    end.compact

    jsonl_string = authors_records_batch.map { |r| Oj.dump(r) }.join("\n")
    output_file.write("#{jsonl_string}\n") unless jsonl_string.empty?

    puts "Processed lines upto #{line_number} ✅"

    break if line_number >= MAX_BATCHES * BATCH_SIZE
  end
end
