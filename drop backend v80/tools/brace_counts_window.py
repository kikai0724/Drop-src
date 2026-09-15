p=r'c:/Users/iorip/Downloads/bked/drop backend v54/structs/functions.js'
with open(p,encoding='utf8') as f:
    lines=f.readlines()
start=1060
end=1120
count=0
for idx,line in enumerate(lines, start=1):
    if idx<start: 
        for ch in line:
            if ch=='{': count+=1
            elif ch=='}': count-=1
        continue
    if idx> end: break
    for ch in line:
        if ch=='{': count+=1
        elif ch=='}': count-=1
    print(idx, count, line.rstrip())
print('final',count)
