import re
p=r'c:/Users/iorip/Downloads/bked/drop backend v54/structs/functions.js'
s=open(p,encoding='utf8').read()
# remove comments and strings roughly
s=re.sub(r'/\*.*?\*/','',s,flags=re.S)
s=re.sub(r'//.*','',s)
s=re.sub(r"'(?:\\.|[^'\\])*'", "'", s)
s=re.sub(r'\"(?:\\.|[^\\"])*\"', '"', s)
s=re.sub(r'`(?:\\.|[^`\\])*`', '`', s)

tokens=[]
for m in re.finditer(r'\b(try|catch|finally)\b',s):
    tokens.append((s.count('\n',0,m.start())+1, m.group(1)))

stack=[]
for ln,tok in tokens:
    if tok=='try':
        stack.append((ln,tok))
    else:
        if stack:
            stack.pop()
        else:
            print('Unmatched',tok,'at',ln)

if stack:
    print('Unmatched try(s) remain:')
    for ln,_ in stack:
        print(' try at',ln)
else:
    print('All paired')
