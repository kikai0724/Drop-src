p=r'c:/Users/iorip/Downloads/bked/drop backend v54/structs/functions.js'
with open(p,encoding='utf8') as f:
    lines=f.readlines()
count=0
for idx,line in enumerate(lines, start=1):
    for ch in line:
        if ch=='{': count+=1
        elif ch=='}': count-=1
    if count<0:
        print('Negative at line',idx)
        break
else:
    print('End count',count)
