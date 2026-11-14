import os

log_file = r'C:\Users\anusr\AppData\Local\Temp\memurai_silent_test.log'
if os.path.exists(log_file):
    with open(log_file, 'r', encoding='utf-16', errors='ignore') as f:
        lines = f.readlines()
    for i, line in enumerate(lines):
        if 'return value 3' in line.lower():
            start = max(0, i - 10)
            end = min(len(lines), i + 5)
            for j in range(start, end):
                print(f'{j}: {lines[j].strip()}')
            print('---')
