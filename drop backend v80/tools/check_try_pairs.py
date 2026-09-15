import re
p=r'c:/Users/iorip/Downloads/bked/drop backend v54/structs/functions.js'
s=open(p,encoding='utf8').read()
lines=s.splitlines()
for i,l in enumerate(lines, start=1):
    if re.search(r'\btry\s*\{', l):
        found=False
        for j in range(i, min(i+60, len(lines))):
            if re.search(r'\b(catch|finally)\b', lines[j-1]):
                found=True
                break
        if not found:
            print('Try at',i,'has no catch/finally in next 60 lines')
