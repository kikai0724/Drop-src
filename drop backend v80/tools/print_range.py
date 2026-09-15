p=r'c:/Users/iorip/Downloads/bked/drop backend v54/structs/functions.js'
with open(p,encoding='utf8') as f:
    lines=f.readlines()
for idx in range(930, 966):
    print(f"{idx}: {lines[idx-1].rstrip()}")
