import re
p=r'c:/Users/iorip/Downloads/bked/drop backend v54/structs/functions.js'
s=open(p,encoding='utf8').read()
# remove block comments
s=re.sub(r'/\*.*?\*/','',s,flags=re.S)
# remove line comments
s=re.sub(r'//.*','',s)
# remove strings
s=re.sub(r"'(?:\\.|[^'\\])*'", "'" ,s)
s=re.sub(r'\"(?:\\.|[^\\"])*\"', '"', s)
s=re.sub(r'`(?:\\.|[^`\\])*`', '`', s)
# find try/catch tokens with line numbers
tokens=[]
for m in re.finditer(r'\b(try|catch|finally)\b',s):
    line = s.count('\n',0,m.start())+1
    tokens.append((line,m.group(1)))
for t in tokens:
    print(t)
print('Totals try',sum(1 for _,tok in tokens if tok=='try'), 'catch', sum(1 for _,tok in tokens if tok=='catch'), 'finally', sum(1 for _,tok in tokens if tok=='finally'))
